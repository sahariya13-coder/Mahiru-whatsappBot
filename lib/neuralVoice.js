/**
 * PRIME MONIR • Maya v1.0 ULTIMATE — Crystal Human Neural Voice & Offline Bank (256MB RAM Tuned)
 * Pipeline:
 *   Tier 1: ElevenLabs Cloned Voice (Expressive)
 *   Tier 2: Gemini Flash Expressive TTS (AIza Multi-Key Round-Robin)
 *   Tier 3: Crystal-Clear Edge Neural (bn-BD-NabanitaNeural / en-US-AvaNeural • Pure 0Hz Pitch + 12kHz Air)
 *   Tier 4: Fast Backup AI TTS (lib/backupAI.js) -> Google Bangla TTS Last Resort
 *   Tier 5: 100% Offline Smart Voice Bank (Exact + Fuzzy Token/Mood Match)
 * STT: Multi-Key Groq Whisper -> Dual-Gemini (AIza + AQ. Vertex Express) -> Backup AI STT
 * 100% Backward-Compatible Exports
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const settings = (() => {
    try { return require('../settings'); } catch { return {}; }
})();

const mayaCore = require('./mayaCore');
const {
    BOT_NAME,
    BOT_VERSION,
    normalizeBn,
    loadJson,
    saveJson,
    safeSend,
    getKeysByFamily,
    getLiveModelsForFamily,
    isProviderReady
} = mayaCore;

let textSanitizer = null;
try { ({ textSanitizer } = require('./textSanitizer')); } catch {}

let privacyFirewall = null;
try { privacyFirewall = require('./privacyFirewall'); } catch {}

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

let backupAI = null;
try { backupAI = require('./backupAI'); } catch {
    try { backupAI = require('./mahiruAI'); } catch {}
}

let MsEdgeTTS = null;
let OUTPUT_FORMAT = null;
try { ({ MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')); } catch {}

const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(process.cwd(), 'data');
const VOICE_CACHE_DIR = path.join(DATA_DIR, 'voice_cache');
const CACHE_INDEX_FILE = path.join(VOICE_CACHE_DIR, 'voice_index.json');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const VOICE_CONFIG_FILE = path.join(DATA_DIR, 'maya_voice_studio.json');

// নতুন ক্রিস্টাল স্কিমা — পুরোনো ভোঁতা v4 ক্যাশ অটো-রিসেট হয়ে নতুন ক্রিস্টাল ভয়েস তৈরি হবে
const CACHE_SCHEMA_VER = 'v5_crystal_v1';
const EDGE_VOICE_BN = settings.maya?.voice?.edgeVoiceBn || 'bn-BD-NabanitaNeural';
const EDGE_VOICE_EN = settings.maya?.voice?.edgeVoiceEn || 'en-US-AvaNeural';
const VERTEX_EXPRESS_BASE = String(
    settings.maya?.ai?.vertexExpressBaseUrl || 'https://aiplatform.googleapis.com/v1/publishers/google/models'
).replace(/\/+$/, '');

// ২৫৬MB RAM প্রোফাইল টাইট লিমিটসমূহ
const MAX_CACHE_FILES = 35;
const MAX_CACHE_BYTES = 2.5 * 1024 * 1024;
const MAX_FFMPEG_QUEUE = 3;
const MAX_COOLDOWN_ENTRIES = 60;
const MAX_STT_BYTES = 2.5 * 1024 * 1024;
const MAX_EDGE_BYTES = 1.2 * 1024 * 1024;

function getDynamicVoiceRamLimits() {
    const opt = settings.maya?.optimizer || {};
    const soft = Number(opt.ramSoftLimitMb) || 235;
    const critical = Number(opt.ramCriticalLimitMb) || 295;
    return {
        lightMasterMb: Math.max(200, soft - 10),
        skipTtsMb: Math.max(245, critical - 12)
    };
}

const VALID_PROVIDER_MODES = new Set(['auto', 'cloned', 'gemini', 'edge', 'backup', 'gtts']);

// ক্রিস্টাল-ক্লিয়ার স্বাভাবিক বাংলা প্রোসোডি (কোনো নেগেটিভ পিচ বিকৃতি বা অতিরিক্ত ধীরগতি নেই)
const DEFAULT_EDGE_PROSODY = Object.freeze({
    affectionate: { rate: '-2%', pitch: '0Hz' },
    happy: { rate: '+2%', pitch: '+1Hz' },
    playful_casual: { rate: '+2%', pitch: '+1Hz' },
    sad: { rate: '-3%', pitch: '0Hz' },
    empathetic_sad: { rate: '-3%', pitch: '0Hz' },
    apologetic: { rate: '-2%', pitch: '0Hz' },
    stern: { rate: '-1%', pitch: '0Hz' },
    helpful: { rate: '0%', pitch: '0Hz' },
    professional: { rate: '0%', pitch: '0Hz' },
    calm: { rate: '0%', pitch: '0Hz' }
});

function getEdgeProsody(mood = 'calm') {
    const fromSettings = settings.maya?.voice?.edgeProsody?.[mood];
    if (fromSettings?.rate && fromSettings?.pitch) {
        // পিচ সবসময় ন্যাচারাল রেঞ্জে (0Hz থেকে +1Hz) লক রাখা — যাতে ভোকোডার বিকৃত না হয়
        const pVal = parseInt(fromSettings.pitch, 10);
        const safePitch = Number.isFinite(pVal) && pVal >= 0 && pVal <= 1 ? `${pVal === 0 ? '0' : `+${pVal}`}Hz` : '0Hz';
        const rVal = parseInt(fromSettings.rate, 10);
        const clampedRate = Number.isFinite(rVal) ? Math.max(-4, Math.min(4, rVal)) : 0;
        const safeRate = clampedRate > 0 ? `+${clampedRate}%` : `${clampedRate}%`;
        return { rate: safeRate, pitch: safePitch };
    }
    return DEFAULT_EDGE_PROSODY[mood] || DEFAULT_EDGE_PROSODY.calm;
}

fs.mkdirSync(VOICE_CACHE_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

const savedCfg = loadJson(VOICE_CONFIG_FILE, {});
let studioConfig = {
    providerMode: VALID_PROVIDER_MODES.has(savedCfg?.providerMode) ? savedCfg.providerMode : 'auto',
    studioMastering: typeof savedCfg?.studioMastering === 'boolean'
        ? savedCfg.studioMastering
        : (settings.maya?.voice?.studioMaster?.enabled !== false),
    cacheEnabled: typeof savedCfg?.cacheEnabled === 'boolean' ? savedCfg.cacheEnabled : true,
    geminiVoiceName: savedCfg?.geminiVoiceName || settings.maya?.voice?.defaultVoiceName || 'Aoede'
};

const voiceStats = {
    totalGenerated: 0,
    totalStt: 0,
    cacheHits: 0,
    offlineBankHits: 0,
    dedupHits: 0,
    avgGenMs: 0,
    failures: 0,
    byProvider: { cloned: 0, gemini: 0, edge: 0, backup: 0, gtts: 0, offline: 0 }
};

const voiceCooldowns = new Map();
const voiceStrikeCount = new Map();
const inFlightTts = new Map();
let ttsKeyCursor = 0;
let sttKeyCursor = 0;

let ffmpegChain = Promise.resolve();
let ffmpegQueueDepth = 0;

function getRssMb() {
    return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

function isValidHeaderKey(key = '') {
    const s = String(key || '').trim();
    return s.length >= 16 && /^[\x21-\x7E]+$/.test(s);
}

function classifyGeminiKeySafe(key = '') {
    if (typeof mayaCore.classifyGeminiKey === 'function') return mayaCore.classifyGeminiKey(key);
    const k = String(key || '').trim();
    if (!isValidHeaderKey(k)) return 'invalid';
    if (k.startsWith('AQ.')) return 'vertex_express';
    if (k.startsWith('AIza')) return 'ai_studio';
    return 'invalid';
}

function runWithFfmpegLock(fn) {
    if (ffmpegQueueDepth >= MAX_FFMPEG_QUEUE) {
        const err = new Error('ffmpeg_queue_busy');
        err.code = 'FFMPEG_BUSY';
        return Promise.reject(err);
    }
    ffmpegQueueDepth++;
    const next = ffmpegChain
        .catch(() => {})
        .then(() => fn())
        .finally(() => {
            ffmpegQueueDepth = Math.max(0, ffmpegQueueDepth - 1);
        });
    ffmpegChain = next.catch(() => {});
    return next;
}

function saveStudioConfig() {
    saveJson(VOICE_CONFIG_FILE, studioConfig);
}

function isVoiceSlotReady(slotKey) {
    const exp = voiceCooldowns.get(slotKey) || 0;
    if (exp <= Date.now()) {
        if (exp) {
            voiceCooldowns.delete(slotKey);
            voiceStrikeCount.delete(slotKey);
        }
        return true;
    }
    return false;
}

function parseRetryAfterSec(res, fallbackSec) {
    try {
        const hdr = res?.headers?.get?.('retry-after');
        if (!hdr) return fallbackSec;
        const sec = Number(hdr);
        if (Number.isFinite(sec) && sec > 0) return Math.min(Math.max(Math.ceil(sec), 15), 600);
    } catch {}
    return fallbackSec;
}

function markVoiceSlotCooldown(slotKey, baseSec = 90, reason = '429') {
    if (voiceCooldowns.size >= MAX_COOLDOWN_ENTRIES && !voiceCooldowns.has(slotKey)) {
        sweepVoiceCooldowns();
        if (voiceCooldowns.size >= MAX_COOLDOWN_ENTRIES) {
            const oldest = voiceCooldowns.keys().next().value;
            if (oldest !== undefined) {
                voiceCooldowns.delete(oldest);
                voiceStrikeCount.delete(oldest);
            }
        }
    }
    const strikes = Math.min((voiceStrikeCount.get(slotKey) || 0) + 1, 4);
    voiceStrikeCount.set(slotKey, strikes);
    const sec = Math.min(baseSec * strikes, 600);
    voiceCooldowns.set(slotKey, Date.now() + sec * 1000);
    console.warn(`⚠️ [Voice] ${slotKey} cooldown ${sec}s (${reason})`);
}

function markVoiceSlotOk(slotKey) {
    voiceCooldowns.delete(slotKey);
    voiceStrikeCount.delete(slotKey);
}

function sweepVoiceCooldowns() {
    const now = Date.now();
    for (const [k, exp] of voiceCooldowns.entries()) {
        if (exp <= now) {
            voiceCooldowns.delete(k);
            voiceStrikeCount.delete(k);
        }
    }
}

function resetVoiceApiHealth() {
    voiceCooldowns.clear();
    voiceStrikeCount.clear();
    try { backupAI?.resetBackupCooldown?.(); } catch {}
}

// ==================================================
// ১. ফোনেটিক টেক্সট স্যানিটাইজার, স্মার্ট ভয়েস সিলেক্টর ও মুড ডিটেক্টর
// ==================================================
function applyNaturalSpeechPacing(text = '') {
    return String(text || '')
        .replace(/\s*([।?!])\s*/g, '$1 ')
        .replace(/\s*,\s*/g, ', ')
        // আগে যতিচিহ্ন না থাকলেই কেবল সংযোগ শব্দের আগে হালকা কমা বিরতি বসাবে
        .replace(/([^\s।?!,])\s+(কিন্তু|তবে|আসলে|তাছাড়া|অর্থাৎ|যদিও)\s+/g, '$1, $2 ')
        .replace(/,\s*,+/g, ',')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeTextForSpeech(raw = '', maxChars = settings.maya?.voice?.maxTtsChars || 280) {
    let source = normalizeBn(raw);
    if (!source) return '';

    if (privacyFirewall?.auditOutboundText) {
        const audited = privacyFirewall.auditOutboundText(source, { isSuperOwner: false });
        source = audited.text.replace(/\[(?:REDACTED_[A-Z]+|SERVER_PATH|PROTECTED_[A-Z]+)\]/g, '');
    }

    if (textSanitizer?.prepareTextForTTS) {
        const clean = textSanitizer.prepareTextForTTS(source, maxChars);
        if (clean) return applyNaturalSpeechPacing(clean);
    }

    const fallback = source
        .replace(/https?:\/\/\S+/gi, 'আমাদের ওয়েবসাইটে')
        .replace(/@@(?:URLTOKEN|CODEBLOCK)[_\d₀-₉]+@@/g, '')
        .replace(/[*_~`#>|]+/g, ' ')
        .replace(/[─━═•▪▫◆◇★☆]+/g, ' ')
        .replace(/\p{Extended_Pictographic}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxChars);

    return applyNaturalSpeechPacing(fallback);
}

const BANGLISH_HINT_RE = /\b(?:ami|tumi|apni|kemon|acho|achen|valo|bhalo|koro|korbo|kothay|kobe|keno|bhai|vai|dost|taka|lagbe|hobe|na|ache|nai|bol|bolo|shono|abar|ekhon|pore|khub|onek|dhonnobad|salam|assalamu)\b/i;

function selectEdgeVoiceForText(speechText = '') {
    const bnChars = (speechText.match(/[\u0980-\u09FF]/g) || []).length;
    const enChars = (speechText.match(/[a-zA-Z]/g) || []).length;
    // খাঁটি ইংরেজি হলে AvaNeural, কিন্তু বাংলিশ বা বাংলা হলে NabanitaNeural
    if (bnChars === 0 && enChars >= 6 && !BANGLISH_HINT_RE.test(speechText)) {
        return EDGE_VOICE_EN;
    }
    return EDGE_VOICE_BN;
}

function detectVoiceMood(replyText = '', userText = '', role = 'auto', incomingMood = '') {
    if (incomingMood && incomingMood !== 'neutral') return incomingMood;
    const combined = normalizeBn(`${replyText} ${userText}`).toLowerCase();

    if (/(ভালোবাসি|ভালবাসি|মিস\s*করছি|জান|কলিজা|বাবু|আদর|love|miss\s*you|❤️|🥰|😘)/i.test(combined)) return 'affectionate';
    if (/(দুঃখিত|সরি|sorry|মাফ|ক্ষমা|ভুল\s*হয়ে|কষ্ট|মন\s*খারাপ|অসুস্থ|জ্বর|ব্যথা|কান্না|টেনশন|🥺|😢|😔)/i.test(combined)) return 'apologetic';
    if (/(রাগ|সাবধান|সতর্ক|ব্লক|স্প্যাম|ভদ্রভাবে|অননুমোদিত|⚠️|🚫)/i.test(combined)) return 'stern';
    if (/(হাহা|haha|lol|দারুণ|অসাধারণ|সুপার|মজা|অভিনন্দন|শুভ|খুশি|😂|😄)/i.test(combined)) return 'happy';
    if (/(ধাপ|প্রথমে|তারপর|সমাধান|কীভাবে|অংক|হিসাব|রুট|ফ্ল্যাশ|সার্ভার|টাকা)/i.test(combined)) return 'helpful';
    if (role === 'gf') return 'affectionate';
    if (role === 'client') return 'professional';
    return 'calm';
}

function getMoodStyleInstruction(mood = 'calm') {
    const toneMap = {
        affectionate: 'Speak warmly, sweetly, and naturally like a real affectionate young Bangladeshi woman',
        happy: 'Speak cheerfully, brightly, and naturally like a genuinely happy young Bangladeshi woman',
        playful_casual: 'Speak cheerfully, lightly, and naturally like a friendly young Bangladeshi woman',
        sad: 'Speak gently, softly, and empathetically like a caring close Bangladeshi female friend',
        empathetic_sad: 'Speak gently, softly, and empathetically like a caring close Bangladeshi female friend',
        apologetic: 'Speak politely, softly, and reassuringly in natural Bangladeshi Bengali',
        stern: 'Speak clearly, firmly, and calmly like a composed Bangladeshi woman',
        helpful: 'Speak clearly, patiently, and warmly like a friendly young Bangladeshi female assistant',
        professional: 'Speak clearly, politely, and warmly like a smart young Bangladeshi female assistant',
        calm: 'Speak naturally, smoothly, and warmly like a real Dhaka Bangladeshi young woman in everyday conversation'
    };
    const tone = toneMap[mood] || toneMap.calm;
    return `${tone}. Read ONLY the exact text below naturally with crisp pronunciation:\n\n`;
}

// ==================================================
// ২. কোয়ালিটি-অ্যাওয়্যার ডিস্ক ক্যাশ ও অফলাইন ভয়েস ব্যাংক (অরফান-ক্লিনসহ)
// ==================================================
let cacheIndex = Object.create(null);
let indexDirty = false;
let indexSaveTimer = null;

function tokenizeForOfflineMatch(text = '') {
    const stop = new Set(['আমি', 'তুমি', 'আপনি', 'এটা', 'ওটা', 'একটু', 'করে', 'হবে', 'আছে', 'নেই', 'কি', 'কী', 'না', 'হ্যাঁ']);
    const matches = normalizeBn(text).toLowerCase().match(/[\u0980-\u09FFa-z0-9]{2,}/g) || [];
    return [...new Set(matches.filter((w) => !stop.has(w)))].slice(0, 12);
}

function loadCacheIndex() {
    const loaded = loadJson(CACHE_INDEX_FILE, null);
    const validFiles = new Set();

    if (loaded && typeof loaded === 'object') {
        cacheIndex = Object.create(null);
        for (const [k, v] of Object.entries(loaded)) {
            if (v?.schema === CACHE_SCHEMA_VER && v?.file && fs.existsSync(path.join(VOICE_CACHE_DIR, v.file))) {
                cacheIndex[k] = v;
                validFiles.add(v.file);
            }
        }
    }

    // পুরোনো ভোঁতা স্কিমা (v4) বা অরফান .ogg ফাইল ডিস্ক থেকে ক্লিন করে দেওয়া
    try {
        let purged = 0;
        for (const f of fs.readdirSync(VOICE_CACHE_DIR)) {
            if (!f.endsWith('.ogg')) continue;
            if (!validFiles.has(f)) {
                try { fs.unlinkSync(path.join(VOICE_CACHE_DIR, f)); purged++; } catch {}
            }
        }
        if (purged > 0) saveCacheIndex(true);
    } catch {}
}

function saveCacheIndex(immediate = false) {
    indexDirty = true;
    if (immediate) {
        if (indexSaveTimer) { clearTimeout(indexSaveTimer); indexSaveTimer = null; }
        let tmp = '';
        try {
            tmp = `${CACHE_INDEX_FILE}.tmp-${process.pid}-${Date.now()}`;
            fs.writeFileSync(tmp, JSON.stringify(cacheIndex), 'utf8');
            fs.renameSync(tmp, CACHE_INDEX_FILE);
            indexDirty = false;
        } catch {
            if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        }
        return;
    }
    if (indexSaveTimer) return;
    indexSaveTimer = setTimeout(() => {
        indexSaveTimer = null;
        if (indexDirty) saveCacheIndex(true);
    }, 4000);
    if (indexSaveTimer.unref) indexSaveTimer.unref();
}

loadCacheIndex();

function getVoiceCacheHash(speechText, mood) {
    const keyStr = [
        CACHE_SCHEMA_VER,
        studioConfig.providerMode,
        studioConfig.geminiVoiceName || 'Aoede',
        studioConfig.studioMastering ? 1 : 0,
        mood,
        speechText.toLowerCase()
    ].join('|');
    return crypto.createHash('md5').update(keyStr).digest('hex');
}

function getVoiceCachePath(hash) {
    return path.join(VOICE_CACHE_DIR, `${hash}.ogg`);
}

function pruneVoiceCache() {
    try {
        const files = fs.readdirSync(VOICE_CACHE_DIR)
            .filter((f) => f.endsWith('.ogg'))
            .map((f) => {
                const full = path.join(VOICE_CACHE_DIR, f);
                const st = fs.statSync(full);
                const hash = f.slice(0, -4);
                const tier = cacheIndex[hash]?.tier || 4;
                return { f, hash, full, mtime: st.mtimeMs, size: st.size, tier };
            });

        let totalBytes = files.reduce((s, x) => s + x.size, 0);
        if (files.length <= MAX_CACHE_FILES && totalBytes <= MAX_CACHE_BYTES) return;

        files.sort((a, b) => (b.tier - a.tier) || (a.mtime - b.mtime));

        let remaining = files.length;
        for (const item of files) {
            if (remaining <= MAX_CACHE_FILES && totalBytes <= MAX_CACHE_BYTES) break;
            try {
                fs.unlinkSync(item.full);
                delete cacheIndex[item.hash];
                totalBytes -= item.size;
                remaining--;
            } catch {}
        }
        saveCacheIndex(false);
    } catch {}
}

function recordCachedVoice(hash, buffer, { speechText, mood, provider, tier }) {
    if (!studioConfig.cacheEnabled || !buffer || buffer.length < 500) return;

    const existing = cacheIndex[hash];
    if (existing && existing.tier < tier && fs.existsSync(getVoiceCachePath(hash))) return;

    try {
        const filePath = getVoiceCachePath(hash);
        const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
        fs.writeFileSync(tmp, buffer);
        fs.renameSync(tmp, filePath);

        cacheIndex[hash] = {
            schema: CACHE_SCHEMA_VER,
            file: `${hash}.ogg`,
            text: speechText.slice(0, 160),
            tokens: tokenizeForOfflineMatch(speechText),
            mood,
            provider,
            tier,
            size: buffer.length,
            ts: Date.now()
        };
        pruneVoiceCache();
        saveCacheIndex(false);
    } catch {}
}

function findOfflineBankMatch(speechText = '', mood = 'calm') {
    const qTokens = tokenizeForOfflineMatch(speechText);
    if (!qTokens.length) return null;

    let best = null;
    let bestScore = 0;

    for (const entry of Object.values(cacheIndex)) {
        if (!entry?.file || !Array.isArray(entry.tokens) || !entry.tokens.length || entry.tier >= 4) continue;
        let hits = 0;
        for (const qt of qTokens) if (entry.tokens.includes(qt)) hits++;
        if (!hits) continue;

        let score = hits / Math.sqrt(qTokens.length * entry.tokens.length);
        if (entry.mood === mood) score += 0.1;
        if (entry.tier <= 3) score += 0.08;
        if (score > bestScore) { bestScore = score; best = entry; }
    }

    if (best && bestScore >= 0.55) {
        const full = path.join(VOICE_CACHE_DIR, best.file);
        try {
            if (fs.existsSync(full)) {
                const buf = fs.readFileSync(full);
                if (buf.length > 500) return { buffer: buf, provider: `offline-bank(${best.provider})`, tier: 5 };
            }
        } catch {}
    }
    return null;
}

function clearVoiceCache() {
    let removed = 0;
    try {
        for (const f of fs.readdirSync(VOICE_CACHE_DIR)) {
            if (!f.endsWith('.ogg')) continue;
            try { fs.unlinkSync(path.join(VOICE_CACHE_DIR, f)); removed += 1; } catch {}
        }
    } catch {}
    cacheIndex = Object.create(null);
    saveCacheIndex(true);
    return removed;
}

// ==================================================
// ৩. ক্রিস্টাল-ক্লিয়ার ট্রান্সপারেন্ট মাস্টারিং ও Audio Opus কনভার্টার
// ==================================================
function detectAudioBufferFormat(buffer, mimeType = '') {
    const mime = String(mimeType || '').toLowerCase();
    if (Buffer.isBuffer(buffer) && buffer.length >= 4) {
        const head = buffer.subarray(0, 4).toString('ascii');
        if (head === 'RIFF') return { type: 'wav', ext: 'wav' };
        if (head === 'OggS') return { type: 'ogg', ext: 'ogg' };
        if (head.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
            return { type: 'mp3', ext: 'mp3' };
        }
    }
    const rateMatch = mime.match(/rate=(\d+)/);
    return { type: 'pcm', ext: 'pcm', sampleRate: rateMatch ? Number(rateMatch[1]) : 24000 };
}

// জিরো-মাড ক্রিস্টাল ফিল্টার: কোনো ভারী কম্প্রেসর, 220Hz মাড বুস্ট বা 7.6kHz কাটঅফ নেই
function getCrystalFilterChain() {
    if (!studioConfig.studioMastering) return '';
    const sm = settings.maya?.voice?.studioMaster || {};
    const hp = Math.min(Number(sm.highpassHz) || 75, 90);
    const lp = Math.max(Number(sm.lowpassHz) || 11800, 11000);

    const { lightMasterMb } = getDynamicVoiceRamLimits();
    if (getRssMb() >= lightMasterMb) {
        return `highpass=f=${hp},alimiter=limit=0.95`;
    }
    return `highpass=f=${hp},lowpass=f=${lp},alimiter=limit=0.95`;
}

function getOpusOutputArgs(outFile) {
    const sm = settings.maya?.voice?.studioMaster || {};
    const bitrate = sm.opusBitrate || '64k';
    const sampleRate = String(sm.sampleRate || 48000);
    return ['-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on', '-application', 'audio', '-ar', sampleRate, '-ac', '1', outFile];
}

async function encodeToWhatsAppOpus(inputBuffer, { isRawPcm24k = false, sampleRate = 24000, inputExt = 'mp3', mimeType = '' } = {}) {
    return runWithFfmpegLock(async () => {
        const fmt = isRawPcm24k
            ? { type: 'pcm', ext: 'pcm', sampleRate }
            : detectAudioBufferFormat(inputBuffer, mimeType || inputExt);

        const id = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const inFile = path.join(TEMP_DIR, `${id}.${fmt.ext || inputExt}`);
        const outFile = path.join(TEMP_DIR, `${id}.ogg`);

        try {
            fs.writeFileSync(inFile, inputBuffer);

            const inputArgs = fmt.type === 'pcm'
                ? ['-y', '-threads', '1', '-f', 's16le', '-ar', String(fmt.sampleRate || 24000), '-ac', '1', '-i', inFile]
                : ['-y', '-threads', '1', '-i', inFile];

            const crystalFilter = getCrystalFilterChain();
            const outArgs = getOpusOutputArgs(outFile);
            const args = crystalFilter
                ? [...inputArgs, '-af', crystalFilter, ...outArgs]
                : [...inputArgs, ...outArgs];

            try {
                await execFileAsync('ffmpeg', args, { timeout: 11000, maxBuffer: 512 * 1024 });
            } catch {
                if (!crystalFilter) throw new Error('ffmpeg_encode_failed');
                await execFileAsync('ffmpeg', [...inputArgs, ...outArgs], { timeout: 9000, maxBuffer: 512 * 1024 });
            }

            if (fs.existsSync(outFile) && fs.statSync(outFile).size > 500) {
                return fs.readFileSync(outFile);
            }
            return null;
        } catch (err) {
            console.warn(`⚠️ [Voice] FFmpeg encode error: ${err?.message || err}`);
            return null;
        } finally {
            fs.unlink(inFile, () => {});
            fs.unlink(outFile, () => {});
        }
    });
}

async function encodeMp3ChunksToOpus(buffers = []) {
    if (!buffers.length) return null;
    if (buffers.length === 1) {
        return encodeToWhatsAppOpus(buffers[0], { isRawPcm24k: false, inputExt: 'mp3', mimeType: 'audio/mpeg' });
    }

    return runWithFfmpegLock(async () => {
        const id = `tts_cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const tempFiles = [];
        const listFile = path.join(TEMP_DIR, `${id}.txt`);
        const outFile = path.join(TEMP_DIR, `${id}.ogg`);

        try {
            const listLines = [];
            for (let i = 0; i < buffers.length; i++) {
                const f = path.join(TEMP_DIR, `${id}_${i}.mp3`);
                fs.writeFileSync(f, buffers[i]);
                tempFiles.push(f);
                listLines.push(`file '${f.replace(/'/g, "'\\''")}'`);
            }
            fs.writeFileSync(listFile, listLines.join('\n'), 'utf8');

            const crystalFilter = getCrystalFilterChain();
            const baseArgs = ['-y', '-threads', '1', '-f', 'concat', '-safe', '0', '-i', listFile];
            const outArgs = getOpusOutputArgs(outFile);
            const args = crystalFilter ? [...baseArgs, '-af', crystalFilter, ...outArgs] : [...baseArgs, ...outArgs];

            await execFileAsync('ffmpeg', args, { timeout: 12000, maxBuffer: 512 * 1024 });
            if (fs.existsSync(outFile) && fs.statSync(outFile).size > 500) {
                return fs.readFileSync(outFile);
            }
            return null;
        } catch {
            return null;
        } finally {
            for (const f of tempFiles) fs.unlink(f, () => {});
            fs.unlink(listFile, () => {});
            fs.unlink(outFile, () => {});
        }
    });
}

