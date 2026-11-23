/**
 * Mahiru Shiina • Mahiru v2.0 ULTRA — Matryoshka Int8 Vector Memory & Knowledge Graph
 * Tuned for 256MB RAM (Zero Buffer-Slab Pinning, Compact Atomic JSON, Bounded LRU Caches, RAM Guard)
 * 100% Backward-Compatible Exports + Secret/OTP/PIN Privacy Shield + SystemOptimizer Hook
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
    loadJson,
    getKeysByFamily,
    getLiveModelsForFamily,
    normalizeBn
} = require('./mayaCore');

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

const GRAPH_FILE = path.join(process.cwd(), 'data', 'maya_vector_graph.json');
const EMBED_DIM = 256;

// ২৫৬MB RAM প্রোফাইল লিমিট (হাই-ভ্যালু স্মৃতি ও নলেজ গ্রাফ অক্ষত রেখে মেমোরি নিয়ন্ত্রণ)
const MAX_MEMORIES_PER_USER = 45;
const MAX_GLOBAL_USERS = 160;
const RECALL_TIMEOUT_MS = 1300;
const MAX_DECODE_CACHE = 160;
const MAX_QUERY_CACHE = 40;
const MAX_COOLDOWN_ENTRIES = 60;
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const RAM_EMBED_BACKFILL_GUARD_MB = 205;
const SAVE_DEBOUNCE_MS = 5000;

function getRssMb() {
    return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

const rawGraph = loadJson(GRAPH_FILE, {});
let graphStore = {
    version: '2.0',
    users: rawGraph?.users && typeof rawGraph.users === 'object' ? rawGraph.users : Object.create(null),
    stats: {
        totalIngested: Number(rawGraph?.stats?.totalIngested || 0),
        totalRecalls: Number(rawGraph?.stats?.totalRecalls || 0),
        lastCompressedAt: Number(rawGraph?.stats?.lastCompressedAt || 0)
    }
};

// RAM-সেফ বাউন্ডেড ক্যাশ, কুলডাউন ও রাউন্ড-রবিন কার্সার
const vectorDecodeCache = new Map(); // b64 -> dedicated 256-byte Int8Array
const queryEmbedCache = new Map();   // key -> { int8, float (optional), ts }
const inFlightEmbeds = new Map();
const embedCooldowns = new Map();

let embedKeyCursor = 0;
let embedCacheHits = 0;
let avgEmbedMs = 0;
let saveTimer = null;
let isDirty = false;

// কম্প্যাক্ট অ্যাটমিক রাইটার (প্রিটি-প্রিন্টের চেয়ে ~৪৫% কম RAM ও ডিস্ক স্পাইক)
function writeGraphAtomicSync() {
    let tmp = '';
    try {
        fs.mkdirSync(path.dirname(GRAPH_FILE), { recursive: true });
        tmp = `${GRAPH_FILE}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        fs.writeFileSync(tmp, JSON.stringify(graphStore), 'utf8');
        fs.renameSync(tmp, GRAPH_FILE);
        isDirty = false;
        return true;
    } catch (err) {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        console.error('❌ [VectorGraph] Save error:', err?.message || err);
        return false;
    }
}

function persistGraph(immediate = false) {
    isDirty = true;
    if (immediate) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        writeGraphAtomicSync();
        return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        if (isDirty) writeGraphAtomicSync();
    }, SAVE_DEBOUNCE_MS);
    if (saveTimer.unref) saveTimer.unref();
}

function flushGraph() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (isDirty) return writeGraphAtomicSync();
    return false;
}

function isEmbedSlotReady(slotKey) {
    const until = embedCooldowns.get(slotKey) || 0;
    if (until <= Date.now()) {
        if (until) embedCooldowns.delete(slotKey);
        return true;
    }
    return false;
}

function cooldownEmbedSlot(slotKey, ms) {
    if (embedCooldowns.size >= MAX_COOLDOWN_ENTRIES && !embedCooldowns.has(slotKey)) {
        const now = Date.now();
        for (const [k, v] of embedCooldowns.entries()) {
            if (v <= now) embedCooldowns.delete(k);
        }
        if (embedCooldowns.size >= MAX_COOLDOWN_ENTRIES) {
            embedCooldowns.delete(embedCooldowns.keys().next().value);
        }
    }
    embedCooldowns.set(slotKey, Date.now() + ms);
}

function parseRetryAfterMs(res, fallbackMs = 45000) {
    try {
        const hdr = res?.headers?.get?.('retry-after');
        if (!hdr) return fallbackMs;
        const sec = Number(hdr);
        if (Number.isFinite(sec) && sec > 0) return Math.min(Math.max(sec * 1000, 15000), 10 * 60 * 1000);
    } catch {}
    return fallbackMs;
}

function rotateArray(list, cursor) {
    if (!list.length) return [];
    const shift = cursor % list.length;
    return [...list.slice(shift), ...list.slice(0, shift)];
}

function clearVectorCaches() {
    vectorDecodeCache.clear();
    queryEmbedCache.clear();
    const now = Date.now();
    for (const [k, v] of embedCooldowns.entries()) {
        if (v <= now) embedCooldowns.delete(k);
    }
}

// ==================================================
// ১. জিরো-স্ল্যাব-পিনিং Matryoshka ২৫৬-ডাইমেনশন Int8 কোয়ান্টাইজেশন
// ==================================================
function quantizeToInt8(floatArr) {
    if (!Array.isArray(floatArr) || floatArr.length < EMBED_DIM) return null;

    let normSq = 0;
    for (let i = 0; i < EMBED_DIM; i++) {
        const v = Number(floatArr[i]) || 0;
        normSq += v * v;
    }
    const norm = Math.sqrt(normSq);
    if (!norm) return null;

    const int8 = new Int8Array(EMBED_DIM);
    for (let i = 0; i < EMBED_DIM; i++) {
        const val = Math.round(((Number(floatArr[i]) || 0) / norm) * 127);
        int8[i] = val > 127 ? 127 : val < -127 ? -127 : val;
    }
    return int8;
}

function int8ToBase64(int8) {
    if (!int8 || int8.length !== EMBED_DIM) return '';
    return Buffer.from(int8.buffer, int8.byteOffset, int8.byteLength).toString('base64');
}

function quantizeToBase64(floatArr) {
    const int8 = quantizeToInt8(floatArr);
    return int8 ? int8ToBase64(int8) : '';
}

function decodeBase64Vector(b64) {
    if (!b64) return null;
    if (vectorDecodeCache.has(b64)) {
        const hit = vectorDecodeCache.get(b64);
        vectorDecodeCache.delete(b64);
        vectorDecodeCache.set(b64, hit);
        return hit;
    }
    try {
        const buf = Buffer.from(b64, 'base64');
        if (buf.byteLength !== EMBED_DIM) return null;
        // ডেডিকেটেড ২৫৬-বাইট Int8Array কপি (Node-এর 8KB slab মেমোরি পিন না করার জন্য!)
        const int8 = new Int8Array(EMBED_DIM);
        for (let i = 0; i < EMBED_DIM; i++) {
            int8[i] = buf.readInt8(i);
        }
        vectorDecodeCache.set(b64, int8);
        if (vectorDecodeCache.size > MAX_DECODE_CACHE) {
            vectorDecodeCache.delete(vectorDecodeCache.keys().next().value);
        }
        return int8;
    } catch {
        return null;
    }
}

function cosineSimilarityInt8(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        dot += x * y;
        normA += x * x;
        normB += y * y;
    }
    const denom = Math.sqrt(normA * normB);
    return denom ? dot / denom : 0;
}

// ==================================================
// ২. বাংলা + বাংলিশ টোকেনাইজার, নয়েজ গেট ও প্রাইভেসি সিক্রেট শিল্ড
// ==================================================
const STOP_WORDS = new Set([
    'আমি', 'তুমি', 'আপনি', 'তুই', 'সে', 'ও', 'এটা', 'ওটা', 'কি', 'কী', 'না', 'হ্যাঁ', 'জ্বী',
    'আর', 'এবং', 'কিন্তু', 'তো', 'যে', 'একটা', 'এই', 'সেই', 'করে', 'করো', 'আছি', 'আছো', 'আছেন',
    'হলো', 'হল', 'আমার', 'তোমার', 'আপনার', 'তোর', 'ওর', 'তার', 'থেকে', 'জন্য', 'দিয়ে', 'নিয়ে',
    'ok', 'okay', 'hm', 'hmm', 'hmmm', 'ha', 'haa', 'ji', 'hi', 'hello', 'hey', 'bro', 'vai',
    'the', 'is', 'am', 'are', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'my', 'your'
]);

const SYNONYM_MAP = {
    phone: 'ফোন', mobile: 'ফোন', device: 'ফোন', model: 'মডেল',
    price: 'দাম', cost: 'দাম', budget: 'বাজেট', taka: 'টাকা', tk: 'টাকা', bdt: 'টাকা',
    root: 'রুট', website: 'ওয়েবসাইট', site: 'ওয়েবসাইট', app: 'অ্যাপ', bot: 'বট', project: 'প্রজেক্ট',
    home: 'বাসা', basha: 'বাসা', location: 'লোকেশন', address: 'ঠিকানা', dhaka: 'ঢাকা',
    name: 'নাম', nam: 'নাম', exam: 'পরীক্ষা', birthday: 'জন্মদিন', work: 'কাজ', kaj: 'কাজ',
    game: 'গেম', love: 'ভালোবাসা', friend: 'বন্ধু', error: 'এরর', problem: 'সমস্যা',
    sim: 'সিম', config: 'কনফিগ', vpn: 'ভিপিএন'
};

const NOISE_ONLY_REGEX = /^(?:ok+|okay+|hm+|ha+|haa+|ji+|hi+|hello+|hey+|bye+|gn|gm|tnx|thanks|ধন্যবাদ|আচ্ছা|ঠিক আছে|ওকে|হুম+|হ্যাঁ+|জ্বী+|না+|👍+|❤️+|😂+|😊+|কি করো|কী করো|ki koro|কেমন আছো?|kemon acho?)$/i;
const PLACEHOLDER_ONLY_REGEX = /^\[(?:ভয়েস মেসেজ পাওয়া গেছে|একটি স্টিকার পাঠিয়েছে|একটি ছবি\/স্ক্রিনশট পাঠিয়েছে|একটি ভিডিও পাঠিয়েছে)[^\]]*\]$/i;

// গোপন ডেটা (পাসওয়ার্ড, পিন, OTP, API কী) কখনোই মেমোরি গ্রাফে সেভ হতে দেবে না
const SENSITIVE_SECRET_RE = /(?:AIza[0-9A-Za-z\-_]{25,}|gsk_[0-9A-Za-z]{20,}|sk-or-v1-[0-9a-f]{20,}|(?:password|পাসওয়ার্ড|পাসওয়ার্ড|bkash\s*pin|বিকাশ\s*পিন|নগদ\s*পিন|\botp\b|ওটিপি|মাস্টার\s*পিন|secret\s*key|api\s*key)\s*(?:হলো|হল|is|:|=)?\s*\S{3,})/i;

function containsSensitiveSecret(text = '') {
    return SENSITIVE_SECRET_RE.test(String(text || ''));
}

function isNoisyMessage(text = '') {
    const clean = normalizeBn(text).replace(/\s+/g, ' ').trim();
    if (clean.length < 5) return true;
    if (NOISE_ONLY_REGEX.test(clean)) return true;
    if (PLACEHOLDER_ONLY_REGEX.test(clean)) return true;
    return false;
}

function tokenizeText(text = '') {
    const clean = normalizeBn(text).toLowerCase();
    const matches = clean.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
    const tokens = [];
    for (const raw of matches) {
        if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
        tokens.push(SYNONYM_MAP[raw] || raw);
    }
    return tokens;
}

function lexicalSimilarity(queryTokens, docText) {
    if (!queryTokens.length || !docText) return 0;
    const docTokens = new Set(tokenizeText(docText));
    if (!docTokens.size) return 0;

    let hits = 0;
    for (const qt of queryTokens) {
        if (docTokens.has(qt)) {
            hits += 1;
        } else if (qt.length >= 4) {
            for (const dt of docTokens) {
                if (dt.startsWith(qt) || qt.startsWith(dt)) {
                    hits += 0.65;
                    break;
                }
            }
        }
    }
    return hits / Math.sqrt(queryTokens.length * Math.max(docTokens.size, 3));
}

function formatRelativeBnTime(ts = 0) {
    if (!ts) return '';
    const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (diffMin < 10) return 'এইমাত্র';
    if (diffMin < 60) return `${diffMin} মিনিট আগে`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ঘণ্টা আগে`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} দিন আগে`;
    return `${Math.floor(diffDay / 30)} মাস আগে`;
}

// ==================================================
// ৩. অপশনাল সুপাবেস ক্লাউড pgvector ব্রিজ
// ==================================================
function getSupabaseConfig() {
    const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const key = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    return url && key ? { url, key } : null;
}

async function syncToSupabase(chatKey, content, floatVector, importance) {
    const sb = getSupabaseConfig();
    if (!sb || !floatVector) return;
    try {
        await fetch(`${sb.url}/rest/v1/maya_memories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: sb.key,
                Authorization: `Bearer ${sb.key}`,
                Prefer: 'return=minimal'
            },
            body: JSON.stringify({
                chat_key: String(chatKey),
                content: content.slice(0, 450),
                embedding: floatVector.slice(0, EMBED_DIM),
                importance
            }),
            signal: AbortSignal.timeout(4000)
        });
    } catch {}
}

async function querySupabaseVectors(chatKey, floatVector, matchCount = 4) {
    const sb = getSupabaseConfig();
    if (!sb || !floatVector) return [];
    try {
        const res = await fetch(`${sb.url}/rest/v1/rpc/match_maya_memories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: sb.key,
                Authorization: `Bearer ${sb.key}`
            },
            body: JSON.stringify({
                query_embedding: floatVector.slice(0, EMBED_DIM),
                target_chat_key: String(chatKey),
                match_threshold: 0.45,
                match_count: matchCount
            }),
            signal: AbortSignal.timeout(RECALL_TIMEOUT_MS)
        });
        if (!res.ok) return [];
        const rows = await res.json();
        return Array.isArray(rows)
            ? rows.map((r) => ({ text: r.content, score: r.similarity || 0.72, ts: Date.now() }))
            : [];
    } catch {
        return [];
    }
}

// ==================================================
// ৪. রাউন্ড-রবিন + ইন-ফ্লাইট ডিডুপ + Int8 ক্যাশড এমবেডিং ইঞ্জিন
// ==================================================
async function fetchGeminiEmbedding(text, timeoutMs = RECALL_TIMEOUT_MS) {
    const clipped = normalizeBn(text).replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!clipped) return null;

    const cacheKey = clipped.toLowerCase();
    const cached = queryEmbedCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < QUERY_CACHE_TTL_MS) {
        embedCacheHits += 1;
        return cached;
    }

    if (inFlightEmbeds.has(cacheKey)) {
        return inFlightEmbeds.get(cacheKey);
    }

    const gemKeys = rotateArray(getKeysByFamily('gemini'), embedKeyCursor);
    embedKeyCursor = (embedKeyCursor + 1) % 10000;
    if (!gemKeys.length) return null;

    const needFloat = Boolean(getSupabaseConfig());

    const job = (async () => {
        const discovered = await getLiveModelsForFamily('gemini', 'embed');
        const embedModels = Array.from(new Set([...discovered, 'gemini-embedding-001', 'text-embedding-004']));

        for (const g of gemKeys) {
            if (!isEmbedSlotReady(`key:${g.id}`)) continue;

            for (const model of embedModels) {
                const slotKey = `em:${g.id}:${model}`;
                if (!isEmbedSlotReady(slotKey)) continue;

                const started = Date.now();
                try {
                    const res = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': g.key },
                            body: JSON.stringify({
                                model: `models/${model}`,
                                content: { parts: [{ text: clipped }] },
                                outputDimensionality: EMBED_DIM
                            }),
                            signal: AbortSignal.timeout(timeoutMs)
                        }
                    );

                    if (res.ok) {
                        const data = await res.json();
                        const values = data?.embedding?.values;
                        if (Array.isArray(values) && values.length >= EMBED_DIM) {
                            const int8 = quantizeToInt8(values);
                            if (!int8) continue;

                            const ms = Date.now() - started;
                            avgEmbedMs = avgEmbedMs ? Math.round(avgEmbedMs * 0.75 + ms * 0.25) : ms;

                            // ২৫৬MB RAM: Supabase না থাকলে ভারী Float64 অ্যারে ক্যাশে রাখবে না (৮ গুণ RAM সাশ্রয়)
                            const entry = {
                                int8,
                                float: needFloat ? values.slice(0, EMBED_DIM) : null,
                                ts: Date.now()
                            };
                            queryEmbedCache.set(cacheKey, entry);
                            if (queryEmbedCache.size > MAX_QUERY_CACHE) {
                                queryEmbedCache.delete(queryEmbedCache.keys().next().value);
                            }
                            return entry;
                        }
                    } else {
                        if ([401, 403].includes(res.status)) {
                            cooldownEmbedSlot(`key:${g.id}`, 30 * 60 * 1000);
                            break;
                        }
                        if (res.status === 404) {
                            cooldownEmbedSlot(slotKey, 6 * 60 * 60 * 1000);
                            continue;
                        }
                        if (res.status === 429) {
                            cooldownEmbedSlot(slotKey, parseRetryAfterMs(res, 45 * 1000));
                            break;
                        }
                        cooldownEmbedSlot(slotKey, 20 * 1000);
                    }
                } catch {
                    cooldownEmbedSlot(slotKey, 25 * 1000);
                    break;
                }
            }
        }
        return null;
    })().finally(() => {
        inFlightEmbeds.delete(cacheKey);
    });

    inFlightEmbeds.set(cacheKey, job);
    return job;
}

// ==================================================
// ৫. বাংলা + বাংলিশ নলেজ গ্রাফ ও কনফ্লিক্ট রিজলভার
// ==================================================
const NEGATIVE_GUARD = /^(না|নাই|নেই|নয়|কি|কী|কেন|কেমন|কোনো|কিছুই|এখন|একটু|no|not|none|nothing|ok|yes|হ্যাঁ|জ্বী)$/i;

const GRAPH_EXTRACTORS = [
    { rel: 'নাম', regex: /(?:আমার\s*নাম|amr\s*nam|amar\s*nam|my\s*name\s*is)\s*(?:হলো|হল|:)?\s*([\p{L}\p{M}]{2,22})/iu },
    { rel: 'ফোন', regex: /(?:আমার\s*ফোন|ফোন\s*মডেল|amr\s*phone|amar\s*phone|phone\s*model|my\s*phone\s*is|ফোনটা|device)\s*(?:হলো|হল|হচ্ছে|is|:)?\s*([a-zA-Z0-9\s\-+]{3,28})/i },
    { rel: 'সিম', regex: /(?:আমার\s*সিম|সিম\s*(?:হলো|হল|ইউজ\s*করি)|amr\s*sim|sim\s*is)\s*(?:হলো|হল|:)?\s*(gp|grameenphone|গ্রামীণফোন|robi|রবি|airtel|এয়ারটেল|banglalink|বাংলালিংক|teletalk|টেলিটক|skitto|স্কিটো)/iu },
    { rel: 'লোকেশন', regex: /(?:আমার\s*বাসা|আমি\s*থাকি|amr\s*basha|ami\s*thaki|বাড়ি|থাকি\s*হলো|i\s*live\s*in|i\s*am\s*from)\s*(?:হলো|হল|in|:)?\s*([\p{L}\p{M}a-zA-Z\s]{3,24})/iu },
    { rel: 'কাজ/প্রজেক্ট', regex: /(?:বানাতে\s*চাই|করতে\s*চাই|কাজ\s*হলো|প্রজেক্ট|banate\s*chai|need\s*a|want\s*a)\s+([\p{L}\p{M}a-zA-Z0-9\s\-]{3,35})/iu },
    { rel: 'বাজেট', regex: /(?:বাজেট|budget|দাম|টাকা)\s*(?:হলো|আছে|is|:)?\s*([0-9০-৯,\s]{2,14}\s*(?:টাকা|tk|bdt|ডলার|\$)?)/i },
    { rel: 'পেশা/পড়াশোনা', regex: /(?:আমি\s*পড়ি|ক্লাস|চাকরি\s*করি|কাজ\s*করি|ami\s*pori|i\s*study|i\s*work\s*at)\s+([\p{L}\p{M}a-zA-Z0-9\s]{3,26})/iu },
    { rel: 'পছন্দ', regex: /(?:আমার\s*পছন্দ|ভালো\s*লাগে|favorite|favourite)\s*(?:হলো|হল|is|:)?\s*([\p{L}\p{M}a-zA-Z0-9\s]{3,26})/iu },
    { rel: 'তারিখ/ইভেন্ট', regex: /(?:পরীক্ষা|জন্মদিন|মিটিং|ভ্রমণ|exam|birthday|meeting)\s*(?:হলো|আছে|on|is|:)?\s*([\p{L}\p{M}a-zA-Z0-9\s\-/]{3,24})/iu }
];

function ensureUserBucket(chatKey) {
    const key = String(chatKey);
    if (!graphStore.users[key]) {
        graphStore.users[key] = { entities: {}, memories: [], lastActiveAt: Date.now() };
    }
    const bucket = graphStore.users[key];
    if (!bucket.entities || typeof bucket.entities !== 'object') bucket.entities = {};
    if (!Array.isArray(bucket.memories)) bucket.memories = [];
    bucket.lastActiveAt = Date.now();
    return bucket;
}

function updateKnowledgeGraph(bucket, userText) {
    let changed = false;
    const clean = normalizeBn(userText);

    for (const rule of GRAPH_EXTRACTORS) {
        const m = clean.match(rule.regex);
        if (!m || !m[1]) continue;

        const val = m[1].split(/[.,!?\n]|(?:\s+(?:না|নাই|কিন্তু|আর|ভাই|রে|তো)\b)/iu)[0].trim();
        if (val.length < 2 || NEGATIVE_GUARD.test(val) || containsSensitiveSecret(val)) continue;

        const existing = bucket.entities[rule.rel];
        if (!existing) {
            bucket.entities[rule.rel] = { value: val, updatedAt: Date.now(), history: [] };
            changed = true;
        } else if (existing.value.toLowerCase() !== val.toLowerCase()) {
            if (!Array.isArray(existing.history)) existing.history = [];
            existing.history.push({ old: existing.value, replacedAt: Date.now() });
            if (existing.history.length > 2) existing.history = existing.history.slice(-2);
            existing.value = val;
            existing.updatedAt = Date.now();
            changed = true;
        }
    }
    return changed;
}

function computeImportance(text = '', role = 'auto', graphUpdated = false) {
    let score = 0.45;
    if (graphUpdated) score += 0.2;
    if (text.length > 45) score += 0.12;
    if (/(টাকা|বাজেট|প্রজেক্ট|রুট|ওয়েবসাইট|অ্যাপ|জরুরি|ভালোবাসি|জন্মদিন|পরীক্ষা|ফোন|মডেল|ঠিকানা|কাজ|ডিল|অর্ডার|সার্ভার|কনফিগ)/i.test(text)) {
        score += 0.28;
    }
    if (role === 'client' || role === 'gf' || role === 'family') score += 0.1;
    return Math.min(1, Number(score.toFixed(2)));
}

async function backfillOneUnvectorized(bucket) {
    if (getRssMb() >= RAM_EMBED_BACKFILL_GUARD_MB) return;
    const missing = (bucket.memories || []).slice().reverse().find((m) => !m.vec && m.text);
    if (!missing) return;
    const emb = await fetchGeminiEmbedding(missing.text, 2200);
    if (emb?.int8) {
        missing.vec = int8ToBase64(emb.int8);
        persistGraph(false);
    }
}

function pruneUserMemories(bucket) {
    if (!Array.isArray(bucket?.memories)) return;
    const now = Date.now();
    bucket.memories.sort((a, b) => {
        const ageDaysA = (now - (a.ts || now)) / (86400 * 1000);
        const ageDaysB = (now - (b.ts || now)) / (86400 * 1000);
        const scoreA = (a.imp || 0.5) + Math.min(0.25, (a.hits || 0) * 0.05) - ageDaysA * 0.01;
        const scoreB = (b.imp || 0.5) + Math.min(0.25, (b.hits || 0) * 0.05) - ageDaysB * 0.01;
        return scoreB - scoreA;
    });
    bucket.memories = bucket.memories.slice(0, Math.floor(MAX_MEMORIES_PER_USER * 0.85));
}

function enforceGlobalLimits(protectedKey = '') {
    let mutated = false;
    const userKeys = Object.keys(graphStore.users);

    for (const k of userKeys) {
        const b = graphStore.users[k];
        if (!b || typeof b !== 'object') {
            delete graphStore.users[k];
            mutated = true;
            continue;
        }
        if (Array.isArray(b.memories) && b.memories.length > MAX_MEMORIES_PER_USER) {
            pruneUserMemories(b);
            mutated = true;
        }
    }

    const activeKeys = Object.keys(graphStore.users);
    if (activeKeys.length > MAX_GLOBAL_USERS) {
        activeKeys.sort((a, b) => (graphStore.users[a]?.lastActiveAt || 0) - (graphStore.users[b]?.lastActiveAt || 0));
        let dropCount = activeKeys.length - MAX_GLOBAL_USERS;
        for (const k of activeKeys) {
            if (dropCount <= 0) break;
            if (k === protectedKey) continue;
            delete graphStore.users[k];
            dropCount--;
            mutated = true;
        }
    }
    return mutated;
}

// বুটেই পুরোনো ওভারসাইজ গ্রাফ ২৫৬MB লিমিটে আনা
if (enforceGlobalLimits()) {
    persistGraph(false);
}

// ==================================================
// ৬. প্রাইভেসি-সেফ স্মার্ট ইনজেশন + নিয়ার-ডুপ্লিকেট ডিটেকশন
// ==================================================
async function ingestInteraction(chatKey, userText = '', botReply = '', meta = {}) {
    try {
        if (!chatKey || isNoisyMessage(userText)) return false;

        // গোপন তথ্য (OTP / PIN / Password / API Key) কখনোই ভেক্টর গ্রাফে সংরক্ষণ হবে না
        if (containsSensitiveSecret(userText) || containsSensitiveSecret(botReply)) {
            return false;
        }

        const bucket = ensureUserBucket(chatKey);
        const graphUpdated = updateKnowledgeGraph(bucket, userText);

        const cleanUser = normalizeBn(userText)
            .replace(/\[রিপ্লাই করা আগের মেসেজ:[^\]]*\]\s*/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220);

        if (isNoisyMessage(cleanUser)) {
            if (graphUpdated) persistGraph(false);
            return graphUpdated;
        }

        const cleanBot = normalizeBn(botReply).replace(/\s+/g, ' ').trim().slice(0, 150);
        const memoryLine = cleanBot ? `ইউজার: ${cleanUser} | মাহিরু: ${cleanBot}` : `ইউজার: ${cleanUser}`;

        const hash = crypto.createHash('md5').update(cleanUser.toLowerCase()).digest('hex').slice(0, 10);
        const exactDup = bucket.memories.find((m) => m.id === hash);
        if (exactDup) {
            exactDup.ts = Date.now();
            exactDup.hits = (exactDup.hits || 0) + 1;
            if (graphUpdated) persistGraph(false);
            return false;
        }

        const uTokens = tokenizeText(cleanUser);
        if (uTokens.length >= 3) {
            const nearDup = bucket.memories.slice(-10).find((m) => lexicalSimilarity(uTokens, m.text) > 0.85);
            if (nearDup) {
                nearDup.ts = Date.now();
                nearDup.hits = (nearDup.hits || 0) + 1;
                if (graphUpdated) persistGraph(false);
                return false;
            }
        }

        const importance = computeImportance(cleanUser, meta.role, graphUpdated);
        const lowRam = getRssMb() >= RAM_EMBED_BACKFILL_GUARD_MB;
        const emb = lowRam ? null : await fetchGeminiEmbedding(memoryLine, 3000);
        const vecB64 = emb?.int8 ? int8ToBase64(emb.int8) : '';

        bucket.memories.push({
            id: hash,
            text: memoryLine,
            vec: vecB64,
            imp: importance,
            hits: 0,
            ts: Date.now()
        });

        enforceGlobalLimits(String(chatKey));
        graphStore.stats.totalIngested += 1;
        persistGraph(false);

        if (emb?.float) {
            syncToSupabase(chatKey, memoryLine, emb.float, importance).catch(() => {});
        }
        if (emb?.int8 && !lowRam) {
            backfillOneUnvectorized(bucket).catch(() => {});
        }
        return true;
    } catch (err) {
        console.error('❌ [VectorGraph] ingest error:', err?.message || err);
        return false;
    }
}

