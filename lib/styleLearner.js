/**
 * Mahiru Shiina • Mahiru v2.0 ULTRA — Deep Dual-Side Style Learner & RLHF-Lite Correction Engine
 * Features:
 *  - RLHF-Lite Correction Learning (learns automatically when Owner corrects Mahiru within 4 mins)
 *  - Relationship-Based Persona DNA (separate tone, length, emoji & script DNA per role)
 *  - Topic-Tagged Dual-Side Q&A Few-Shot Retriever (zero extra AI calls)
 *  - Owner Signature Slang & Vocabulary Extractor with Frequency Capping
 *  - Built-in Secret/OTP/PIN/API-Key Privacy Shield (never learns sensitive data)
 *  - 256MB RAM Tuned (Strict Bounded Maps/Arrays, Compact Atomic JSON, SystemOptimizer Hook)
 */

const fs = require('fs');
const path = require('path');

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

const DEFAULT_CONFIG = {
    dataFile: './data/maya_style_dna.json',
    correctionWindowMs: 4 * 60 * 1000,   // বট রিপ্লাইয়ের ৪ মিনিটের মধ্যে ওনার রিপ্লাই দিলে কারেকশন হিসেবে ধরবে
    pairWindowMs: 20 * 60 * 1000,        // ইউজার মেসেজের ২০ মিনিটের মধ্যে ওনার রিপ্লাই দিলে Q&A পেয়ার তৈরি হবে
    saveDebounceMs: 6000,
    maxContactsTracked: 100,
    maxPairsPerContact: 8,
    maxGlobalPairs: 40,
    maxCorrections: 30,
    maxVocabPerRole: 60,
    maxRecentBotReplies: 60,
    maxLastIncoming: 100
};

const VALID_ROLES = ['gf', 'friend', 'family', 'client', 'auto'];

const TOPIC_RULES = [
    { id: 'root_tech', rx: /(রুট|root|magisk|kernelsu|apatch|bootloader|twrp|orangefox|custom\s*rom|unbrick|আনব্রিক|বুটলুপ|bootloop|ফ্ল্যাশ|flash)/i },
    { id: 'vpn_config', rx: /(dark\s*tunnel|ডার্ক\s*টানেল|কনফিগ|config|vless|trojan|vpn|ভিপিএন|বাইপাস|bypass)/i },
    { id: 'dev_project', rx: /(ওয়েবসাইট|website|অ্যাপ|app\s*dev|বট|bot|কোড|code|react|firebase|supabase|প্রজেক্ট|project|সার্ভার)/i },
    { id: 'pricing', rx: /(দাম|চার্জ|টাকা|বাজেট|বিকাশ|নগদ|পেমেন্ট|price|cost|budget|bkash|nagad|অর্ডার)/i },
    { id: 'romantic', rx: /(ভালোবাসি|valobashi|love|miss|মিস|জান|jaan|বাবু|কলিজা|আদর|রাগ|অভিমান)/i },
    { id: 'emotional', rx: /(মন\s*খারাপ|কষ্ট|দুঃখ|কান্না|অসুস্থ|জ্বর|ব্যথা|সরি|sorry|টেনশন|tension|হতাশ)/i },
    { id: 'gaming', rx: /(free\s*fire|ফ্রি\s*ফায়ার|pubg|গেম|game|rank|ম্যাচ|match|কাস্টম)/i }
];

// গোপন ডেটা (OTP, পাসওয়ার্ড, পিন, API কী) কখনোই লার্নিংয়ে ঢুকবে না
const SECRET_GUARD_RE = /(?:AIza[0-9A-Za-z\-_]{25,}|gsk_[0-9A-Za-z]{20,}|sk-or-v1-[0-9a-f]{20,}|(?:password|পাসওয়ার্ড|পাসওয়ার্ড|pin|পিন|otp|ওটিপি|secret|api\s*key)\s*(?:হলো|হল|is|:|=)?\s*\S{3,})/i;
const BOT_BOILERPLATE_RE = /(?:Mahiru Shiina •|সিস্টেম স্ট্যাটাস|হেলথ স্কোর|ডায়নামিক ওনার|অ্যাক্সেস প্যানেল|Bot Connected)/i;
const STOP_WORDS = new Set([
    'আমি', 'তুমি', 'আপনি', 'তুই', 'সে', 'এটা', 'ওটা', 'কি', 'কী', 'না', 'হ্যাঁ', 'জ্বী',
    'আর', 'এবং', 'কিন্তু', 'তো', 'যে', 'একটা', 'এই', 'সেই', 'আমার', 'তোমার', 'আপনার', 'তোর',
    'the', 'is', 'am', 'are', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'my', 'your', 'ok', 'hi'
]);