// ==================================================
// ৪. TTS প্রোভাইডারসমূহ (Cloned -> Gemini -> Crystal Edge -> Backup AI -> gTTS)
// ==================================================

async function generateClonedVoice(speechText, mood = 'calm') {
    const elKey = (process.env.ELEVENLABS_API_KEY || '').trim();
    const elVoice = (process.env.ELEVENLABS_VOICE_ID || '').trim();
    if (!isValidHeaderKey(elKey) || !elVoice || !isVoiceSlotReady('tts:cloned')) return null;

    const moodSettings = {
        affectionate: { stability: 0.44, similarity_boost: 0.80, style: 0.30 },
        happy: { stability: 0.46, similarity_boost: 0.78, style: 0.28 },
        apologetic: { stability: 0.55, similarity_boost: 0.78, style: 0.22 },
        sad: { stability: 0.56, similarity_boost: 0.78, style: 0.25 },
        stern: { stability: 0.62, similarity_boost: 0.80, style: 0.14 },
        calm: { stability: 0.50, similarity_boost: 0.78, style: 0.20 }
    }[mood] || { stability: 0.50, similarity_boost: 0.78, style: 0.20 };

    try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elVoice)}?optimize_streaming_latency=2`, {
            method: 'POST',
            headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elKey },
            body: JSON.stringify({
                text: speechText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: { ...moodSettings, use_speaker_boost: true }
            }),
            signal: AbortSignal.timeout(11500)
        });

        if (!res.ok) {
            const cdSec = [401, 402, 403].includes(res.status) ? 600 : parseRetryAfterSec(res, 120);
            markVoiceSlotCooldown('tts:cloned', cdSec, `Cloned ${res.status}`);
            return null;
        }

        let mp3Buf = Buffer.from(await res.arrayBuffer());
        if (mp3Buf.length < 1500) return null;

        const ogg = await encodeToWhatsAppOpus(mp3Buf, { isRawPcm24k: false, inputExt: 'mp3', mimeType: 'audio/mpeg' });
        mp3Buf = null;
        if (ogg) {
            markVoiceSlotOk('tts:cloned');
            voiceStats.byProvider.cloned++;
            return { buffer: ogg, provider: 'cloned', tier: 1 };
        }
    } catch (err) {
        markVoiceSlotCooldown('tts:cloned', 90, String(err?.message || 'err').slice(0, 35));
    }
    return null;
}

async function getFastGeminiTtsModels() {
    const discovered = await getLiveModelsForFamily('gemini', 'tts').catch(() => []);
    const flashOnly = discovered.filter((m) => /tts/i.test(m) && /flash/i.test(m) && !/pro/i.test(m));
    const configured = settings.maya?.voice?.ttsModel ? [settings.maya.voice.ttsModel] : [];
    return Array.from(new Set([...configured, ...flashOnly, 'gemini-2.5-flash-preview-tts'])).slice(0, 2);
}

async function generateGeminiTts(speechText, mood) {
    const gemKeys = getKeysByFamily('gemini')
        .filter((k) => isProviderReady(k.id) && classifyGeminiKeySafe(k.key) === 'ai_studio');
    if (!gemKeys.length) return null;

    const models = await getFastGeminiTtsModels();
    const startIdx = ttsKeyCursor % gemKeys.length;
    ttsKeyCursor = (ttsKeyCursor + 1) % 10000;
    const orderedKeys = [...gemKeys.slice(startIdx), ...gemKeys.slice(0, startIdx)];

    const promptText = `${getMoodStyleInstruction(mood)}${speechText}`;
    const timeoutMs = Number(settings.maya?.voice?.ttsTimeoutMs) || 14000;

    for (const model of models) {
        for (const item of orderedKeys) {
            const keyAuthId = `auth:${item.id}`;
            const slotKey = `tts:${item.id}:${model}`;
            if (!isVoiceSlotReady(keyAuthId) || !isVoiceSlotReady(slotKey)) continue;

            let rawBuf = null;
            let mime = '';

            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': item.key },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptText }] }],
                            generationConfig: {
                                responseModalities: ['AUDIO'],
                                speechConfig: {
                                    voiceConfig: {
                                        prebuiltVoiceConfig: { voiceName: studioConfig.geminiVoiceName || 'Aoede' }
                                    }
                                }
                            }
                        }),
                        signal: AbortSignal.timeout(timeoutMs)
                    }
                );

                if (res.ok) {
                    const data = await res.json();
                    const part = data?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
                    if (part?.inlineData?.data) {
                        rawBuf = Buffer.from(part.inlineData.data, 'base64');
                        mime = String(part.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000');
                    }
                } else {
                    const status = res.status;
                    if ([401, 403].includes(status)) {
                        markVoiceSlotCooldown(keyAuthId, 600, `TTS Auth ${status}`);
                        continue;
                    }
                    const cd = status === 404 ? 300 : status === 429 ? parseRetryAfterSec(res, 90) : 60;
                    markVoiceSlotCooldown(slotKey, cd, `TTS ${status}`);
                    continue;
                }
            } catch (err) {
                markVoiceSlotCooldown(slotKey, 60, String(err?.message || 'err').slice(0, 30));
                continue;
            }

            if (!rawBuf) continue;
            const fmt = detectAudioBufferFormat(rawBuf, mime);
            if (rawBuf.length < (fmt.type === 'pcm' ? 10000 : 1500)) { rawBuf = null; continue; }

            const ogg = await encodeToWhatsAppOpus(rawBuf, {
                isRawPcm24k: fmt.type === 'pcm',
                sampleRate: fmt.sampleRate || 24000,
                inputExt: fmt.ext,
                mimeType: mime
            });
            rawBuf = null;

            if (ogg) {
                markVoiceSlotOk(slotKey);
                voiceStats.byProvider.gemini++;
                return { buffer: ogg, provider: item.id, tier: 2 };
            }
        }
    }
    return null;
}

async function synthesizeEdgeViaPackage(speechText, prosody, voiceName) {
    if (!MsEdgeTTS || !OUTPUT_FORMAT) return null;
    const format = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3 || OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;

    for (let attempt = 0; attempt < 2; attempt++) {
        let tts = null;
        let audioStream = null;
        const chunks = [];
        try {
            tts = new MsEdgeTTS();
            await tts.setMetadata(voiceName, format);
            const streamObj = tts.toStream(speechText, { rate: prosody.rate, pitch: prosody.pitch });
            audioStream = streamObj?.audioStream || streamObj;

            let totalBytes = 0;
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    try { audioStream?.destroy?.(); } catch {}
                    reject(new Error('edge_timeout'));
                }, 10000);
                if (timer.unref) timer.unref();

                audioStream.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_EDGE_BYTES) {
                        clearTimeout(timer);
                        try { audioStream?.destroy?.(); } catch {}
                        reject(new Error('edge_too_large'));
                        return;
                    }
                    chunks.push(chunk);
                });
                audioStream.on('end', () => { clearTimeout(timer); resolve(); });
                audioStream.on('error', (err) => { clearTimeout(timer); reject(err); });
            });

            const mp3Buf = Buffer.concat(chunks);
            chunks.length = 0;
            if (mp3Buf.length >= 1000) return mp3Buf;
        } catch {
            chunks.length = 0;
        } finally {
            try { audioStream?.destroy?.(); } catch {}
            try { tts?.close?.(); } catch {}
        }
    }
    return null;
}

async function generateEdgeNeuralTts(speechText, mood = 'calm') {
    if (!isVoiceSlotReady('tts:edge_neural')) return null;

    const prosody = getEdgeProsody(mood);
    const voiceName = selectEdgeVoiceForText(speechText);

    let mp3FromPkg = await synthesizeEdgeViaPackage(speechText, prosody, voiceName);
    if (mp3FromPkg) {
        const ogg = await encodeToWhatsAppOpus(mp3FromPkg, { isRawPcm24k: false, inputExt: 'mp3', mimeType: 'audio/mpeg' });
        mp3FromPkg = null;
        if (ogg) {
            markVoiceSlotOk('tts:edge_neural');
            voiceStats.byProvider.edge++;
            return { buffer: ogg, provider: 'edge-crystal', tier: 3 };
        }
    }

    const outMp3 = path.join(TEMP_DIR, `edge_cli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
    try {
        await execFileAsync('edge-tts', [
            '--voice', voiceName,
            `--rate=${prosody.rate}`,
            `--pitch=${prosody.pitch}`,
            '--text', speechText,
            '--write-media', outMp3
        ], { timeout: 12000, maxBuffer: 512 * 1024 });

        if (fs.existsSync(outMp3)) {
            let mp3Buf = fs.readFileSync(outMp3);
            if (mp3Buf.length >= 1000) {
                const ogg = await encodeToWhatsAppOpus(mp3Buf, { isRawPcm24k: false, inputExt: 'mp3', mimeType: 'audio/mpeg' });
                mp3Buf = null;
                if (ogg) {
                    markVoiceSlotOk('tts:edge_neural');
                    voiceStats.byProvider.edge++;
                    return { buffer: ogg, provider: 'edge-cli', tier: 3 };
                }
            }
        }
    } catch {
        markVoiceSlotCooldown('tts:edge_neural', 60, 'edge_unavailable');
    } finally {
        fs.unlink(outMp3, () => {});
    }

    return null;
}