// ==================================================
// ৭. টেম্পোরাল + হাইব্রিড রিকল ইঞ্জিন (Zero-Pollution Direct Int8)
// ==================================================
async function recallContext(chatKey, queryText = '', topK = 3) {
    try {
        if (!chatKey || !queryText) return '';
        const bucket = graphStore.users[String(chatKey)];
        if (!bucket) return '';

        const parts = [];
        const entityEntries = Object.entries(bucket.entities || {});
        if (entityEntries.length) {
            const summary = entityEntries.map(([rel, obj]) => `${rel}: ${obj.value}`).join(' | ');
            parts.push(`# নলেজ গ্রাফ (নিশ্চিত তথ্য): ${summary}`);
        }

        const memories = bucket.memories || [];
        if (memories.length && !isNoisyMessage(queryText)) {
            const queryTokens = tokenizeText(queryText);
            const hasVectors = memories.some((m) => Boolean(m.vec));

            let queryEmb = null;
            if (hasVectors && getRssMb() < 220) {
                queryEmb = await fetchGeminiEmbedding(queryText, RECALL_TIMEOUT_MS);
            }
            const queryInt8 = queryEmb?.int8 || null;

            const now = Date.now();
            const scored = [];
            for (const item of memories) {
                let vecScore = 0;
                if (queryInt8 && item.vec) {
                    vecScore = cosineSimilarityInt8(queryInt8, decodeBase64Vector(item.vec));
                }
                const lexScore = lexicalSimilarity(queryTokens, item.text);
                const ageDays = Math.max(0, (now - (item.ts || now)) / (86400 * 1000));
                const recencyBoost = Math.max(0, 1 - ageDays / 45) * 0.06;

                const finalScore = queryInt8
                    ? (vecScore * 0.64 + lexScore * 0.24 + (item.imp || 0.5) * 0.06 + recencyBoost)
                    : (lexScore * 0.82 + (item.imp || 0.5) * 0.12 + recencyBoost);

                if (finalScore >= (queryInt8 ? 0.36 : 0.22)) {
                    scored.push({ item, text: item.text, score: finalScore, ts: item.ts });
                }
            }

            if (queryEmb?.float && getSupabaseConfig()) {
                const cloudHits = await querySupabaseVectors(chatKey, queryEmb.float, 2);
                for (const ch of cloudHits) {
                    if (!scored.some((s) => s.text === ch.text)) {
                        scored.push({ item: null, text: ch.text, score: ch.score, ts: ch.ts });
                    }
                }
            }

            scored.sort((a, b) => b.score - a.score);
            const topHits = scored.slice(0, topK);

            if (topHits.length) {
                for (const hit of topHits) {
                    if (hit.item) hit.item.hits = (hit.item.hits || 0) + 1;
                }
                const lines = topHits.map((h) => {
                    const ago = formatRelativeBnTime(h.ts);
                    return ago ? `- [${ago}] ${h.text}` : `- ${h.text}`;
                });
                parts.push(`# প্রাসঙ্গিক পুরোনো স্মৃতি:\n${lines.join('\n')}`);
            }
        }

        if (parts.length) {
            graphStore.stats.totalRecalls += 1;
            return `\n${parts.join('\n')}`;
        }
        return '';
    } catch {
        return '';
    }
}