function normalizeBn(str = '') {
    return String(str || '').normalize('NFC');
}

function detectTopic(text = '') {
    const clean = normalizeBn(text);
    for (const rule of TOPIC_RULES) {
        if (rule.rx.test(clean)) return rule.id;
    }
    return 'casual';
}

function detectScriptKind(text = '') {
    const clean = normalizeBn(text);
    const bnCount = (clean.match(/[\u0980-\u09FF]/g) || []).length;
    const latCount = (clean.match(/[a-zA-Z]/g) || []).length;
    if (bnCount >= 2) return 'bn';
    if (latCount >= 3) return 'banglish';
    return 'neutral';
}

function extractEmojis(text = '') {
    return String(text || '').match(/\p{Extended_Pictographic}/gu) || [];
}

function tokenize(text = '') {
    const matches = normalizeBn(text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
    return matches.filter((w) => !STOP_WORDS.has(w));
}

function lexicalOverlap(queryTokens, targetText = '') {
    if (!queryTokens.length || !targetText) return 0;
    const tSet = new Set(tokenize(targetText));
    if (!tSet.size) return 0;
    let hits = 0;
    for (const qt of queryTokens) {
        if (tSet.has(qt)) hits += 1;
    }
    return hits / Math.sqrt(queryTokens.length * Math.max(tSet.size, 2));
}

function createEmptyRoleDna() {
    return {
        samples: 0,
        avgLen: 42,
        emojiRate: 0.3,
        bnCount: 0,
        banglishCount: 0,
        topEmojis: Object.create(null),
        vocab: Object.create(null)
    };
}

function atomicWriteCompactJson(filePath, data) {
    let tmp = '';
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
        fs.renameSync(tmp, filePath);
        return true;
    } catch {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        return false;
    }
}

class StyleLearner {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        // পারসিস্টেড স্টেট
        this.state = {
            version: '2.0',
            roleDna: Object.create(null),
            globalPairs: [],              // { q, a, role, topic, ts }
            perContactPairs: Object.create(null), // chatKey -> [{ q, a, topic, ts }]
            corrections: [],              // { q, wrongBot, ownerFix, role, topic, ts }
            metrics: {
                ownerRepliesAnalyzed: 0,
                userMessagesAnalyzed: 0,
                correctionsLearned: 0,
                promptInjectionsServed: 0
            }
        };

        // শর্ট-টার্ম ইন-মেমোরি ট্র্যাকার (ডিস্কে সেভ হয় না)
        this.lastIncoming = new Map();     // chatKey -> { text, role, topic, ts }
        this.recentBotReplies = new Map(); // chatKey -> { userText, botReply, role, topic, ts }

        this.dirty = false;
        this.saveTimer = null;