// লেয়ার ৩.৫: ফাস্ট ইমার্জেন্সি Backup AI TTS (lib/backupAI.js)
async function generateBackupAiTts(speechText) {
    const fn = backupAI?.synthesizeWithBackupAI || backupAI?.synthesizeWithMahiruAI;
    if (typeof fn !== 'function') return null;
    if (typeof backupAI?.isBackupReady === 'function' && !backupAI.isBackupReady()) return null;
    if (!isVoiceSlotReady('tts:backup_ai')) return null;

    try {
        const res = await fn(speechText, studioConfig.geminiVoiceName || 'Aoede', 14000);
        if (!res?.audio || res.audio.length < 1000) return null;

        const ogg = await encodeToWhatsAppOpus(res.audio, {
            isRawPcm24k: false,
            inputExt: 'wav',
            mimeType: res.mimeType || 'audio/wav'
        });
        if (ogg) {
            markVoiceSlotOk('tts:backup_ai');
            voiceStats.byProvider.backup++;
            return { buffer: ogg, provider: 'backup-ai-tts', tier: 3 };
        }
    } catch (err) {
        markVoiceSlotCooldown('tts:backup_ai', 90, String(err?.message || 'err').slice(0, 30));
    }
    return null;
}

function splitSpeechChunksNatural(text = '', maxLen = 170) {
    const clean = String(text || '').trim();
    if (!clean) return [];
    if (clean.length <= maxLen) return [clean];

    const sentences = clean.split(/(?<=[।?!,])\s+/).filter(Boolean);
    const chunks = [];
    let current = '';

    for (const seg of sentences) {
        if (seg.length > maxLen) {
            if (current) { chunks.push(current); current = ''; }
            for (const w of seg.split(/\s+/).filter(Boolean)) {
                if ((current ? current.length + 1 : 0) + w.length > maxLen) {
                    if (current) chunks.push(current);
                    current = w;
                } else {
                    current = current ? `${current} ${w}` : w;
                }
            }
        } else if ((current ? current.length + 1 : 0) + seg.length > maxLen) {
            if (current) chunks.push(current);
            current = seg;
        } else {
            current = current ? `${current} ${seg}` : seg;
        }
    }
    if (current) chunks.push(current);
    return chunks.slice(0, 3);
}

