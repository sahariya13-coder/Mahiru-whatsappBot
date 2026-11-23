/**
 * PRIME MONIR • Maya v1.0 ULTIMATE — Dual-Gemini (AIza + AQ.), Multi-Provider AI & Emergency Backup Orchestrator
 * Tuned for 256MB-356MB Cloud RAM (Bounded 40-Slot Health Map, Single-Encode Media, Zero-Leak Backup Bridge)
 * Features: AIza (AI Studio) + AQ. (Vertex AI Express) Dual Routing + Automatic backupAI Failover
 *           + Global Persona Shield + Live Asia/Dhaka Time Injection + Bangla-First Model Ranking
 * 100% Backward-Compatible Exports
 */

const fs = require('fs');
const path = require('path');

let settings = null;
try { settings = require('../settings'); } catch {}

let chalk;
try {
    chalk = require('chalk');
} catch {
    chalk = { cyan: (s) => s, yellow: (s) => s, green: (s) => s, red: (s) => s };
}

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

let backupAI = null;
try { backupAI = require('./backupAI'); } catch {
    try { backupAI = require('./mahiruAI'); } catch {}
}

const VALID_PROVIDERS = new Set(['auto', 'gemini', 'groq', 'openrouter', 'backup']);
const aiCfg = settings?.maya?.ai || {};

const DEFAULT_CONFIG = {
    prefsFile: './data/ai_prefs.json',
    defaultPrimary: aiCfg.defaultPrimary || 'auto',
    discoveryIntervalMs: 6 * 60 * 60 * 1000,
    attemptTimeoutMs: Number(aiCfg.attemptTimeoutMs || 15000),
    openRouterTimeoutMs: Number(aiCfg.openRouterTimeoutMs || 11000),
    totalBudgetMs: Number(aiCfg.totalBudgetMs || 30000),
    fastRewriteTimeoutMs: 6500,
    baseCooldown429Ms: Number(aiCfg.baseCooldown429Ms || 75 * 1000),
    maxCooldown429Ms: 15 * 60 * 1000,
    deadKeyQuarantineMs: 45 * 60 * 1000,
    noBalanceQuarantineMs: 6 * 60 * 60 * 1000,
    maxAttemptsPerCall: 6,
    maxSlotHealthEntries: 40,
    vertexExpressBaseUrl: String(
        aiCfg.vertexExpressBaseUrl || 'https://aiplatform.googleapis.com/v1/publishers/google/models'
    ).replace(/\/+$/, ''),
    appReferer: settings?.ownerWebsite || '',
    appTitle: `${settings?.botName || 'Mahiru Shiina'} AI v${String(settings?.version || '3.0.8').replace(/^v/i, '')}`
};

// বাংলা কথ্য ভাষা ও পার্সোনা-দক্ষ মডেল সবার আগে
const FALLBACK_MODELS = Object.freeze({
    gemini: [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash'
    ],
    groq: [
        'llama-3.3-70b-versatile',
        'qwen/qwen3-32b',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-20b',
        'openai/gpt-oss-120b'
    ],
    groqVision: [
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct'
    ],
    openrouter: [
        'openrouter/free',
        'google/gemma-4-26b-a4b-it:free',
        'google/gemma-4-31b-it:free'
    ]
});

const GEMINI_EXCLUDE_RE = /(?:tts|embedding|imagen|veo|aqa|bison|gecko|audio|live|dialog|robotics|computer-use|learnlm|deep-research|thinking|image|customtools|argon|carbon|hydrogen|\bpro\b|\bultra\b|\bexp\b)/i;
const GROQ_EXCLUDE_RE = /(?:whisper|guard|tts|playai|orpheus|distil-whisper|prompt-guard|safeguard|embed|moderation|compound|allam)/i;
const VISION_MODEL_RE = /(?:gemini|vision|vl\b|llama-4-scout|llama-4-maverick|gemma-3|gemma-4|pixtral|gpt-4o|claude-3)/i;
const GROQ_JSON_SAFE_RE = /(?:llama-3\.3|llama-3\.1|llama-4|qwen)/i;
const GLITCH_TRAIN_RE = /[🚅🚄🚆🚇🚈🚉🚊🚝🚞🚋]+/gu;
const TRAIN_TOPIC_RE = /(ট্রেন|রেল|স্টেশন|টিকিট|train|rail|station|metro)/i;