        this.load();

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('styleLearner', () => this.sweepTransientMaps());
        }

        process.once('beforeExit', () => this.flush());
        global.styleLearner = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    load() {
        try {
            if (fs.existsSync(this.config.dataFile)) {
                const parsed = JSON.parse(fs.readFileSync(this.config.dataFile, 'utf8'));
                if (parsed && typeof parsed === 'object') {
                    this.state.roleDna = parsed.roleDna && typeof parsed.roleDna === 'object' ? parsed.roleDna : Object.create(null);
                    this.state.globalPairs = Array.isArray(parsed.globalPairs) ? parsed.globalPairs.slice(-this.config.maxGlobalPairs) : [];
                    this.state.perContactPairs = parsed.perContactPairs && typeof parsed.perContactPairs === 'object' ? parsed.perContactPairs : Object.create(null);
                    this.state.corrections = Array.isArray(parsed.corrections) ? parsed.corrections.slice(-this.config.maxCorrections) : [];
                    if (parsed.metrics && typeof parsed.metrics === 'object') {
                        this.state.metrics = { ...this.state.metrics, ...parsed.metrics };
                    }
                }
            }
        } catch {}

        for (const role of VALID_ROLES) {
            if (!this.state.roleDna[role]) this.state.roleDna[role] = createEmptyRoleDna();
        }
    }

    scheduleSave() {
        this.dirty = true;
        if (this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.flush();
        }, this.config.saveDebounceMs);
        if (this.saveTimer.unref) this.saveTimer.unref();
    }

    flush() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (!this.dirty) return false;
        this.enforceLimits();
        const ok = atomicWriteCompactJson(this.config.dataFile, this.state);
        if (ok) this.dirty = false;
        return ok;
    }

    enforceLimits() {
        if (this.state.globalPairs.length > this.config.maxGlobalPairs) {
            this.state.globalPairs = this.state.globalPairs.slice(-this.config.maxGlobalPairs);
        }
        if (this.state.corrections.length > this.config.maxCorrections) {
            this.state.corrections = this.state.corrections.slice(-this.config.maxCorrections);
        }

        const cKeys = Object.keys(this.state.perContactPairs);
        if (cKeys.length > this.config.maxContactsTracked) {
            const lastTs = (k) => {
                const arr = this.state.perContactPairs[k];
                return Array.isArray(arr) && arr.length ? (arr[arr.length - 1]?.ts || 0) : 0;
            };
            cKeys.sort((a, b) => lastTs(a) - lastTs(b));
            for (let i = 0; i < cKeys.length - this.config.maxContactsTracked; i++) {
                delete this.state.perContactPairs[cKeys[i]];
            }
        }

        for (const role of VALID_ROLES) {
            const dna = this.state.roleDna[role];
            if (!dna) continue;
            const vEntries = Object.entries(dna.vocab || {});
            if (vEntries.length > this.config.maxVocabPerRole) {
                dna.vocab = Object.fromEntries(vEntries.sort((a, b) => b[1] - a[1]).slice(0, Math.floor(this.config.maxVocabPerRole * 0.75)));
            }
            const eEntries = Object.entries(dna.topEmojis || {});
            if (eEntries.length > 20) {
                dna.topEmojis = Object.fromEntries(eEntries.sort((a, b) => b[1] - a[1]).slice(0, 12));
            }
        }
    }

    sweepTransientMaps() {
        const now = Date.now();
        for (const [k, v] of this.lastIncoming.entries()) {
            if (now - v.ts > this.config.pairWindowMs) this.lastIncoming.delete(k);
        }
        for (const [k, v] of this.recentBotReplies.entries()) {
            if (now - v.ts > this.config.correctionWindowMs) this.recentBotReplies.delete(k);
        }
    }

    // =========================================================================
    // ১. ডুয়াল-সাইড অবজারভেশন ও RLHF-Lite কারেকশন ক্যাপচার
    // =========================================================================

    observeUserMessage(chatKey, text = '', { role = 'auto' } = {}) {
        const clean = normalizeBn(text).replace(/\s+/g, ' ').trim();
        if (!chatKey || !clean || clean.startsWith('.') || clean.length < 2 || clean.length > 350) return;
        if (SECRET_GUARD_RE.test(clean)) return;

        const key = String(chatKey);
        const safeRole = VALID_ROLES.includes(role) ? role : 'auto';
        const topic = detectTopic(clean);

        if (this.lastIncoming.size >= this.config.maxLastIncoming && !this.lastIncoming.has(key)) {
            this.lastIncoming.delete(this.lastIncoming.keys().next().value);
        }
        this.lastIncoming.set(key, { text: clean.slice(0, 200), role: safeRole, topic, ts: Date.now() });
        this.state.metrics.userMessagesAnalyzed++;
    }

    observeBotReply(chatKey, userText = '', botReply = '', { role = 'auto' } = {}) {
        const cleanBot = normalizeBn(botReply).replace(/\s+/g, ' ').trim();
        const cleanUser = normalizeBn(userText).replace(/\s+/g, ' ').trim();
        if (!chatKey || !cleanBot || !cleanUser) return;
        if (SECRET_GUARD_RE.test(cleanBot) || BOT_BOILERPLATE_RE.test(cleanBot)) return;

        const key = String(chatKey);
        const safeRole = VALID_ROLES.includes(role) ? role : 'auto';
        const topic = detectTopic(cleanUser);

        if (this.recentBotReplies.size >= this.config.maxRecentBotReplies && !this.recentBotReplies.has(key)) {
            this.recentBotReplies.delete(this.recentBotReplies.keys().next().value);
        }
        this.recentBotReplies.set(key, {
            userText: cleanUser.slice(0, 180),
            botReply: cleanBot.slice(0, 200),
            role: safeRole,
            topic,
            ts: Date.now()
        });
    }

    observeOwnerReply(chatKey, ownerReply = '', { role = 'auto' } = {}) {
        const clean = normalizeBn(ownerReply).replace(/\s+/g, ' ').trim();
        if (!chatKey || !clean || clean.startsWith('.') || clean.length < 2 || clean.length > 360) return;
        if (SECRET_GUARD_RE.test(clean) || BOT_BOILERPLATE_RE.test(clean)) return;

        const key = String(chatKey);
        const safeRole = VALID_ROLES.includes(role) ? role : 'auto';
        const now = Date.now();

        // ১. Persona DNA আপডেট (রোল অনুযায়ী আলাদা স্টাইল)
        if (!this.state.roleDna[safeRole]) this.state.roleDna[safeRole] = createEmptyRoleDna();
        const dna = this.state.roleDna[safeRole];
        const emojis = extractEmojis(clean);
        const script = detectScriptKind(clean);

        dna.samples = (dna.samples || 0) + 1;
        dna.avgLen = Math.round((dna.avgLen || 42) * 0.85 + clean.length * 0.15);
        dna.emojiRate = Number(((dna.emojiRate || 0.3) * 0.85 + (emojis.length ? 1 : 0) * 0.15).toFixed(2));
        if (script === 'bn') dna.bnCount = (dna.bnCount || 0) + 1;
        else if (script === 'banglish') dna.banglishCount = (dna.banglishCount || 0) + 1;

        for (const em of emojis.slice(0, 3)) {
            dna.topEmojis[em] = (dna.topEmojis[em] || 0) + 1;
        }
        for (const w of tokenize(clean).slice(0, 10)) {
            if (w.length <= 18 && !/^https?:/i.test(w)) {
                dna.vocab[w] = (dna.vocab[w] || 0) + 1;
            }
        }

        // ২. RLHF-Lite কারেকশন ডিটেকশন (বট উত্তর দেওয়ার ৪ মিনিটের মধ্যে ওনার শুধরে দিলে)
        const recentBot = this.recentBotReplies.get(key);
        if (recentBot && (now - recentBot.ts) <= this.config.correctionWindowMs) {
            this.recentBotReplies.delete(key);
            // বটের উত্তরের সাথে ওনারের উত্তর হুবহু না মিললেই কারেকশন হিসেবে শিখবে
            const sim = lexicalOverlap(tokenize(clean), recentBot.botReply);
            if (sim < 0.7 && clean.length >= 4) {
                this.state.corrections.push({
                    q: recentBot.userText,
                    wrongBot: recentBot.botReply,
                    ownerFix: clean.slice(0, 220),
                    role: recentBot.role || safeRole,
                    topic: recentBot.topic || detectTopic(recentBot.userText),
                    ts: now
                });
                if (this.state.corrections.length > this.config.maxCorrections) {
                    this.state.corrections = this.state.corrections.slice(-this.config.maxCorrections);
                }
                this.state.metrics.correctionsLearned++;
            }
        }

        // ৩. টপিক-ট্যাগড Q&A পেয়ার সেভ (পার-কন্টাক্ট + গ্লোবাল)
        const lastIn = this.lastIncoming.get(key);
        if (lastIn && (now - lastIn.ts) <= this.config.pairWindowMs) {
            this.lastIncoming.delete(key);
            const topic = lastIn.topic || detectTopic(lastIn.text);
            const pair = {
                q: lastIn.text,
                a: clean.slice(0, 220),
                role: safeRole,
                topic,
                ts: now
            };

            if (!Array.isArray(this.state.perContactPairs[key])) {
                this.state.perContactPairs[key] = [];
            }
            this.state.perContactPairs[key].push(pair);
            if (this.state.perContactPairs[key].length > this.config.maxPairsPerContact) {
                this.state.perContactPairs[key] = this.state.perContactPairs[key].slice(-this.config.maxPairsPerContact);
            }

            this.state.globalPairs.push(pair);
            if (this.state.globalPairs.length > this.config.maxGlobalPairs) {
                this.state.globalPairs = this.state.globalPairs.slice(-this.config.maxGlobalPairs);
            }
        }

        this.state.metrics.ownerRepliesAnalyzed++;
        this.scheduleSave();
    }

    // =========================================================================
    // ২. প্রম্পট ইনজেকশন বিল্ডার (Persona DNA + RLHF কারেকশন + রিলেভ্যান্ট Q&A)
    // =========================================================================

    buildStylePromptBlock({ chatKey = '', role = 'auto', userText = '' } = {}) {
        const safeRole = VALID_ROLES.includes(role) ? role : 'auto';
        const topic = detectTopic(userText);
        const qTokens = tokenize(userText);
        const blocks = [];

        // ১. রোল-নির্দিষ্ট Persona DNA
        const dna = this.state.roleDna[safeRole] || this.state.roleDna.auto;
        if (dna && dna.samples >= 3) {
            const lenDesc = dna.avgLen < 45 ? 'খুব সংক্ষিপ্ত ও সরাসরি' : dna.avgLen < 95 ? 'মাঝারি ও সাবলীল' : 'বিস্তারিত ও গোছানো';
            const topEm = Object.entries(dna.topEmojis || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([e]) => e)
                .join(' ');
            const topWords = Object.entries(dna.vocab || {})
                .filter(([, c]) => c >= 2)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([w]) => w)
                .join(', ');

            const dnaLine = `• [${safeRole.toUpperCase()} DNA]: ${lenDesc} টোন${topEm ? ` | প্রিয় ইমোজি: ${topEm}` : ''}${topWords ? ` | পরিচিত শব্দ: ${topWords}` : ''}`;
            blocks.push(dnaLine);
        }

        // ২. RLHF-Lite কারেকশন মেমোরি (আগে ভুল করলে তা আর কখনো করবে না)
        if (this.state.corrections.length && qTokens.length) {
            const rankedFixes = this.state.corrections
                .map((c) => {
                    let s = lexicalOverlap(qTokens, c.q);
                    if (c.topic === topic) s += 0.35;
                    if (c.role === safeRole) s += 0.2;
                    return { c, s };
                })
                .filter((x) => x.s >= 0.35)
                .sort((a, b) => b.s - a.s || (b.c.ts || 0) - (a.c.ts || 0))
                .slice(0, 2);

            if (rankedFixes.length) {
                blocks.push(
                    '# বসের সরাসরি কারেকশন (অবশ্যই অনুসরণ করবে):\n' +
                    rankedFixes.map(({ c }) => `- প্রশ্ন: "${c.q}" -> ভুল এড়াও, বসের সঠিক উত্তর: "${c.ownerFix}"`).join('\n')
                );
            }
        }

        // ৩. সেরা Q&A উদাহরণ (কন্টাক্ট-নির্দিষ্ট অগ্রাধিকার -> গ্লোবাল ব্যাকআপ)
        const contactPool = chatKey ? (this.state.perContactPairs[String(chatKey)] || []) : [];
        const combinedPool = contactPool.length ? contactPool : this.state.globalPairs;

        if (combinedPool.length && qTokens.length) {
            const rankedPairs = combinedPool
                .map((p) => {
                    let s = lexicalOverlap(qTokens, p.q);
                    if (p.topic === topic) s += 0.3;
                    if (p.role === safeRole) s += 0.15;
                    return { p, s };
                })
                .filter((x) => x.s >= 0.25)
                .sort((a, b) => b.s - a.s || (b.p.ts || 0) - (a.p.ts || 0))
                .slice(0, 3);

            if (rankedPairs.length) {
                blocks.push(
                    '# রিয়েল-লাইফ কথা বলার উদাহরণ:\n' +
                    rankedPairs.map(({ p }) => `- ইউজার: "${p.q}" -> বস: "${p.a}"`).join('\n')
                );
            }
        }

        if (!blocks.length) return '';
        this.state.metrics.promptInjectionsServed++;
        return `\n[DEEP STYLE DNA & RLHF LEARNING]\n${blocks.join('\n')}`;
    }

    // =========================================================================
    // ৩. ওনার রিপোর্ট, স্ট্যাটাস ও রিসেট API
    // =========================================================================

    resetData(scope = 'all') {
        const clean = String(scope || 'all').trim().toLowerCase();
        if (clean === 'all') {
            this.state.roleDna = Object.create(null);
            for (const r of VALID_ROLES) this.state.roleDna[r] = createEmptyRoleDna();
            this.state.globalPairs = [];
            this.state.perContactPairs = Object.create(null);
            this.state.corrections = [];
            this.lastIncoming.clear();
            this.recentBotReplies.clear();
            this.dirty = true;
            this.flush();
            return true;
        }
        if (VALID_ROLES.includes(clean)) {
            this.state.roleDna[clean] = createEmptyRoleDna();
            this.dirty = true;
            this.flush();
            return true;
        }
        if (this.state.perContactPairs[scope]) {
            delete this.state.perContactPairs[scope];
            this.dirty = true;
            this.flush();
            return true;
        }
        return false;
    }

    getStats() {
        return {
            contactsLearned: Object.keys(this.state.perContactPairs).length,
            globalPairs: this.state.globalPairs.length,
            correctionsStored: this.state.corrections.length,
            ...this.state.metrics
        };
    }

    formatStyleReport() {
        const s = this.getStats();
        const roleLines = VALID_ROLES
            .map((r) => {
                const d = this.state.roleDna[r];
                if (!d || !d.samples) return null;
                return `• *${r.toUpperCase()}:* ${d.samples} স্যাম্পল | গড় ${d.avgLen} অক্ষর | ইমোজি ${Math.round((d.emojiRate || 0) * 100)}%`;
            })
            .filter(Boolean);

        return [
            '🧬 *Mahiru Shiina • ডিপ স্টাইল লার্নিং ও RLHF রিপোর্ট*',
            '──────────────────',
            `• ওনার রিপ্লাই বিশ্লেষণ: *${s.ownerRepliesAnalyzed}টি*`,
            `• RLHF কারেকশন শেখা: *${s.correctionsLearned}টি* (স্টোরড: ${s.correctionsStored})`,
            `• কন্টাক্ট প্রোফাইল: *${s.contactsLearned}জন* | গ্লোবাল Q&A: *${s.globalPairs}টি*`,
            ...(roleLines.length ? ['──────────────────', ...roleLines] : [])
        ].join('\n');
    }
}

const styleLearner = new StyleLearner();

module.exports = {
    StyleLearner,
    styleLearner,
    observeUserMessage: (key, text, opts) => styleLearner.observeUserMessage(key, text, opts),
    observeBotReply: (key, uText, bReply, opts) => styleLearner.observeBotReply(key, uText, bReply, opts),
    observeOwnerReply: (key, reply, opts) => styleLearner.observeOwnerReply(key, reply, opts),
    buildStylePromptBlock: (opts) => styleLearner.buildStylePromptBlock(opts),
    resetStyleData: (scope) => styleLearner.resetData(scope),
    getStyleLearnerStats: () => styleLearner.getStats(),
    formatStyleReport: () => styleLearner.formatStyleReport(),
    flushStyleLearner: () => styleLearner.flush()
};