async function generateGoogleStudioTts(speechText) {
    if (!isVoiceSlotReady('tts:gtts')) return null;
    const chunks = splitSpeechChunksNatural(speechText, 165);
    if (!chunks.length) return null;

    const lang = /[\u0980-\u09FF]/.test(speechText) ? 'bn' : 'en';
    const buffers = [];

    try {
        for (const chunk of chunks) {
            const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(7000)
            });
            if (!res.ok) {
                markVoiceSlotCooldown('tts:gtts', res.status === 429 ? 120 : 60, `gTTS ${res.status}`);
                return null;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 400) return null;
            buffers.push(buf);
        }

        const ogg = await encodeMp3ChunksToOpus(buffers);
        buffers.length = 0;
        if (ogg) {
            markVoiceSlotOk('tts:gtts');
            voiceStats.byProvider.gtts++;
            return { buffer: ogg, provider: 'gtts-fallback', tier: 4 };
        }
    } catch (err) {
        markVoiceSlotCooldown('tts:gtts', 60, String(err?.message || 'err').slice(0, 30));
    }
    return null;
}

// ==================================================
// ৫. ইউনিফাইড ক্রিস্টাল সিন্থেসিস API (In-Flight Dedup সহ) ও সেন্ডার
// ==================================================
async function synthesizeStudioVoice(rawText, { role = 'auto', style = 'tumi', userText = '', incomingMood = '' } = {}) {
    const speechText = sanitizeTextForSpeech(rawText);
    if (!speechText || speechText.length < 2) return { ok: false, reason: 'empty_speech_text' };

    const mood = detectVoiceMood(rawText, userText, role, incomingMood);
    const cacheHash = getVoiceCacheHash(speechText, mood);
    const cacheFile = getVoiceCachePath(cacheHash);

    if (studioConfig.cacheEnabled && fs.existsSync(cacheFile)) {
        try {
            const cachedBuf = fs.readFileSync(cacheFile);
            if (cachedBuf.length > 500) {
                voiceStats.cacheHits += 1;
                return {
                    ok: true, buffer: cachedBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true,
                    provider: `${cacheIndex[cacheHash]?.provider || 'crystal'} (cache)`, mood, fromCache: true, ms: 1
                };
            }
        } catch {}
    }

    if (inFlightTts.has(cacheHash)) {
        voiceStats.dedupHits += 1;
        return inFlightTts.get(cacheHash);
    }

    const { skipTtsMb } = getDynamicVoiceRamLimits();
    if (getRssMb() >= skipTtsMb || ffmpegQueueDepth >= MAX_FFMPEG_QUEUE) {
        const offlineHit = findOfflineBankMatch(speechText, mood);
        if (offlineHit) {
            voiceStats.offlineBankHits++;
            voiceStats.byProvider.offline++;
            return {
                ok: true, buffer: offlineHit.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true,
                provider: offlineHit.provider, mood, fromCache: true, ms: 2
            };
        }
        return { ok: false, reason: 'ram_or_queue_guard' };
    }

    const jobPromise = (async () => {
        const started = Date.now();
        let result = null;
        const mode = studioConfig.providerMode || 'auto';

        if (mode === 'cloned') {
            result = await generateClonedVoice(speechText, mood) || await generateEdgeNeuralTts(speechText, mood);
        } else if (mode === 'gemini') {
            result = await generateGeminiTts(speechText, mood) || await generateEdgeNeuralTts(speechText, mood);
        } else if (mode === 'backup') {
            result = await generateBackupAiTts(speechText) || await generateEdgeNeuralTts(speechText, mood);
        } else if (mode === 'gtts') {
            result = await generateGoogleStudioTts(speechText) || await generateEdgeNeuralTts(speechText, mood);
        } else if (mode === 'edge') {
            result = await generateEdgeNeuralTts(speechText, mood) || await generateBackupAiTts(speechText) || await generateGoogleStudioTts(speechText);
        } else {
            // AUTO: Cloned -> Gemini -> Crystal Edge Neural -> Backup AI -> gTTS
            result = await generateClonedVoice(speechText, mood);
            if (!result) result = await generateGeminiTts(speechText, mood);
            if (!result) result = await generateEdgeNeuralTts(speechText, mood);
            if (!result) result = await generateBackupAiTts(speechText);
            if (!result) result = await generateGoogleStudioTts(speechText);
        }

        if (!result?.buffer) {
            const offlineHit = findOfflineBankMatch(speechText, mood);
            if (offlineHit) {
                voiceStats.offlineBankHits++;
                voiceStats.byProvider.offline++;
                return {
                    ok: true, buffer: offlineHit.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true,
                    provider: offlineHit.provider, mood, fromCache: true, ms: Date.now() - started
                };
            }
            voiceStats.failures += 1;
            return { ok: false, reason: 'all_tts_failed', ms: Date.now() - started };
        }

        const elapsed = Date.now() - started;
        voiceStats.totalGenerated += 1;
        voiceStats.avgGenMs = voiceStats.avgGenMs ? Math.round(voiceStats.avgGenMs * 0.75 + elapsed * 0.25) : elapsed;

        if (result.tier <= 3) {
            recordCachedVoice(cacheHash, result.buffer, { speechText, mood, provider: result.provider, tier: result.tier });
        }

        return {
            ok: true, buffer: result.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true,
            provider: result.provider, mood, fromCache: false, ms: elapsed
        };
    })().finally(() => {
        inFlightTts.delete(cacheHash);
    });

    inFlightTts.set(cacheHash, jobPromise);
    return jobPromise;
}