function getRssMb() {
    return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

function getDynamicDiscoveryGuardMb() {
    const soft = Number(settings?.maya?.optimizer?.ramSoftLimitMb) || 235;
    return Math.max(205, soft - 20);
}

// ডুয়াল-জেমিনি ক্লাসিফায়ার: AIza -> AI Studio | AQ. -> Vertex AI Express Mode
function classifyGeminiKey(key = '') {
    const k = String(key || '').trim();
    if (k.length < 16 || !/^[\x21-\x7E]+$/.test(k)) return 'invalid';
    if (k.startsWith('AQ.')) return 'vertex_express';
    if (k.startsWith('AIza')) return 'ai_studio';
    return 'invalid';
}

// Strict ASCII + Dual-Gemini (AIza ও AQ. উভয়ই সমর্থিত) কী নরম্যালাইজার
function normalizeKeyList(input, provider = '') {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : String(input).split(/[\s,;]+/);
    const clean = [];
    for (const raw of arr) {
        const k = String(raw || '').trim().replace(/^["']+|["']+$/g, '');
        if (k.length < 16 || !/^[\x21-\x7E]+$/.test(k)) continue;
        if (provider === 'gemini' && classifyGeminiKey(k) === 'invalid') continue;
        clean.push(k);
    }
    return [...new Set(clean)];
}

function parseRetryAfterMs(res) {
    try {
        const hdr = res?.headers?.get?.('retry-after');
        if (!hdr) return 0;
        const sec = Number(hdr);
        if (Number.isFinite(sec) && sec > 0) {
            return Math.min(Math.max(sec * 1000, 15000), 15 * 60 * 1000);
        }
    } catch {}
    return 0;
}

function stripReasoningArtifacts(text = '', userText = '') {
    const assistantName = settings?.assistantName || 'মায়া';
    let out = String(text || '')
        .replace(/<(?:think|reasoning|thought)>[\s\S]*?<\/(?:think|reasoning|thought)>/gi, '')
        .replace(/<(?:think|reasoning|thought)>[\s\S]*$/gi, '')
        .replace(/\bMahiru\s+Shiina\b/gi, assistantName)
        .replace(/\bMahiru\b/gi, assistantName)
        .replace(/মাহিরু\s*শিনা/g, assistantName)
        .replace(/মাহিরু/g, assistantName);

    if (settings?.maya?.emoji?.disableTrailingSignatureEmoji !== false && !TRAIN_TOPIC_RE.test(String(userText || ''))) {
        out = out.replace(GLITCH_TRAIN_RE, '');
    }
    return out.trim();
}

// ==================================================
// ১. গ্লোবাল পার্সোনা শিল্ড ও লাইভ ঢাকার সময় ইনজেক্টর (১ মিনিট ক্যাশড)
// ==================================================
let cachedTimeLine = { minuteBucket: -1, text: '' };

function getDhakaLiveTimeContext() {
    const now = Date.now();
    const bucket = Math.floor(now / 60000);
    if (cachedTimeLine.minuteBucket === bucket && cachedTimeLine.text) {
        return cachedTimeLine.text;
    }

    const tz = settings?.timezone || 'Asia/Dhaka';
    const d = new Date(now);
    const hour24 = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(d)
    ) || 0;

    let periodBn = 'রাত';
    if (hour24 >= 5 && hour24 < 12) periodBn = 'সকাল';
    else if (hour24 >= 12 && hour24 < 16) periodBn = 'দুপুর';
    else if (hour24 >= 16 && hour24 < 18) periodBn = 'বিকাল';
    else if (hour24 >= 18 && hour24 < 20) periodBn = 'সন্ধ্যা';

    const timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(d);

    const dateStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(d);

    const text = `বর্তমান বাংলাদেশ সময় (Asia/Dhaka): ${dateStr}, ${periodBn} ${timeStr}। সময়ের সাথে মিলিয়ে শুভেচ্ছা দেবে (রাতে কখনোই "দিনটা শুভ হোক" বলবে না)।`;
    cachedTimeLine = { minuteBucket: bucket, text };
    return text;
}

function buildGuardedSystemPrompt(rawSystemPrompt = '', { jsonMode = false, skipPersonaShield = false } = {}) {
    const base = String(rawSystemPrompt || '').trim();
    if (jsonMode || skipPersonaShield) return base;

    const personaCfg = settings?.maya?.persona || {};
    const rules = [];

    if (personaCfg.identityLock !== false && !/\[IDENTITY_SHIELD\]/.test(base)) {
        const assistantName = settings?.assistantName || 'মায়া';
        const ownerName = settings?.ownerDisplayName || settings?.botOwner || 'MSK';
        rules.push(
            `[IDENTITY_SHIELD] তোমার নাম "${assistantName}", তুমি "${ownerName}"-এর নিজস্ব স্মার্ট এআই অ্যাসিস্ট্যান্ট। কেউ কোন এআই বা মডেল জানতে চাইলে বলবে তুমি ${ownerName}-এর তৈরি "${assistantName}"—কখনোই নিজেকে OpenAI, GPT-4, ChatGPT, Llama বা Mahiru বলবে না।`
        );
    }

    if (personaCfg.allowFakeCallPromises === false && !/\[CALL_BOUNDARY\]/.test(base)) {
        rules.push(
            `[CALL_BOUNDARY] তুমি সরাসরি ভয়েস/হোয়াটসঅ্যাপ কল দিতে পারো না। কেউ কল করতে বললে কখনোই নম্বর চাইবে না বা "এখনই কল দিচ্ছি" বলবে না—ভদ্রভাবে বলবে তুমি সরাসরি কল দিতে পারো না, তবে ${settings?.ownerDisplayName || settings?.botOwner || 'MSK'}-কে জানিয়ে দিয়েছ, উনি ফ্রি হলেই কল করবেন।`
        );
    }

    if (personaCfg.liveDhakaTimeContext !== false && !/Asia\/Dhaka/.test(base)) {
        rules.push(`[LIVE_TIME] ${getDhakaLiveTimeContext()}`);
    }

    if (settings?.maya?.emoji?.disableTrailingSignatureEmoji !== false) {
        rules.push('[STYLE_CLEAN] প্রতিটি মেসেজের শেষে অপ্রাসঙ্গিক ট্রেন ইমোজি বা একই ইমোজি বারবার জুড়বে না। স্বাভাবিক, সংক্ষিপ্ত ও আন্তরিক বাংলাদেশি মানুষের মতো কথা বলবে।');
    }

    if (!rules.length) return base;
    return base ? `${base}\n\n${rules.join('\n')}` : rules.join('\n');
}

function extractBalancedJson(raw = '') {
    const cleaned = stripReasoningArtifacts(raw)
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    if (!cleaned) return null;
    try { return JSON.parse(cleaned); } catch {}

    const startObj = cleaned.indexOf('{');
    const startArr = cleaned.indexOf('[');
    let start = -1;
    let openCh = '{';
    let closeCh = '}';

    if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
        start = startObj;
    } else if (startArr !== -1) {
        start = startArr;
        openCh = '[';
        closeCh = ']';
    }
    if (start === -1) return null;

    let depth = 0;
    let inStr = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inStr) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === openCh) depth++;
        else if (ch === closeCh) {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
            }
        }
    }
    return null;
}

function normalizeMediaPartsOnce(mediaParts = []) {
    if (!Array.isArray(mediaParts) || !mediaParts.length) return [];
    const out = [];
    for (const m of mediaParts) {
        if (!m?.mimeType) continue;
        const b64 = Buffer.isBuffer(m.data)
            ? m.data.toString('base64')
            : String(m.data || '');
        if (!b64) continue;
        out.push({ mimeType: String(m.mimeType).toLowerCase(), base64: b64 });
    }
    return out;
}

function createAbortWithTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    if (timer.unref) timer.unref();
    return { controller, clear: () => clearTimeout(timer) };
}

class AIOrchestrator {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        this.keys = { gemini: [], groq: [], openrouter: [] };
        this.models = {
            gemini: [...FALLBACK_MODELS.gemini],
            groq: [...FALLBACK_MODELS.groq],
            groqVision: [...FALLBACK_MODELS.groqVision],
            openrouter: [...FALLBACK_MODELS.openrouter]
        };

        this.slotHealth = new Map();
        this.keyQuarantine = new Map();
        this.rrCursor = { gemini: 0, groq: 0, openrouter: 0 };

        this.prefs = {
            primaryProvider: this.config.defaultPrimary,
            preferredModels: {}
        };

        this.lastDiscoveryAt = 0;
        this.discoveryInFlight = false;

        this.metrics = {
            totalRequests: 0,
            totalSuccess: 0,
            totalFailed: 0,
            totalFailovers: 0,
            byProvider: { gemini: 0, groq: 0, openrouter: 0, backup: 0 },
            jsonSuccess: 0,
            fastRewrites: 0
        };