async function searchGraph(chatKey, queryText = '', limit = 5) {
    const bucket = graphStore.users[String(chatKey)];
    if (!bucket || !bucket.memories.length) return [];

    const qTokens = tokenizeText(queryText);
    const qEmb = await fetchGeminiEmbedding(queryText, 2800);
    const qInt8 = qEmb?.int8 || null;

    return bucket.memories
        .map((m) => {
            const v = (qInt8 && m.vec) ? cosineSimilarityInt8(qInt8, decodeBase64Vector(m.vec)) : 0;
            const l = lexicalSimilarity(qTokens, m.text);
            const score = qInt8 ? (v * 0.7 + l * 0.3) : l;
            return { text: m.text, score: Number(score.toFixed(2)), ts: m.ts };
        })
        .filter((x) => x.score > 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function getUserEntities(chatKey) {
    const bucket = graphStore.users[String(chatKey)];
    return bucket?.entities ? { ...bucket.entities } : {};
}

function compressMemoryGraph() {
    let removed = 0;
    for (const key of Object.keys(graphStore.users)) {
        const bucket = graphStore.users[key];
        const before = (bucket?.memories || []).length;
        if (before > Math.floor(MAX_MEMORIES_PER_USER * 0.75)) {
            pruneUserMemories(bucket);
            removed += before - bucket.memories.length;
        }
    }
    enforceGlobalLimits();
    clearVectorCaches();
    graphStore.stats.lastCompressedAt = Date.now();
    persistGraph(true);
    return { removed, totalUsers: Object.keys(graphStore.users).length };
}

function clearUserGraph(chatKey) {
    if (!chatKey) return;
    delete graphStore.users[String(chatKey)];
    vectorDecodeCache.clear();
    persistGraph(true);
}

function getGraphStats(chatKey = null) {
    const userKeys = Object.keys(graphStore.users);
    let totalMemories = 0, totalEntities = 0, vectorizedCount = 0;

    for (const k of userKeys) {
        const u = graphStore.users[k];
        totalMemories += (u?.memories || []).length;
        totalEntities += Object.keys(u?.entities || {}).length;
        vectorizedCount += (u?.memories || []).filter((m) => Boolean(m.vec)).length;
    }

    const userBucket = chatKey ? graphStore.users[String(chatKey)] : null;
    return {
        usersTracked: userKeys.length,
        totalMemories,
        vectorizedCount,
        totalEntities,
        totalIngested: graphStore.stats.totalIngested,
        totalRecalls: graphStore.stats.totalRecalls,
        avgEmbedMs,
        cacheHits: embedCacheHits,
        decodeCacheSize: vectorDecodeCache.size,
        cloudEnabled: Boolean(getSupabaseConfig()),
        currentUserEntities: userBucket ? userBucket.entities : {},
        currentUserMemories: userBucket ? (userBucket.memories || []).length : 0
    };
}

if (typeof registerCleanupHook === 'function') {
    registerCleanupHook('vectorGraph', () => clearVectorCaches());
}

process.once('beforeExit', flushGraph);

const autoCompressTimer = setInterval(() => compressMemoryGraph(), 4 * 60 * 60 * 1000);
if (autoCompressTimer.unref) autoCompressTimer.unref();

module.exports = {
    recallContext,
    ingestInteraction,
    searchGraph,
    getUserEntities,
    compressMemoryGraph,
    clearUserGraph,
    clearVectorCaches,
    flushGraph,
    getGraphStats
};