async function sendVoiceReply(sock, chatId, quotedMessage, rawText, role = 'auto', style = 'tumi', userText = '', incomingMood = '') {
    const res = await synthesizeStudioVoice(rawText, { role, style, userText, incomingMood });
    if (!res?.ok || !res.buffer) return null;

    console.log(`🎙️ ${BOT_NAME} v${BOT_VERSION} Voice via ${res.provider} [mood:${res.mood} | crystal:${studioConfig.studioMastering ? 'ON' : 'OFF'} | ${res.ms}ms]`);
    const opts = quotedMessage ? { quoted: quotedMessage } : {};
    return await safeSend(sock, chatId, { audio: res.buffer, mimetype: res.mimetype, ptt: true }, opts);
}

// ==================================================
// ৬. নয়েজ-প্রুফ ৩-স্তরের STT (Groq Whisper -> Dual-Gemini AIza/AQ. -> Backup AI)
// ==================================================
const STT_HALLUCINATIONS = [
    /^thank you(?: for watching| so much)?[.!]*$/i,
    /^thanks for watching[.!]*$/i,
    /^subtitles by.+$/i,
    /^please subscribe.+$/i,
    /সাবস্ক্রাইব করুন/,
    /ভিডিওটি দেখার জন্য ধন্যবাদ/
];