        this.loadPrefs();

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('aiOrchestrator', () => this.sweepExpiredCooldowns());
        }

        global.aiOrchestrator = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    loadPrefs() {
        try {
            if (!fs.existsSync(this.config.prefsFile)) return;
            const parsed = JSON.parse(fs.readFileSync(this.config.prefsFile, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                this.prefs = {
                    primaryProvider: VALID_PROVIDERS.has(parsed.primaryProvider)
                        ? parsed.primaryProvider
                        : this.config.defaultPrimary,
                    preferredModels: parsed.preferredModels && typeof parsed.preferredModels === 'object'
                        ? parsed.preferredModels
                        : {}
                };
            }
        } catch {
            this.prefs = { primaryProvider: this.config.defaultPrimary, preferredModels: {} };
        }
    }

    savePrefs() {
        let tmp = '';
        try {
            const dir = path.dirname(this.config.prefsFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            tmp = `${this.config.prefsFile}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(tmp, JSON.stringify(this.prefs, null, 2), 'utf8');
            fs.renameSync(tmp, this.config.prefsFile);
        } catch {
            if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        }
    }

    ensureKeysLoadedFromSettings() {
        const total = this.keys.gemini.length + this.keys.groq.length + this.keys.openrouter.length;
        if (total > 0) return;
        try {
            if (typeof settings?.getAIKeys === 'function') {
                const k = settings.getAIKeys();
                this.keys.gemini = normalizeKeyList(k?.geminiKeys, 'gemini');
                this.keys.groq = normalizeKeyList(k?.groqKeys, 'groq');
                this.keys.openrouter = normalizeKeyList(k?.openrouterKeys, 'openrouter');
            }
        } catch {}
    }

    setApiKeys({ geminiKeys, groqKeys, openrouterKeys, autoDiscover = true } = {}) {
        if (geminiKeys !== undefined) this.keys.gemini = normalizeKeyList(geminiKeys, 'gemini');
        if (groqKeys !== undefined) this.keys.groq = normalizeKeyList(groqKeys, 'groq');
        if (openrouterKeys !== undefined) this.keys.openrouter = normalizeKeyList(openrouterKeys, 'openrouter');

        if (autoDiscover) {
            this.discoverModels().catch(() => {});
        }
        return this;
    }

    setPrimaryProvider(input = '') {
        const s = String(input || '').trim().toLowerCase();
        const aliasMap = {
            auto: 'auto', 'অটো': 'auto',
            gemini: 'gemini', 'জেমিনি': 'gemini',
            groq: 'groq', 'গ্রোক': 'groq',
            openrouter: 'openrouter', or: 'openrouter', 'ওপেনরাউটার': 'openrouter',
            backup: 'backup', 'ব্যাকআপ': 'backup'
        };
        const normalized = aliasMap[s];
        if (!normalized || !VALID_PROVIDERS.has(normalized)) return false;

        this.prefs.primaryProvider = normalized;
        this.savePrefs();
        return true;
    }

    setPreferredModel(provider, modelName = '') {
        if (!['gemini', 'groq', 'openrouter'].includes(provider)) return false;
        const clean = String(modelName || '').trim();
        if (!clean || clean.toLowerCase() === 'auto') {
            delete this.prefs.preferredModels[provider];
        } else {
            this.prefs.preferredModels[provider] = clean;
        }
        this.savePrefs();
        return true;
    }

    resetHealth() {
        this.slotHealth.clear();
        this.keyQuarantine.clear();
        this.lastDiscoveryAt = 0;
        try { backupAI?.resetBackupCooldown?.(); } catch {}
        return this;
    }

    // --- বাউন্ডেড সার্কিট-ব্রেকার ও হেলথ স্কোরিং ---
    getSlotState(slotId) {
        let st = this.slotHealth.get(slotId);
        if (!st) {
            if (this.slotHealth.size >= this.config.maxSlotHealthEntries) {
                this.evictOldestSlotState();
            }
            st = {
                cooldownUntil: 0,
                consecutive429: 0,
                consecutiveErr: 0,
                successCount: 0,
                failCount: 0,
                ewmaMs: 2200,
                lastUsedAt: Date.now(),
                lastError: ''
            };
            this.slotHealth.set(slotId, st);
        }
        st.lastUsedAt = Date.now();
        return st;
    }

    evictOldestSlotState() {
        let oldestKey = null;
        let oldestTs = Infinity;
        for (const [k, v] of this.slotHealth.entries()) {
            if ((v.lastUsedAt || 0) < oldestTs) {
                oldestTs = v.lastUsedAt || 0;
                oldestKey = k;
            }
        }
        if (oldestKey) this.slotHealth.delete(oldestKey);
    }

    isKeyQuarantined(provider, keyIndex) {
        const id = `${provider}#${keyIndex}`;
        const exp = this.keyQuarantine.get(id) || 0;
        if (exp <= Date.now()) {
            this.keyQuarantine.delete(id);
            return false;
        }
        return true;
    }

    quarantineKey(provider, keyIndex, reason = 'auth_error', durationMs = null) {
        const id = `${provider}#${keyIndex}`;
        const ms = durationMs || this.config.deadKeyQuarantineMs;
        this.keyQuarantine.set(id, Date.now() + ms);
        console.log(chalk.red(`🚫 [AI] Key ${id} quarantined ${Math.round(ms / 60000)}m (${reason})`));
    }

    isSlotCoolingDown(slotId) {
        const st = this.slotHealth.get(slotId);
        return Boolean(st && st.cooldownUntil > Date.now());
    }

    recordSlotSuccess(slotId, elapsedMs) {
        const st = this.getSlotState(slotId);
        st.cooldownUntil = 0;
        st.consecutive429 = 0;
        st.consecutiveErr = 0;
        st.successCount++;
        st.lastError = '';
        st.ewmaMs = st.successCount === 1
            ? elapsedMs
            : Math.round(st.ewmaMs * 0.7 + elapsedMs * 0.3);
    }

    recordSlotFailure(slotId, { status = 0, isTimeout = false, reason = 'error', retryAfterMs = 0 } = {}) {
        const st = this.getSlotState(slotId);
        st.failCount++;
        st.lastError = String(reason || 'error').slice(0, 80);

        if (status === 429) {
            st.consecutive429++;
            const factor = Math.pow(2.2, Math.min(st.consecutive429 - 1, 4));
            const expCd = Math.min(this.config.maxCooldown429Ms, Math.round(this.config.baseCooldown429Ms * factor));
            const cdMs = Math.max(expCd, retryAfterMs || 0);
            st.cooldownUntil = Date.now() + cdMs;
            console.log(chalk.yellow(`⚠️ [AI] ${slotId} HTTP 429 -> ${Math.round(cdMs / 1000)}s cooldown (streak #${st.consecutive429})`));
        } else if (status === 404) {
            st.consecutiveErr++;
            st.cooldownUntil = Date.now() + 30 * 60 * 1000;
        } else if (status === 400) {
            st.consecutiveErr++;
            st.cooldownUntil = Date.now() + 90 * 1000;
        } else if (isTimeout || status >= 500 || status === 0) {
            st.consecutiveErr++;
            const cdMs = Math.min(4 * 60 * 1000, 30 * 1000 * st.consecutiveErr);
            st.cooldownUntil = Date.now() + cdMs;
        } else {
            st.consecutiveErr++;
            if (st.consecutiveErr >= 2) st.cooldownUntil = Date.now() + 60 * 1000;
        }
    }

    scoreCandidate(provider, slotId, modelIndex, preferSpeed = false) {
        const st = this.slotHealth.get(slotId);
        let base = provider === 'gemini' ? 100 : provider === 'groq' ? 95 : 45;

        if (this.prefs.primaryProvider !== 'auto' && this.prefs.primaryProvider === provider) {
            base += 60;
        }
        base -= modelIndex * 4;

        if (st) {
            const total = st.successCount + st.failCount;
            if (total > 0) base += ((st.successCount / total) - 0.5) * 25;
            const latencyWeight = preferSpeed ? 14 : 6;
            base -= Math.min(30, (st.ewmaMs / 1000) * (latencyWeight / 3));
            base -= st.consecutive429 * 10;
        }
        return base;
    }

    // --- মাল্টি-কী ও ডায়নামিক RAM-গার্ডেড লাইভ মডেল অটো-ডিসকভারি (AQ. কী সুরক্ষিত) ---
    async discoverModels(force = false) {
        const now = Date.now();
        if (this.discoveryInFlight) return this.models;
        if (!force && this.lastDiscoveryAt && (now - this.lastDiscoveryAt) < this.config.discoveryIntervalMs) {
            return this.models;
        }

        this.ensureKeysLoadedFromSettings();
        this.discoveryInFlight = true;
        try {
            const tasks = [];

            // ১. Gemini Flash-Only ডিসকভারি (শুধু AIza কী দিয়ে চলবে—যাতে AQ. Vertex Express কী কোয়ারেন্টাইন না হয়)
            if (this.keys.gemini.length > 0) {
                tasks.push((async () => {
                    for (let idx = 0; idx < this.keys.gemini.length; idx++) {
                        const key = this.keys.gemini[idx];
                        if (classifyGeminiKey(key) !== 'ai_studio') continue;

                        const keyIndex = idx + 1;
                        if (this.isKeyQuarantined('gemini', keyIndex)) continue;
                        const { controller, clear } = createAbortWithTimeout(8500);
                        try {
                            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
                                headers: { 'x-goog-api-key': key },
                                signal: controller.signal
                            });
                            if (res.status === 401 || res.status === 403) {
                                this.quarantineKey('gemini', keyIndex, `Discovery HTTP ${res.status}`);
                                continue;
                            }
                            if (!res.ok) continue;

                            const data = await res.json();
                            const rawModels = Array.isArray(data?.models) ? data.models : [];
                            const flashModels = rawModels
                                .filter((m) =>
                                    Array.isArray(m.supportedGenerationMethods) &&
                                    m.supportedGenerationMethods.includes('generateContent') &&
                                    /flash/i.test(m.name) &&
                                    !GEMINI_EXCLUDE_RE.test(m.name)
                                )
                                .map((m) => String(m.name).replace(/^models\//, ''));

                            if (flashModels.length > 0) {
                                flashModels.sort((a, b) => {
                                    const verA = parseFloat((a.match(/gemini-(\d+(?:\.\d+)?)/i) || [0, 0])[1]) || 0;
                                    const verB = parseFloat((b.match(/gemini-(\d+(?:\.\d+)?)/i) || [0, 0])[1]) || 0;
                                    if (verB !== verA) return verB - verA;
                                    const liteDiff = (/lite/i.test(b) ? 1 : 0) - (/lite/i.test(a) ? 1 : 0);
                                    if (liteDiff !== 0) return liteDiff;
                                    return (/preview/i.test(a) ? 1 : 0) - (/preview/i.test(b) ? 1 : 0);
                                });
                                this.models.gemini = [...new Set([...flashModels.slice(0, 5), ...FALLBACK_MODELS.gemini])];
                                console.log(chalk.cyan(`🔍 [AI] Discovered Gemini Flash: ${this.models.gemini.slice(0, 4).join(', ')}`));
                            }
                            break;
                        } catch {} finally { clear(); }
                    }
                })());
            }

            // ২. Groq লাইভ ডিসকভারি (বাংলা-দক্ষ Llama 3.3 ও Qwen সবার আগে)
            if (this.keys.groq.length > 0) {
                tasks.push((async () => {
                    for (let idx = 0; idx < this.keys.groq.length; idx++) {
                        const keyIndex = idx + 1;
                        if (this.isKeyQuarantined('groq', keyIndex)) continue;
                        const { controller, clear } = createAbortWithTimeout(8500);
                        try {
                            const res = await fetch('https://api.groq.com/openai/v1/models', {
                                headers: { Authorization: `Bearer ${this.keys.groq[idx]}` },
                                signal: controller.signal
                            });
                            if (res.status === 401 || res.status === 403) {
                                this.quarantineKey('groq', keyIndex, `Discovery HTTP ${res.status}`);
                                continue;
                            }
                            if (!res.ok) continue;

                            const data = await res.json();
                            const ids = (Array.isArray(data?.data) ? data.data : [])
                                .filter((m) => m?.active !== false && m?.id)
                                .map((m) => String(m.id))
                                .filter((id) => !GROQ_EXCLUDE_RE.test(id));

                            const vision = ids.filter((id) => /llama-4-(?:scout|maverick)/i.test(id));
                            const textChat = ids.filter((id) => /(?:llama-3\.3-70b|llama-3\.1-8b|qwen|llama-4|gpt-oss)/i.test(id));

                            if (vision.length > 0) {
                                this.models.groqVision = [...new Set([...vision, ...FALLBACK_MODELS.groqVision])];
                            }
                            if (textChat.length > 0) {
                                textChat.sort((a, b) => {
                                    const rank = (id) => {
                                        if (/llama-3\.3-70b/i.test(id)) return 1;
                                        if (/qwen/i.test(id)) return 2;
                                        if (/llama-4-scout/i.test(id)) return 3;
                                        if (/llama-3\.1-8b/i.test(id)) return 4;
                                        if (/gpt-oss-120b/i.test(id)) return 7;
                                        if (/gpt-oss-20b/i.test(id)) return 8;
                                        return 10;
                                    };
                                    return rank(a) - rank(b);
                                });
                                this.models.groq = [...new Set([...textChat.slice(0, 5), ...FALLBACK_MODELS.groq])];
                                console.log(chalk.cyan(`🔍 [AI] Discovered Groq Live: ${this.models.groq.slice(0, 4).join(', ')}`));
                            }
                            break;
                        } catch {} finally { clear(); }
                    }
                })());
            }

            // ৩. OpenRouter ফ্রি মডেল ডিসকভারি (ডায়নামিক RAM গার্ডসহ)
            if (this.keys.openrouter.length > 0 && getRssMb() < getDynamicDiscoveryGuardMb()) {
                tasks.push((async () => {
                    const { controller, clear } = createAbortWithTimeout(8500);
                    try {
                        const res = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
                        if (!res.ok) return;
                        let data = await res.json();
                        const freeIds = (Array.isArray(data?.data) ? data.data : [])
                            .map((m) => String(m?.id || ''))
                            .filter((id) =>
                                id.endsWith(':free') &&
                                /(?:gemma|llama-3\.3|llama-4|mistral|qwen|gemini)/i.test(id) &&
                                !/(?:embedding|guard|whisper)/i.test(id)
                            );
                        data = null;

                        if (freeIds.length > 0) {
                            this.models.openrouter = [...new Set(['openrouter/free', ...freeIds.slice(0, 4), ...FALLBACK_MODELS.openrouter])];
                        }
                    } catch {} finally { clear(); }
                })());
            }

            await Promise.allSettled(tasks);
            this.lastDiscoveryAt = Date.now();
            return this.models;
        } finally {
            this.discoveryInFlight = false;
        }
    }

    // --- স্ট্রিক্ট পে-লোড নরম্যালাইজার ---
    buildGeminiContents(history = [], userText = '', encodedMedia = []) {
        const normalized = [];
        for (const msg of Array.isArray(history) ? history : []) {
            const role = (msg?.role === 'assistant' || msg?.role === 'model') ? 'model' : 'user';
            const text = String(msg?.text ?? msg?.content ?? '').trim();
            if (!text) continue;
            const prev = normalized[normalized.length - 1];
            if (prev && prev.role === role) prev.parts[0].text += `\n${text}`;
            else normalized.push({ role, parts: [{ text }] });
        }
        while (normalized.length > 0 && normalized[0].role !== 'user') normalized.shift();

        const currentParts = [];
        for (const media of encodedMedia) {
            currentParts.push({ inlineData: { mimeType: media.mimeType, data: media.base64 } });
        }
        const finalText = String(userText || '').trim() || (currentParts.length ? 'এই ফাইল/ছবিটি দেখে উত্তর দাও।' : 'হ্যালো');
        currentParts.push({ text: finalText });

        const prev = normalized[normalized.length - 1];
        if (prev && prev.role === 'user') prev.parts.push(...currentParts);
        else normalized.push({ role: 'user', parts: currentParts });

        return normalized;
    }

    buildOpenAIMessages(systemPrompt = '', history = [], userText = '', encodedMedia = [], allowImageParts = false) {
        const messages = [];
        if (systemPrompt && systemPrompt.trim()) {
            messages.push({ role: 'system', content: systemPrompt.trim() });
        }

        const mergedHistory = [];
        for (const msg of Array.isArray(history) ? history : []) {
            const role = (msg?.role === 'assistant' || msg?.role === 'model') ? 'assistant' : 'user';
            const content = String(msg?.text ?? msg?.content ?? '').trim();
            if (!content) continue;
            if (!mergedHistory.length && role === 'assistant') continue;
            const prev = mergedHistory[mergedHistory.length - 1];
            if (prev && prev.role === role) prev.content += `\n${content}`;
            else mergedHistory.push({ role, content });
        }
        messages.push(...mergedHistory);

        const imageParts = allowImageParts
            ? encodedMedia.filter((m) => m.mimeType.startsWith('image/'))
            : [];
        const cleanUserText = String(userText || '').trim() || (imageParts.length ? 'এই ছবিটি দেখে উত্তর দাও।' : 'হ্যালো');

        if (imageParts.length > 0) {
            const contentBlocks = [{ type: 'text', text: cleanUserText }];
            for (const img of imageParts) {
                contentBlocks.push({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
                });
            }
            messages.push({ role: 'user', content: contentBlocks });
        } else {
            const prev = messages[messages.length - 1];
            if (prev && prev.role === 'user' && typeof prev.content === 'string') {
                prev.content += `\n${cleanUserText}`;
            } else {
                messages.push({ role: 'user', content: cleanUserText });
            }
        }

        return messages;
    }

    // --- ডুয়াল-এন্ডপয়েন্ট Gemini কল (AIza -> AI Studio | AQ. -> Vertex AI Express) ---
    async callGemini({ key, model, systemPrompt, history, userText, encodedMedia, temperature, maxTokens, jsonMode, timeoutMs }) {
        const { controller, clear } = createAbortWithTimeout(timeoutMs);
        try {
            const keyType = classifyGeminiKey(key);
            const isVertex = keyType === 'vertex_express';

            const url = isVertex
                ? `${this.config.vertexExpressBaseUrl}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
                : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

            const headers = { 'Content-Type': 'application/json' };
            if (!isVertex) headers['x-goog-api-key'] = key;

            const body = {
                contents: this.buildGeminiContents(history, userText, encodedMedia),
                generationConfig: { temperature, maxOutputTokens: maxTokens }
            };
            if (systemPrompt && systemPrompt.trim()) {
                body.systemInstruction = { parts: [{ text: systemPrompt.trim() }] };
            }
            if (jsonMode) body.generationConfig.responseMimeType = 'application/json';

            const res = await fetch(url, {
                method: 'POST',
                headers,
                signal: controller.signal,
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                const err = new Error(`${isVertex ? 'VertexGemini' : 'Gemini'} HTTP ${res.status}: ${errText.slice(0, 140)}`);
                err.status = res.status;
                err.retryAfterMs = parseRetryAfterMs(res);
                throw err;
            }

            const data = await res.json();
            const candidate = data?.candidates?.[0];
            const rawText = (candidate?.content?.parts || [])
                .map((p) => (typeof p?.text === 'string' ? p.text : ''))
                .join('')
                .trim();

            const cleaned = stripReasoningArtifacts(rawText, userText);
            if (!cleaned) {
                const err = new Error(`Gemini empty response (${candidate?.finishReason || 'unknown'})`);
                err.status = 502;
                throw err;
            }
            return { text: cleaned, usage: data?.usageMetadata || null, keyType };
        } finally {
            clear();
        }
    }

    async callOpenAICompat({ provider, key, model, systemPrompt, history, userText, encodedMedia, temperature, maxTokens, jsonMode, timeoutMs }) {
        const endpoint = provider === 'groq'
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions';

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
        };
        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = this.config.appReferer;
            headers['X-Title'] = this.config.appTitle;
        }

        const allowImageParts = VISION_MODEL_RE.test(model);
        const messages = this.buildOpenAIMessages(systemPrompt, history, userText, encodedMedia, allowImageParts);
        const useStrictJson = Boolean(jsonMode && provider === 'groq' && GROQ_JSON_SAFE_RE.test(model));

        const doFetch = async (withJsonFormat, budgetMs) => {
            const { controller, clear } = createAbortWithTimeout(budgetMs);
            try {
                const payload = { model, messages, temperature, max_tokens: maxTokens };
                if (withJsonFormat) payload.response_format = { type: 'json_object' };

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    signal: controller.signal,
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    const err = new Error(`${provider} HTTP ${res.status}: ${errText.slice(0, 140)}`);
                    err.status = res.status;
                    err.retryAfterMs = parseRetryAfterMs(res);
                    throw err;
                }
                const data = await res.json();
                const msgObj = data?.choices?.[0]?.message || {};
                const rawText = typeof msgObj.content === 'string' ? msgObj.content : '';
                const cleaned = stripReasoningArtifacts(rawText, userText);
                if (!cleaned) {
                    const err = new Error(`${provider} returned empty content`);
                    err.status = 502;
                    throw err;
                }
                return { text: cleaned, usage: data?.usage || null };
            } finally {
                clear();
            }
        };

        try {
            return await doFetch(useStrictJson, timeoutMs);
        } catch (err) {
            if (useStrictJson && err?.status === 400 && timeoutMs >= 6000) {
                return await doFetch(false, Math.max(4000, Math.floor(timeoutMs * 0.6)));
            }
            throw err;
        }
    }

    // --- ইমার্জেন্সি ব্যাকআপ AI কল (সব প্রাইমারি এপিআই ফেল করলে ০ ডাউনটাইম) ---
    async callEmergencyBackup({ systemPrompt, history, userText, encodedMedia, timeoutMs, uid = 'maya' }) {
        const fn = backupAI?.chatWithBackupAI || backupAI?.chatWithMahiruAI;
        if (typeof fn !== 'function') return null;
        if (typeof backupAI?.isBackupReady === 'function' && !backupAI.isBackupReady()) return null;

        const imgPart = Array.isArray(encodedMedia)
            ? encodedMedia.find((m) => m.mimeType.startsWith('image/'))
            : null;
        const hasNonImageBinary = Array.isArray(encodedMedia)
            && encodedMedia.some((m) => !m.mimeType.startsWith('image/'));
        if (hasNonImageBinary) return null;

        const reply = await fn({
            uid,
            text: userText,
            system: systemPrompt,
            history,
            image: imgPart ? { data: imgPart.base64, mimeType: imgPart.mimeType } : null,
            timeoutMs: Math.min(timeoutMs || 18000, 20000)
        });

        const cleaned = stripReasoningArtifacts(reply, userText);
        return cleaned ? { text: cleaned } : null;
    }

    // --- স্মার্ট ক্যান্ডিডেট ও রেসকিউ তালিকা নির্মাণ ---
    buildCandidates({ encodedMedia = [], preferSpeed = false, providerOverride = null, includeCoolingRescue = false } = {}) {
        this.ensureKeysLoadedFromSettings();

        const hasImages = encodedMedia.some((p) => p.mimeType.startsWith('image/'));
        const requiresGeminiOnly = encodedMedia.some((p) =>
            p.mimeType === 'application/pdf' || p.mimeType.startsWith('video/') || p.mimeType.startsWith('audio/')
        );

        const allowedProviders = requiresGeminiOnly
            ? ['gemini']
            : providerOverride && ['gemini', 'groq', 'openrouter'].includes(providerOverride)
                ? [providerOverride, ...['gemini', 'groq', 'openrouter'].filter((p) => p !== providerOverride)]
                : ['gemini', 'groq', 'openrouter'];

        const healthy = [];
        const cooling = [];

        for (const provider of allowedProviders) {
            const keyList = this.keys[provider] || [];
            if (!keyList.length) continue;

            const startCursor = this.rrCursor[provider] % keyList.length;
            this.rrCursor[provider] = (this.rrCursor[provider] + 1) % keyList.length;

            let modelList = [];
            if (provider === 'gemini') modelList = [...this.models.gemini];
            else if (provider === 'groq') modelList = hasImages ? [...this.models.groqVision] : [...this.models.groq];
            else if (provider === 'openrouter') {
                modelList = hasImages
                    ? this.models.openrouter.filter((m) => VISION_MODEL_RE.test(m) || m === 'openrouter/free')
                    : [...this.models.openrouter];
            }

            const prefModel = this.prefs.preferredModels[provider];
            if (prefModel && (!hasImages || VISION_MODEL_RE.test(prefModel))) {
                modelList = [prefModel, ...modelList.filter((m) => m !== prefModel)];
            }

            const selectedModels = modelList.slice(0, preferSpeed ? 2 : 3);

            for (let mIdx = 0; mIdx < selectedModels.length; mIdx++) {
                const model = selectedModels[mIdx];
                for (let kOffset = 0; kOffset < keyList.length; kOffset++) {
                    const realIdx = (startCursor + kOffset) % keyList.length;
                    const keyIndex = realIdx + 1;
                    if (this.isKeyQuarantined(provider, keyIndex)) continue;

                    const slotId = `${provider}#${keyIndex}:${model}`;
                    const score = this.scoreCandidate(provider, slotId, mIdx, preferSpeed) - (kOffset * 0.5);
                    const cand = { provider, key: keyList[realIdx], keyIndex, model, slotId, score };

                    if (this.isSlotCoolingDown(slotId)) {
                        if (includeCoolingRescue) {
                            cand.cooldownUntil = this.slotHealth.get(slotId)?.cooldownUntil || Infinity;
                            cooling.push(cand);
                        }
                    } else {
                        healthy.push(cand);
                    }
                }
            }
        }

        healthy.sort((a, b) => b.score - a.score);
        if (healthy.length > 0 || !includeCoolingRescue) return healthy;

        cooling.sort((a, b) => a.cooldownUntil - b.cooldownUntil);
        return cooling.slice(0, 1);
    }

    async generateReply({
        systemPrompt = '',
        history = [],
        userText = '',
        mediaParts = [],
        temperature = 0.65,
        maxTokens = 768,
        jsonMode = false,
        skipPersonaShield = false,
        preferSpeed = false,
        providerOverride = null,
        timeoutMs = null,
        uid = 'maya'
    } = {}) {
        this.metrics.totalRequests++;
        const reqStartedAt = Date.now();

        if (this.lastDiscoveryAt && (reqStartedAt - this.lastDiscoveryAt) > this.config.discoveryIntervalMs) {
            this.discoverModels().catch(() => {});
        }

        let encodedMedia = normalizeMediaPartsOnce(mediaParts);
        const guardedSystem = buildGuardedSystemPrompt(systemPrompt, { jsonMode, skipPersonaShield });

        // সরাসরি backup মোড সিলেক্ট করা থাকলে আগে ব্যাকআপ এআই চালাবে
        const effectiveOverride = providerOverride || (this.prefs.primaryProvider === 'backup' ? 'backup' : null);

        try {
            if (effectiveOverride === 'backup') {
                try {
                    const bkRes = await this.callEmergencyBackup({
                        systemPrompt: guardedSystem, history, userText, encodedMedia,
                        timeoutMs: timeoutMs || 18000, uid
                    });
                    if (bkRes?.text) {
                        this.metrics.totalSuccess++;
                        this.metrics.byProvider.backup++;
                        return {
                            ok: true, text: bkRes.text, provider: 'backup', keyIndex: 1,
                            providerTag: 'Backup AI', model: 'maya-backup', attempts: 1,
                            ms: Date.now() - reqStartedAt, usage: null
                        };
                    }
                } catch {}
            }

            const candidates = this.buildCandidates({
                encodedMedia,
                preferSpeed,
                providerOverride: effectiveOverride === 'backup' ? null : effectiveOverride,
                includeCoolingRescue: true
            });

            const limit = Math.min(candidates.length, this.config.maxAttemptsPerCall);
            let lastError = candidates.length ? 'unknown' : 'no_healthy_ai_slots';

            for (let i = 0; i < limit; i++) {
                const elapsedTotal = Date.now() - reqStartedAt;
                if (elapsedTotal >= this.config.totalBudgetMs) {
                    lastError = 'total_budget_exceeded';
                    break;
                }

                const c = candidates[i];
                if (i > 0) this.metrics.totalFailovers++;

                const remainingBudget = this.config.totalBudgetMs - elapsedTotal;
                const defaultPerCall = c.provider === 'openrouter'
                    ? this.config.openRouterTimeoutMs
                    : this.config.attemptTimeoutMs;
                const perAttemptTimeout = Math.max(3500, Math.min(timeoutMs || defaultPerCall, remainingBudget));

                const attemptStart = Date.now();
                try {
                    const res = c.provider === 'gemini'
                        ? await this.callGemini({
                            key: c.key, model: c.model, systemPrompt: guardedSystem, history, userText,
                            encodedMedia, temperature, maxTokens, jsonMode, timeoutMs: perAttemptTimeout
                        })
                        : await this.callOpenAICompat({
                            provider: c.provider, key: c.key, model: c.model, systemPrompt: guardedSystem, history, userText,
                            encodedMedia, temperature, maxTokens, jsonMode, timeoutMs: perAttemptTimeout
                        });

                    const attemptMs = Date.now() - attemptStart;
                    this.recordSlotSuccess(c.slotId, attemptMs);
                    this.metrics.totalSuccess++;
                    this.metrics.byProvider[c.provider] = (this.metrics.byProvider[c.provider] || 0) + 1;

                    const labelPrefix = c.provider === 'gemini'
                        ? (res.keyType === 'vertex_express' ? 'Gemini-AQ' : 'Gemini')
                        : c.provider === 'groq' ? 'Groq' : 'OpenRouter';

                    return {
                        ok: true,
                        text: res.text,
                        provider: c.provider,
                        keyIndex: c.keyIndex,
                        providerTag: `${labelPrefix} #${c.keyIndex}`,
                        model: c.model,
                        attempts: i + 1,
                        ms: Date.now() - reqStartedAt,
                        usage: res.usage
                    };
                } catch (err) {
                    const isTimeout = err?.name === 'AbortError';
                    const status = Number(err?.status || 0);
                    lastError = isTimeout ? 'timeout' : (err?.message || 'request_failed');

                    if (status === 401 || status === 403) {
                        this.quarantineKey(c.provider, c.keyIndex, `HTTP ${status}`);
                    } else if (status === 402) {
                        this.quarantineKey(c.provider, c.keyIndex, 'No Balance 402', this.config.noBalanceQuarantineMs);
                    } else {
                        this.recordSlotFailure(c.slotId, {
                            status,
                            isTimeout,
                            reason: lastError,
                            retryAfterMs: err?.retryAfterMs || 0
                        });
                    }
                }
            }

            // ফাইনাল ইমার্জেন্সি সেফটি নেট: সব প্রাইমারি এপিআই ফেল করলে ফাস্ট Backup AI ব্যবহার
            if (effectiveOverride !== 'backup') {
                try {
                    const bkRes = await this.callEmergencyBackup({
                        systemPrompt: guardedSystem, history, userText, encodedMedia,
                        timeoutMs: 18000, uid
                    });
                    if (bkRes?.text) {
                        this.metrics.totalFailovers++;
                        this.metrics.totalSuccess++;
                        this.metrics.byProvider.backup++;
                        return {
                            ok: true,
                            text: bkRes.text,
                            provider: 'backup',
                            keyIndex: 1,
                            providerTag: 'Backup AI',
                            model: 'maya-backup',
                            attempts: limit + 1,
                            ms: Date.now() - reqStartedAt,
                            usage: null
                        };
                    }
                } catch (bkErr) {
                    lastError = `${lastError} | backup:${bkErr?.message || 'err'}`;
                }
            }

            this.metrics.totalFailed++;
            return {
                ok: false,
                text: '',
                provider: 'none',
                model: 'none',
                attempts: limit,
                ms: Date.now() - reqStartedAt,
                error: lastError
            };
        } finally {
            encodedMedia = [];
        }
    }

    async generateJSON({
        systemPrompt = '',
        userText = '',
        temperature = 0.1,
        maxTokens = 550,
        timeoutMs = 11000
    } = {}) {
        const strictSystem = `${systemPrompt}\n\n[OUTPUT FORMAT: Return ONLY a valid JSON object. No markdown, no explanations, no extra text.]`.trim();

        const res = await this.generateReply({
            systemPrompt: strictSystem,
            userText,
            temperature,
            maxTokens,
            jsonMode: true,
            skipPersonaShield: true,
            preferSpeed: true,
            timeoutMs
        });

        if (!res.ok || !res.text) {
            return { ok: false, data: null, raw: res.text || '', error: res.error || 'ai_failed' };
        }

        const parsed = extractBalancedJson(res.text);
        if (parsed && typeof parsed === 'object') {
            this.metrics.jsonSuccess++;
            return {
                ok: true,
                data: parsed,
                providerTag: res.providerTag,
                model: res.model,
                ms: res.ms
            };
        }

        return { ok: false, data: null, raw: res.text, error: 'json_parse_failed' };
    }

    async fastRewrite(promptText = '') {
        this.metrics.fastRewrites++;
        const res = await this.generateReply({
            systemPrompt: 'You are a fast, exact text converter. Return ONLY the converted text with zero extra commentary.',
            userText: promptText,
            temperature: 0.2,
            maxTokens: 480,
            skipPersonaShield: true,
            preferSpeed: true,
            timeoutMs: this.config.fastRewriteTimeoutMs
        });
        return res.ok ? res.text : '';
    }

    sweepExpiredCooldowns() {
        const now = Date.now();
        for (const [id, exp] of this.keyQuarantine.entries()) {
            if (exp <= now) this.keyQuarantine.delete(id);
        }
        const staleCutoff = now - 6 * 60 * 60 * 1000;
        for (const [slotId, st] of this.slotHealth.entries()) {
            if (st.cooldownUntil && st.cooldownUntil <= now) st.cooldownUntil = 0;
            if (!st.cooldownUntil && (st.lastUsedAt || 0) < staleCutoff) {
                this.slotHealth.delete(slotId);
            }
        }
        while (this.slotHealth.size > this.config.maxSlotHealthEntries) {
            this.evictOldestSlotState();
        }
    }

    getHealthStats() {
        const now = Date.now();
        const coolingSlots = [];
        let totalLatency = 0;
        let measuredSlots = 0;

        for (const [slotId, st] of this.slotHealth.entries()) {
            if (st.cooldownUntil > now) {
                coolingSlots.push(`${slotId} (${Math.ceil((st.cooldownUntil - now) / 1000)}s)`);
            }
            if (st.successCount > 0) {
                totalLatency += st.ewmaMs;
                measuredSlots++;
            }
        }

        const quarantinedKeys = [];
        for (const [kId, exp] of this.keyQuarantine.entries()) {
            if (exp > now) quarantinedKeys.push(`${kId} (${Math.ceil((exp - now) / 60000)}m)`);
        }

        const aizaCount = this.keys.gemini.filter((k) => classifyGeminiKey(k) === 'ai_studio').length;
        const aqCount = this.keys.gemini.filter((k) => classifyGeminiKey(k) === 'vertex_express').length;
        const bkStat = backupAI?.getBackupAIStatus ? backupAI.getBackupAIStatus() : { enabled: false, ready: false };

        return {
            primaryProvider: this.prefs.primaryProvider,
            preferredModels: this.prefs.preferredModels,
            keysLoaded: {
                gemini: this.keys.gemini.length,
                geminiAiza: aizaCount,
                geminiAq: aqCount,
                groq: this.keys.groq.length,
                openrouter: this.keys.openrouter.length
            },
            backupAI: bkStat,
            discoveredCounts: {
                gemini: this.models.gemini.length,
                groq: this.models.groq.length,
                openrouter: this.models.openrouter.length
            },
            avgLatencyMs: measuredSlots ? Math.round(totalLatency / measuredSlots) : 0,
            coolingSlots,
            quarantinedKeys,
            ...this.metrics
        };
    }

    formatAIHealthLines() {
        const h = this.getHealthStats();
        const gemDetail = h.keysLoaded.geminiAq > 0
            ? `${h.keysLoaded.gemini} (AIza:${h.keysLoaded.geminiAiza}/AQ:${h.keysLoaded.geminiAq})`
            : `${h.keysLoaded.gemini}`;
        const bkBadge = h.backupAI?.ready ? '🟢 ON' : (h.backupAI?.enabled ? '🟡 CD' : '⚪ OFF');

        const lines = [
            `🧠 *AI পুল:* \`${h.primaryProvider}\` (Avg: *${h.avgLatencyMs}ms*) | Backup: ${bkBadge}`,
            `• Keys: Gemini(${gemDetail}) | Groq(${h.keysLoaded.groq}) | OR(${h.keysLoaded.openrouter})`,
            `• Calls: ✅ ${h.totalSuccess} | 🔄 Failover: ${h.totalFailovers} | ❌ ${h.totalFailed}`,
            `• Hits: G(${h.byProvider.gemini}) • Q(${h.byProvider.groq}) • OR(${h.byProvider.openrouter}) • BK(${h.byProvider.backup || 0})`
        ];
        if (h.coolingSlots.length > 0) lines.push(`• Cooldown: ${h.coolingSlots.slice(0, 3).join(', ')}`);
        if (h.quarantinedKeys.length > 0) lines.push(`• Quarantined: ${h.quarantinedKeys.join(', ')}`);
        return lines;
    }
}

const aiOrchestrator = new AIOrchestrator();

module.exports = {
    AIOrchestrator,
    aiOrchestrator,
    classifyGeminiKey,
    configureAIKeys: (keys) => aiOrchestrator.setApiKeys(keys),
    generateReply: (opts) => aiOrchestrator.generateReply(opts),
    generateJSON: (opts) => aiOrchestrator.generateJSON(opts),
    fastRewrite: (prompt) => aiOrchestrator.fastRewrite(prompt),
    discoverModels: (force) => aiOrchestrator.discoverModels(force),
    setPrimaryProvider: (p) => aiOrchestrator.setPrimaryProvider(p),
    setPreferredModel: (p, m) => aiOrchestrator.setPreferredModel(p, m),
    resetAIHealth: () => aiOrchestrator.resetHealth(),
    sweepExpiredCooldowns: () => aiOrchestrator.sweepExpiredCooldowns(),
    getAIHealthStats: () => aiOrchestrator.getHealthStats(),
    formatAIHealthLines: () => aiOrchestrator.formatAIHealthLines()
};