function isSttHallucination(text = '') {
    const clean = normalizeBn(text).trim();
    if (!clean || clean.length < 2) return true;
    if (STT_HALLUCINATIONS.some((rx) => rx.test(clean))) return true;
    const words = clean.split(/\s+/);
    if (words.length >= 6) {
        const freq = new Map();
        for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
        const max = Math.max(0, ...freq.values());
        if (max >= 5 && max / words.length >= 0.65) return true;
    }
    return false;
}

async function transcribeWithGroq(audioBuf, mimeType = 'audio/ogg') {
    const groqKeys = getKeysByFamily('groq').filter((k) => isProviderReady(k.id) && isValidHeaderKey(k.key));
    if (!groqKeys.length) return '';

    const models = await getLiveModelsForFamily('groq', 'stt').catch(() => []);
    const model = models[0] || 'whisper-large-v3-turbo';

    const startIdx = sttKeyCursor % groqKeys.length;
    sttKeyCursor = (sttKeyCursor + 1) % 10000;
    const ordered = [...groqKeys.slice(startIdx), ...groqKeys.slice(0, startIdx)];
    const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('mpeg') ? 'mp3' : 'ogg';
    const bdHint = 'বাংলাদেশি কথ্য বাংলা ও বাংলা-ইংরেজি। প্রাইম মনির, মায়া, রুট, ইনবক্স, গ্রুপ, টেকওভার, ভয়েস, মেসেজ, রিস্টার্ট, বিকাশ, নগদ, ভাই।';
    const sttTimeout = Number(settings.maya?.voice?.sttTimeoutMs) || 12000;

    for (const item of ordered) {
        const authKey = `stt_auth:${item.id}`;
        const slotKey = `stt:${item.id}`;
        if (!isVoiceSlotReady(authKey) || !isVoiceSlotReady(slotKey)) continue;

        try {
            const form = new FormData();
            form.append('model', model);
            form.append('language', 'bn');
            form.append('temperature', '0');
            form.append('prompt', bdHint);
            form.append('response_format', 'json');
            form.append('file', new Blob([audioBuf], { type: mimeType || 'audio/ogg' }), `voice.${ext}`);

            const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${item.key}` },
                body: form,
                signal: AbortSignal.timeout(sttTimeout)
            });

            if (res.ok) {
                const data = await res.json();
                const txt = normalizeBn(data?.text || '').trim();
                if (txt && !isSttHallucination(txt)) {
                    markVoiceSlotOk(slotKey);
                    return txt;
                }
            } else if ([401, 403].includes(res.status)) {
                markVoiceSlotCooldown(authKey, 600, `STT Auth ${res.status}`);
            } else {
                markVoiceSlotCooldown(slotKey, parseRetryAfterSec(res, 60), `STT ${res.status}`);
            }
        } catch (err) {
            markVoiceSlotCooldown(slotKey, 45, String(err?.message || 'err').slice(0, 30));
        }
    }
    return '';
}

// ডুয়াল-জেমিনি STT: AIza (AI Studio) ও AQ. (Vertex AI Express) — দুটোই সমর্থিত
async function transcribeWithGemini(audioBuf, mimeType = 'audio/ogg') {
    const gemKeys = getKeysByFamily('gemini')
        .filter((k) => isProviderReady(k.id) && classifyGeminiKeySafe(k.key) !== 'invalid');
    if (!gemKeys.length) return '';

    const models = await getLiveModelsForFamily('gemini', 'chat').catch(() => []);
    const model = models[0] || 'gemini-2.5-flash-lite';
    let b64 = audioBuf.toString('base64');

    try {
        for (const item of gemKeys.slice(0, 3)) {
            const slotKey = `stt_gem:${item.id}`;
            if (!isVoiceSlotReady(slotKey)) continue;

            const isVertex = classifyGeminiKeySafe(item.key) === 'vertex_express';
            const url = isVertex
                ? `${VERTEX_EXPRESS_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(item.key)}`
                : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
            const headers = { 'Content-Type': 'application/json' };
            if (!isVertex) headers['x-goog-api-key'] = item.key;

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: 'Transcribe this Bangladeshi Bangla/English audio accurately. Output ONLY the exact spoken words. If completely silent, output [NO_SPEECH].' },
                                { inlineData: { mimeType: (mimeType || 'audio/ogg').split(';')[0], data: b64 } }
                            ]
                        }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
                    }),
                    signal: AbortSignal.timeout(11000)
                });

                if (res.ok) {
                    const data = await res.json();
                    const txt = normalizeBn(data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join(' ') || '').trim();
                    if (txt && !txt.includes('[NO_SPEECH]') && !isSttHallucination(txt)) {
                        markVoiceSlotOk(slotKey);
                        return txt;
                    }
                } else {
                    markVoiceSlotCooldown(slotKey, [401, 403].includes(res.status) ? 600 : 60, `GemSTT ${res.status}`);
                }
            } catch {}
        }
        return '';
    } finally {
        b64 = '';
    }
}

async function transcribeWithBackup(audioBuf, mimeType = 'audio/ogg') {
    const fn = backupAI?.transcribeWithBackupAI || backupAI?.transcribeWithMahiruAI;
    if (typeof fn !== 'function') return '';
    if (typeof backupAI?.isBackupReady === 'function' && !backupAI.isBackupReady()) return '';
    try {
        const txt = normalizeBn(await fn(audioBuf, mimeType, 14000)).trim();
        return txt && !isSttHallucination(txt) ? txt : '';
    } catch {
        return '';
    }
}

async function transcribeAudioWithFailover(audioBuf, mimeType = 'audio/ogg') {
    if (!audioBuf || !audioBuf.length || audioBuf.length > MAX_STT_BYTES) return '';
    voiceStats.totalStt += 1;

    let text = await transcribeWithGroq(audioBuf, mimeType);
    if (!text) text = await transcribeWithGemini(audioBuf, mimeType);
    if (!text) text = await transcribeWithBackup(audioBuf, mimeType);
    return normalizeBn(text).trim();
}

async function transcribeWithEmotion(audioBuf, mimeType = 'audio/ogg') {
    const text = await transcribeAudioWithFailover(audioBuf, mimeType);
    if (!text) return { text: '', mood: 'neutral' };

    const lower = text.toLowerCase();
    let mood = 'neutral';
    if (/(ভালোবাসি|ভালবাসি|মিস|জান|কলিজা|বাবু|love)/i.test(lower)) mood = 'affectionate';
    else if (/(মন\s*খারাপ|কষ্ট|দুঃখ|কান্না|অসুস্থ|জ্বর|ব্যথা|ভালো\s*লাগছে\s*না|sad|sorry)/i.test(lower)) mood = 'sad';
    else if (/(রাগ|বিরক্ত|ফালতু|বিরক্তি|বাজে|angry)/i.test(lower)) mood = 'stern';
    else if (/(হাহা|মজা|খুশি|দারুণ|অসাধারণ|জোস|happy)/i.test(lower)) mood = 'happy';

    return { text, mood };
}

// ==================================================
// ৭. স্টুডিও কনফিগ, হুক ও স্ট্যাটস
// ==================================================
function updateVoiceStudioConfig(patch = {}) {
    if (patch.providerMode && VALID_PROVIDER_MODES.has(patch.providerMode)) {
        studioConfig.providerMode = patch.providerMode;
    }
    if (typeof patch.studioMastering === 'boolean') studioConfig.studioMastering = patch.studioMastering;
    if (typeof patch.cacheEnabled === 'boolean') studioConfig.cacheEnabled = patch.cacheEnabled;
    if (typeof patch.geminiVoiceName === 'string' && patch.geminiVoiceName.trim()) {
        studioConfig.geminiVoiceName = patch.geminiVoiceName.trim();
    }
    saveStudioConfig();
    return { ...studioConfig };
}

function getVoiceStudioStats() {
    let cachedFiles = 0;
    let cachedBytes = 0;
    try {
        for (const f of fs.readdirSync(VOICE_CACHE_DIR)) {
            if (!f.endsWith('.ogg')) continue;
            cachedFiles += 1;
            try { cachedBytes += fs.statSync(path.join(VOICE_CACHE_DIR, f)).size; } catch {}
        }
    } catch {}

    return {
        config: { ...studioConfig },
        clonedReady: Boolean(isValidHeaderKey(process.env.ELEVENLABS_API_KEY) && (process.env.ELEVENLABS_VOICE_ID || '').trim()),
        edgeReady: Boolean(MsEdgeTTS && OUTPUT_FORMAT),
        backupReady: Boolean(backupAI?.isBackupReady?.()),
        edgeVoices: { bn: EDGE_VOICE_BN, en: EDGE_VOICE_EN },
        cachedFiles,
        cachedKb: Math.round(cachedBytes / 1024),
        indexedOfflineClips: Object.keys(cacheIndex).length,
        ffmpegQueueDepth,
        inFlightJobs: inFlightTts.size,
        stats: { ...voiceStats }
    };
}

if (typeof registerCleanupHook === 'function') {
    registerCleanupHook('neuralVoice', () => {
        sweepVoiceCooldowns();
        pruneVoiceCache();
    });
}

process.once('beforeExit', () => {
    if (indexDirty) saveCacheIndex(true);
});

module.exports = {
    synthesizeStudioVoice,
    sendVoiceReply,
    transcribeAudioWithFailover,
    transcribeWithEmotion,
    resetVoiceApiHealth,
    updateVoiceStudioConfig,
    clearVoiceCache,
    pruneVoiceCache,
    getVoiceStudioStats
};
