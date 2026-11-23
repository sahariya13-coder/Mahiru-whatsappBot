/**
 * Mahiru Shiina • Mahiru v1.0 ULTIMATE — Unified Crystal Female Voice Engine (256MB RAM Tuned)
 * Pipeline:
 *  - Crystal Transparent Mastering (11.8kHz Air, 64k Audio Opus, Zero Mud/Robotic Distortion)
 *  - Zero-FFmpeg Direct OGG STT to Groq Whisper -> Dual-Gemini (AIza + AQ. Vertex Express) -> Backup AI STT
 *  - Full Mood-Synced Delegation to Crystal NeuralVoice (Cloned / Gemini / Edge Crystal / Backup AI / Offline Bank)
 *  - Global Serialized -threads 1 FFmpeg Mutex + Tight 450KB RAM Micro-Cache + Privacy DLP Shield
 * 100% Backward-Compatible Exports
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

let settings = null;
try { settings = require('../settings'); } catch {}

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

function getNeuralVoiceLazy() {
    try {
        const nvPath = require.resolve('./neuralVoice');
        return require.cache[nvPath]?.exports || require('./neuralVoice');
    } catch {
        return null;
    }
}

const VALID_VOICE_MODES = new Set(['auto', 'on', 'off']);
const VALID_FEMALE_VOICES = new Set(['Aoede', 'Kore', 'Leda', 'Zephyr', 'Autonoe', 'Callirrhoe', 'Despina']);

const voiceCfg = settings?.maya?.voice || {};
const VERTEX_EXPRESS_BASE = String(
    settings?.maya?.ai?.vertexExpressBaseUrl || 'https://aiplatform.googleapis.com/v1/publishers/google/models'
).replace(/\/+$/, '');

const DEFAULT_CONFIG = {
    prefsFile: './data/voice_prefs.json',
    defaultGlobalMode: voiceCfg.defaultGlobalMode || 'auto',
    defaultVoiceName: voiceCfg.defaultVoiceName || 'Aoede',
    ttsModel: voiceCfg.ttsModel || 'gemini-2.5-flash-preview-tts',
    ttsFallbackModels: ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'],
    sttGeminiModels: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    sttGroqModels: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    ttsTimeoutMs: Number(voiceCfg.ttsTimeoutMs || 14000),
    sttTimeoutMs: Number(voiceCfg.sttTimeoutMs || 14000),
    ttsCooldownMs: 65 * 1000,
    sttCooldownMs: 60 * 1000,
    authQuarantineMs: 30 * 60 * 1000,
    minVoiceDurationSec: Number(voiceCfg.minVoiceDurationSec || 0.75),
    maxVoiceDurationSec: 120,
    maxInputBytes: 2.5 * 1024 * 1024,
    maxWavForGroqBytes: 1.8 * 1024 * 1024,
    silencePeakDbThreshold: Number(voiceCfg.silencePeakDbThreshold || -48),
    maxTtsChars: Number(voiceCfg.maxTtsChars || 280),
    ffmpegTimeoutMs: 12000,
    maxFfmpegQueue: 3,
    maxCustomChats: 150,
    maxMicroCacheItems: 6,
    maxMicroCacheBytes: 450 * 1024
};

const WHISPER_HALLUCINATIONS = Object.freeze([
    /^thank you(?: for watching| so much)?[.!]*$/i,
    /^thanks for watching[.!]*$/i,
    /^subtitles by.+$/i,
    /^please subscribe.+$/i,
    /^like and subscribe.+$/i,
    /^you$/i,
    /^\.+$/,
    /^[\s,.\-!?।]+$/,
    /সাবস্ক্রাইব করুন/,
    /ভিডিওটি দেখার জন্য ধন্যবাদ/,
    /দেখার জন্য ধন্যবাদ/,
    /আল্লাহ হাফেজ[.!\s]*আল্লাহ হাফেজ/i
]);

const BAD_VOICE_REJECTION_RE = /(?:আপনার\s*(?:ভাষা|ভয়েস|ভয়েস|কথা)\s*বুঝতে\s*পার(?:ছি|তেছি)\s*না|দয়া\s*করে\s*বাংলা(?:য়|য়)?\s*(?:ভাষায়|ভাষায়)?\s*বলুন|আমি\s*শুধু\s*বাংলা\s*বুঝি|cannot understand your (?:language|voice)|please speak in (?:bengali|bangla))/i;

const MOOD_PRESETS = Object.freeze({
    affectionate_sweet: {
        label: 'আন্তরিক/স্নেহময়',
        studioMood: 'affectionate',
        direction: 'Speak like a real, warm, mature Bangladeshi young woman with genuine affection and soft emotional feelings—natural breathing, crisp clear voice, never robotic or muffled.'
    },
    empathetic_sad: {
        label: 'দুঃখ/সহানুভূতি',
        studioMood: 'empathetic_sad',
        direction: 'Speak like a deeply caring Bangladeshi woman with genuine empathy and softness—unhurried, comforting human pauses, gentle tone, and authentic emotional warmth.'
    },
    happy_warm: {
        label: 'খুশি/উৎফুল্ল',
        studioMood: 'happy',
        direction: 'Speak like a genuinely happy, cheerful Bangladeshi young woman—natural smile in the voice, lively human cadence, crisp, smooth, and realistic.'
    },
    excited_curious: {
        label: 'আগ্রহী/প্রাণবন্ত',
        studioMood: 'happy',
        direction: 'Speak like an engaged, curious, expressive Bangladeshi young woman—bright natural interest, smooth everyday Dhaka Bengali flow, authentic human feelings.'
    },
    playful_casual: {
        label: 'আড্ডা/বন্ধুত্বপূর্ণ',
        studioMood: 'playful_casual',
        direction: 'Speak in an effortless, relaxed, friendly Dhaka Bangladeshi woman voice—natural conversational rhythm with subtle warmth and real human expression.'
    },
    serious_firm: {
        label: 'সিরিয়াস/সতর্ক',
        studioMood: 'stern',
        direction: 'Speak in a calm, composed, confident Bangladeshi woman voice—clear, steady, polite yet firm with realistic human intonation.'
    },
    helpful_clear: {
        label: 'সহায়ক/স্পষ্ট',
        studioMood: 'professional',
        direction: 'Speak in a clear, patient, naturally warm Bangladeshi female assistant voice—crisp Bengali pronunciation, comfortable pace, brief natural pauses at punctuation.'
    },
    natural_friendly: {
        label: 'স্বাভাবিক/আন্তরিক',
        studioMood: 'calm',
        direction: 'Speak in an authentic, grounded, everyday conversational Dhaka Bangladeshi woman voice—rich human feeling, smooth crisp tone, clear Bengali articulation, completely realistic and pleasant.'
    }
});

function normalizeBn(str = '') {
    return String(str || '')
        .normalize('NFC')
        .replace(/\u09AF\u09BC/g, 'য়')
        .replace(/\u09A1\u09BC/g, 'ড়')
        .replace(/\u09A2\u09BC/g, 'ঢ়');
}

function getRssMb() {
    return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

function getDynamicRamGuards() {
    const opt = settings?.maya?.optimizer || {};
    const soft = Number(opt.ramSoftLimitMb) || 235;
    const critical = Number(opt.ramCriticalLimitMb) || 295;
    return {
        heavyFilterGuardMb: Math.max(200, soft - 10),
        ttsSkipGuardMb: Math.max(245, critical - 12)
    };
}

function classifyGeminiKey(key = '') {
    const k = String(key || '').trim();
    if (k.length < 16 || !/^[\x21-\x7E]+$/.test(k)) return 'invalid';
    if (k.startsWith('AQ.')) return 'vertex_express';
    if (k.startsWith('AIza')) return 'ai_studio';
    return 'invalid';
}

// ডুয়াল-জেমিনি (AIza + AQ.) কী নরম্যালাইজার
function normalizeKeyList(input, provider = '') {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : String(input).split(/[\s,;]+/);
    const out = [];
    for (const raw of arr) {
        const k = String(raw || '').trim().replace(/^["']+|["']+$/g, '');
        if (k.length < 16 || !/^[\x21-\x7E]+$/.test(k)) continue;
        if (provider === 'gemini' && classifyGeminiKey(k) === 'invalid') continue;
        out.push(k);
    }
    return [...new Set(out)];
}

function parseRetryAfterMs(res, fallbackMs) {
    try {
        const hdr = res?.headers?.get?.('retry-after');
        if (!hdr) return fallbackMs;
        const sec = Number(hdr);
        if (Number.isFinite(sec) && sec > 0) {
            return Math.min(Math.max(sec * 1000, 15000), 10 * 60 * 1000);
        }
    } catch {}
    return fallbackMs;
}

function createAbortTimer(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    if (timer.unref) timer.unref();
    return { controller, clear: () => clearTimeout(timer) };
}

function runProcess(cmd, args, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                err.stdout = stdout;
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

function makeTempPath(prefix, ext) {
    const dir = process.env.TMPDIR && fs.existsSync(process.env.TMPDIR) ? process.env.TMPDIR : os.tmpdir();
    const uid = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return path.join(dir, `maya_${prefix}_${uid}.${ext}`);
}

function safeUnlink(filePath) {
    if (!filePath) return;
    try { fs.rmSync(filePath, { force: true }); } catch {}
}

function isRepetitiveLoop(text = '') {
    const words = normalizeBn(text).trim().split(/\s+/).filter(Boolean);
    if (words.length < 6) return false;
    const freq = new Map();
    for (const w of words) {
        const k = w.toLowerCase().replace(/[.,!?।]/g, '');
        if (!k) continue;
        freq.set(k, (freq.get(k) || 0) + 1);
    }
    const maxCount = Math.max(0, ...freq.values());
    return maxCount >= 5 && (maxCount / words.length) >= 0.65;
}

class VoiceEngine {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        this.prefs = {
            globalMode: this.config.defaultGlobalMode,
            voiceName: this.config.defaultVoiceName,
            chats: Object.create(null)
        };

        this.geminiKeys = [];
        this.groqKeys = [];
        this.manualKeysOverride = false;
        this.lastKeySyncAt = 0;

        this.cooldowns = new Map();
        this.rrTtsIndex = 0;
        this.rrSttIndex = 0;

        this.ffmpegQueueDepth = 0;

        this.inFlightTts = new Map();
        this.microCache = new Map();
        this.microCacheBytes = 0;

        this.metrics = {
            sttTotal: 0,
            sttSuccess: 0,
            sttSilentBlocked: 0,
            sttTooShortBlocked: 0,
            sttGroqHits: 0,
            sttGeminiHits: 0,
            sttBackupHits: 0,
            sttFailed: 0,
            ttsTotal: 0,
            ttsSuccess: 0,
            ttsCacheHits: 0,
            ttsStudioDelegatedHits: 0,
            ttsQueueSkipped: 0,
            ttsTimeouts: 0,
            ttsFailed: 0,
            avgTtsMs: 0
        };

        this.loadPrefs();
        this.syncKeysFromSettings(true);

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('voiceEngine', () => {
                this.sweepCooldowns();
                this.clearMicroCache();
            });
        }

        global.voiceEngine = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    // গ্লোবাল সিঙ্গেল-থ্রেড FFmpeg মিউটেক্স (ওভারফ্লো-ক্যাপসহ, ২৫৬MB OOM প্রতিরোধী)
    runWithFfmpegLock(fn, { allowOverflow = false } = {}) {
        const limit = allowOverflow ? this.config.maxFfmpegQueue + 2 : this.config.maxFfmpegQueue;
        if (this.ffmpegQueueDepth >= limit) {
            const err = new Error('ffmpeg_queue_busy');
            err.code = 'FFMPEG_BUSY';
            return Promise.reject(err);
        }
        this.ffmpegQueueDepth++;
        const prevChain = global.__MAYA_FFMPEG_CHAIN__ || Promise.resolve();
        const next = prevChain
            .catch(() => {})
            .then(() => fn())
            .finally(() => {
                this.ffmpegQueueDepth = Math.max(0, this.ffmpegQueueDepth - 1);
            });
        global.__MAYA_FFMPEG_CHAIN__ = next.catch(() => {});
        return next;
    }

    syncKeysFromSettings(force = false) {
        if (this.manualKeysOverride && !force) return;
        const now = Date.now();
        if (!force && (now - this.lastKeySyncAt) < 30 * 1000) return;
        this.lastKeySyncAt = now;

        try {
            if (typeof settings?.getAIKeys === 'function') {
                const k = settings.getAIKeys(force);
                this.geminiKeys = normalizeKeyList(k?.geminiKeys, 'gemini');
                this.groqKeys = normalizeKeyList(k?.groqKeys, 'groq');
            }
        } catch {}
    }

    setApiKeys({ geminiKeys, groqKeys } = {}) {
        this.manualKeysOverride = true;
        if (geminiKeys !== undefined) this.geminiKeys = normalizeKeyList(geminiKeys, 'gemini');
        if (groqKeys !== undefined) this.groqKeys = normalizeKeyList(groqKeys, 'groq');
        return this;
    }

    refreshKeys() {
        this.manualKeysOverride = false;
        this.syncKeysFromSettings(true);
        return this;
    }

    resetCooldowns() {
        this.cooldowns.clear();
        try { getNeuralVoiceLazy()?.resetVoiceApiHealth?.(); } catch {}
        try { backupAI?.resetBackupCooldown?.(); } catch {}
        return this;
    }

    // --- অরফান-সেফ অ্যাটমিক প্রিফারেন্স স্টোরেজ ---
    loadPrefs() {
        try {
            if (!fs.existsSync(this.config.prefsFile)) return;
            const parsed = JSON.parse(fs.readFileSync(this.config.prefsFile, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                this.prefs = {
                    globalMode: VALID_VOICE_MODES.has(parsed.globalMode) ? parsed.globalMode : this.config.defaultGlobalMode,
                    voiceName: typeof parsed.voiceName === 'string' && parsed.voiceName.trim()
                        ? parsed.voiceName.trim()
                        : this.config.defaultVoiceName,
                    chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : Object.create(null)
                };
            }
        } catch {
            this.prefs = {
                globalMode: this.config.defaultGlobalMode,
                voiceName: this.config.defaultVoiceName,
                chats: Object.create(null)
            };
        }
    }

    savePrefs() {
        const keys = Object.keys(this.prefs.chats || {});
        if (keys.length > this.config.maxCustomChats) {
            keys.sort((a, b) => (this.prefs.chats[a]?.updatedAt || 0) - (this.prefs.chats[b]?.updatedAt || 0));
            for (let i = 0; i < keys.length - this.config.maxCustomChats; i++) {
                delete this.prefs.chats[keys[i]];
            }
        }

        let tmp = '';
        try {
            const dir = path.dirname(this.config.prefsFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            tmp = `${this.config.prefsFile}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(tmp, JSON.stringify(this.prefs, null, 2), 'utf8');
            fs.renameSync(tmp, this.config.prefsFile);
        } catch {
            if (tmp) safeUnlink(tmp);
        }
    }

    // --- ভয়েস কন্ট্রোল API ---
    normalizeVoiceMode(input = '') {
        const s = normalizeBn(input).trim().toLowerCase();
        if (['auto', 'অটো', 'smart', 'default'].includes(s)) return 'auto';
        if (['on', 'enable', 'enabled', 'চালু', 'অন'].includes(s)) return 'on';
        if (['off', 'disable', 'disabled', 'বন্ধ', 'অফ'].includes(s)) return 'off';
        return null;
    }

    normalizeVoiceName(input = '') {
        const raw = String(input || '').trim();
        if (!raw) return '';
        const lower = raw.toLowerCase();
        for (const v of VALID_FEMALE_VOICES) {
            if (v.toLowerCase() === lower) return v;
        }
        return raw;
    }

    getAvailableVoices() {
        return Array.from(VALID_FEMALE_VOICES);
    }

    setGlobalVoiceMode(modeInput) {
        const mode = this.normalizeVoiceMode(modeInput);
        if (!mode) return false;
        this.prefs.globalMode = mode;
        this.savePrefs();
        return true;
    }

    setGlobalVoiceName(voiceName) {
        const name = this.normalizeVoiceName(voiceName);
        if (!name) return false;
        this.prefs.voiceName = name;
        this.clearMicroCache();
        this.savePrefs();
        try { getNeuralVoiceLazy()?.updateVoiceStudioConfig?.({ geminiVoiceName: name }); } catch {}
        return true;
    }

    setChatVoiceName(chatId, voiceName) {
        if (!chatId) return false;
        const name = this.normalizeVoiceName(voiceName);
        if (!name) return false;
        if (!this.prefs.chats[chatId]) this.prefs.chats[chatId] = {};
        if (name.toLowerCase() === 'auto' || name.toLowerCase() === 'default') {
            delete this.prefs.chats[chatId].voiceName;
        } else {
            this.prefs.chats[chatId].voiceName = name;
        }
        this.prefs.chats[chatId].updatedAt = Date.now();
        if (!this.prefs.chats[chatId].mode && !this.prefs.chats[chatId].voiceName) {
            delete this.prefs.chats[chatId];
        }
        this.savePrefs();
        return true;
    }

    setChatVoiceMode(chatId, modeInput) {
        if (!chatId) return false;
        const mode = this.normalizeVoiceMode(modeInput);
        if (!mode) return false;

        if (!this.prefs.chats[chatId]) this.prefs.chats[chatId] = {};
        if (mode === 'auto' && this.prefs.globalMode === 'auto') {
            delete this.prefs.chats[chatId].mode;
        } else {
            this.prefs.chats[chatId].mode = mode;
        }
        this.prefs.chats[chatId].updatedAt = Date.now();
        if (!this.prefs.chats[chatId].mode && !this.prefs.chats[chatId].voiceName) {
            delete this.prefs.chats[chatId];
        }
        this.savePrefs();
        return true;
    }

    getEffectiveVoiceMode(chatId = '') {
        const chatPref = chatId ? this.prefs.chats[chatId] : null;
        if (chatPref?.mode && VALID_VOICE_MODES.has(chatPref.mode)) return chatPref.mode;
        return this.prefs.globalMode;
    }

    getEffectiveVoiceName(chatId = '') {
        const chatPref = chatId ? this.prefs.chats[chatId] : null;
        return chatPref?.voiceName || this.prefs.voiceName || this.config.defaultVoiceName;
    }

    listChatVoiceSettings(filterMode = null) {
        const list = Object.entries(this.prefs.chats || {}).map(([chatId, cfg]) => ({
            chatId,
            mode: cfg.mode || this.prefs.globalMode,
            voiceName: cfg.voiceName || this.prefs.voiceName,
            updatedAt: cfg.updatedAt || 0
        }));
        return filterMode ? list.filter((item) => item.mode === filterMode) : list;
    }

    shouldSendVoiceReply({
        chatId = '',
        userSentVoice = false,
        userAskedForVoice = false,
        replyText = '',
        intent = 'CHAT'
    } = {}) {
        const mode = this.getEffectiveVoiceMode(chatId);
        if (mode === 'off') return false;

        const text = String(replyText || '');
        if (/```[\s\S]*?```/.test(text)) return false;
        if (intent === 'MATH' && text.length > 300) return false;

        if (userAskedForVoice) return true;
        if (mode === 'on') return true;
        return Boolean(userSentVoice);
    }

    // --- বাউন্ডেড কুলডাউন ও রোটেশন ---
    isCoolingDown(id) {
        const exp = this.cooldowns.get(id) || 0;
        if (exp <= Date.now()) {
            this.cooldowns.delete(id);
            return false;
        }
        return true;
    }

    markCooldown(id, ms) {
        if (this.cooldowns.size >= 60 && !this.cooldowns.has(id)) {
            this.sweepCooldowns();
            if (this.cooldowns.size >= 60) this.cooldowns.delete(this.cooldowns.keys().next().value);
        }
        this.cooldowns.set(id, Date.now() + ms);
    }

    sweepCooldowns() {
        const now = Date.now();
        for (const [id, exp] of this.cooldowns.entries()) {
            if (exp <= now) this.cooldowns.delete(id);
        }
    }

    getRotatedKeys(keys, type) {
        if (!keys.length) return [];
        const start = (type === 'tts' ? this.rrTtsIndex : this.rrSttIndex) % keys.length;
        if (type === 'tts') this.rrTtsIndex = (start + 1) % keys.length;
        else this.rrSttIndex = (start + 1) % keys.length;

        const ordered = [];
        for (let i = 0; i < keys.length; i++) {
            const idx = (start + i) % keys.length;
            ordered.push({ key: keys[idx], index: idx + 1 });
        }
        return ordered;
    }

    // --- টাইট ৪৫০KB মাইক্রো ভয়েস ক্যাশ ---
    getFromMicroCache(key) {
        const item = this.microCache.get(key);
        if (!item) return null;
        this.microCache.delete(key);
        this.microCache.set(key, item);
        return item;
    }

    putInMicroCache(key, entry) {
        if (!entry?.buffer || entry.buffer.length > 96 * 1024) return;
        const { heavyFilterGuardMb } = getDynamicRamGuards();
        if (getRssMb() >= heavyFilterGuardMb) return;

        if (this.microCache.has(key)) {
            this.microCacheBytes -= this.microCache.get(key).size;
            this.microCache.delete(key);
        }

        const size = entry.buffer.length;
        while (
            this.microCache.size >= this.config.maxMicroCacheItems ||
            (this.microCacheBytes + size) > this.config.maxMicroCacheBytes
        ) {
            const oldestKey = this.microCache.keys().next().value;
            if (!oldestKey) break;
            this.microCacheBytes -= this.microCache.get(oldestKey)?.size || 0;
            this.microCache.delete(oldestKey);
        }

        this.microCache.set(key, { ...entry, size });
        this.microCacheBytes += size;
    }

    clearMicroCache() {
        this.microCache.clear();
        this.microCacheBytes = 0;
    }

    // =========================================================================
    // পার্ট ১: জিরো-কনভার্সন ডাইরেক্ট OGG STT + ৩-স্তরের ফেলওভার (Groq -> Dual-Gemini -> Backup)
    // =========================================================================

    async _probeTempAudioFile(inFile, fallbackDurationSec = null) {
        let durationSec = (Number.isFinite(fallbackDurationSec) && fallbackDurationSec > 0)
            ? Number(fallbackDurationSec)
            : null;
        let maxVolumeDb = null;

        try {
            const { stderr } = await runProcess(
                'ffmpeg',
                ['-threads', '1', '-hide_banner', '-i', inFile, '-af', 'volumedetect', '-f', 'null', '-'],
                8000
            );
            const maxMatch = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
            if (maxMatch) maxVolumeDb = parseFloat(maxMatch[1]);
            const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
            if (durMatch) {
                const parsedDur = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                if (Number.isFinite(parsedDur) && parsedDur > 0) durationSec = parsedDur;
            }
        } catch {}

        if (durationSec !== null && durationSec < this.config.minVoiceDurationSec) {
            this.metrics.sttTooShortBlocked++;
            return { ok: false, reason: 'too_short', durationSec, maxVolumeDb };
        }
        if (durationSec !== null && durationSec > this.config.maxVoiceDurationSec) {
            return { ok: false, reason: 'too_long', durationSec, maxVolumeDb };
        }
        if (maxVolumeDb !== null && maxVolumeDb <= this.config.silencePeakDbThreshold) {
            this.metrics.sttSilentBlocked++;
            return { ok: false, reason: 'silent', durationSec: durationSec || 0, maxVolumeDb };
        }

        return { ok: true, reason: 'valid', durationSec: durationSec || 0, maxVolumeDb };
    }

    async _convertTempToCleanWav(inFile) {
        const outFile = makeTempPath('stt_out', 'wav');
        try {
            await runProcess(
                'ffmpeg',
                ['-y', '-threads', '1', '-i', inFile, '-af', 'highpass=f=85,lowpass=f=7600', '-ar', '16000', '-ac', '1', outFile],
                this.config.ffmpegTimeoutMs
            );
            return { buffer: fs.readFileSync(outFile), mimeType: 'audio/wav', filename: 'voice.wav' };
        } catch {
            return null;
        } finally {
            safeUnlink(outFile);
        }
    }

    async inspectAudioBuffer(audioBuffer, fallbackDurationSec = null) {
        if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 250) {
            return { ok: false, reason: 'empty_buffer', durationSec: 0, maxVolumeDb: -99 };
        }
        if (audioBuffer.length > this.config.maxInputBytes) {
            return { ok: false, reason: 'too_long', durationSec: this.config.maxVoiceDurationSec + 1, maxVolumeDb: 0 };
        }

        return this.runWithFfmpegLock(async () => {
            const inFile = makeTempPath('probe', 'ogg');
            try {
                fs.writeFileSync(inFile, audioBuffer);
                return await this._probeTempAudioFile(inFile, fallbackDurationSec);
            } finally {
                safeUnlink(inFile);
            }
        }, { allowOverflow: true });
    }

    async normalizeIncomingVoice(inputBuffer) {
        return this.runWithFfmpegLock(async () => {
            const inFile = makeTempPath('stt_in', 'ogg');
            try {
                fs.writeFileSync(inFile, inputBuffer);
                const converted = await this._convertTempToCleanWav(inFile);
                return converted || { buffer: inputBuffer, mimeType: 'audio/ogg', filename: 'voice.ogg' };
            } finally {
                safeUnlink(inFile);
            }
        }, { allowOverflow: true });
    }

    async inspectAndPrepareIncomingVoice(audioBuffer, fallbackDurationSec = null) {
        if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 250) {
            return { probe: { ok: false, reason: 'empty_buffer', durationSec: 0, maxVolumeDb: -99 }, prepared: null };
        }
        if (audioBuffer.length > this.config.maxInputBytes) {
            return { probe: { ok: false, reason: 'too_long', durationSec: this.config.maxVoiceDurationSec + 1, maxVolumeDb: 0 }, prepared: null };
        }

        const fmt = this.detectRawAudioFormat(audioBuffer, 'audio/ogg');
        const directPayload = fmt.type === 'ogg'
            ? { buffer: audioBuffer, mimeType: 'audio/ogg', filename: 'voice.ogg' }
            : fmt.type === 'mp3'
                ? { buffer: audioBuffer, mimeType: 'audio/mpeg', filename: 'voice.mp3' }
                : fmt.type === 'wav'
                    ? { buffer: audioBuffer, mimeType: 'audio/wav', filename: 'voice.wav' }
                    : null;

        // ২৫৬MB RAM অপটিমাইজেশন: ভ্যালিড OGG হলে WAV-এ না বদলে শুধু হালকা ভলিউম/সময় প্রোব করেই সরাসরি Groq-এ পাঠানো হয়
        return this.runWithFfmpegLock(async () => {
            const inFile = makeTempPath('stt_pipe', fmt.ext || 'ogg');
            try {
                fs.writeFileSync(inFile, audioBuffer);
                const probe = await this._probeTempAudioFile(inFile, fallbackDurationSec);
                if (!probe.ok) return { probe, prepared: null };

                if (directPayload) return { probe, prepared: directPayload };

                const wav = await this._convertTempToCleanWav(inFile);
                if (wav && wav.buffer.length <= this.config.maxWavForGroqBytes) {
                    return { probe, prepared: wav };
                }
                return { probe, prepared: { buffer: audioBuffer, mimeType: 'audio/ogg', filename: 'voice.ogg' } };
            } finally {
                safeUnlink(inFile);
            }
        }, { allowOverflow: true });
    }

    isWhisperHallucination(text = '') {
        const clean = normalizeBn(text).trim();
        if (!clean || clean.length < 2) return true;
        if (isRepetitiveLoop(clean)) return true;
        return WHISPER_HALLUCINATIONS.some((re) => re.test(clean));
    }

    async transcribeWithGroq(audioBuf, filename = 'voice.ogg', mimeType = 'audio/ogg') {
        this.syncKeysFromSettings();
        const candidates = this.getRotatedKeys(this.groqKeys, 'stt');
        if (!candidates.length) return null;

        const bdHintPrompt =
            'বাংলাদেশি স্বাভাবিক কথ্য বাংলা ও বাংলা-ইংরেজি। MSK, মাহিরু, গ্রুপ, টেকওভার, লকডাউন, রুট, ওনার, অ্যাক্সেস, ইনবক্স, ভয়েস, মেসেজ, কমান্ড, রিস্টার্ট, ডক্টর, ব্যাকআপ, বিকাশ, নগদ, ভাই।';

        for (const { key, index } of candidates) {
            if (this.isCoolingDown(`auth:groq${index}`)) continue;

            for (const model of this.config.sttGroqModels) {
                const cdId = `stt:groq${index}:${model}`;
                if (this.isCoolingDown(cdId)) continue;

                const { controller, clear } = createAbortTimer(this.config.sttTimeoutMs);
                try {
                    const form = new FormData();
                    form.append('file', new Blob([audioBuf], { type: mimeType }), filename);
                    form.append('model', model);
                    form.append('language', 'bn');
                    form.append('temperature', '0');
                    form.append('prompt', bdHintPrompt);
                    form.append('response_format', 'json');

                    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${key}` },
                        body: form,
                        signal: controller.signal
                    });

                    if (res.status === 401 || res.status === 403) {
                        this.markCooldown(`auth:groq${index}`, this.config.authQuarantineMs);
                        break;
                    }
                    if (res.status === 429 || res.status >= 500) {
                        this.markCooldown(cdId, parseRetryAfterMs(res, this.config.sttCooldownMs));
                        continue;
                    }
                    if (!res.ok) continue;

                    const data = await res.json();
                    const text = normalizeBn(data?.text || '').trim();
                    if (text && !this.isWhisperHallucination(text)) {
                        this.metrics.sttGroqHits++;
                        return { text, provider: `groq${index}:${model}` };
                    }
                } catch {
                    this.markCooldown(cdId, 30 * 1000);
                } finally {
                    clear();
                }
            }
        }
        return null;
    }

    // ডুয়াল-জেমিনি STT: AIza (AI Studio) ও AQ. (Vertex AI Express) — দুটোই সমর্থিত
    async transcribeWithGemini(audioBuffer, mimeType = 'audio/ogg') {
        this.syncKeysFromSettings();
        const candidates = this.getRotatedKeys(this.geminiKeys, 'stt');
        if (!candidates.length) return null;

        let base64Audio = audioBuffer.toString('base64');
        const instruction = [
            'Transcribe this WhatsApp voice message accurately.',
            'The speaker is from Bangladesh speaking everyday Bangladeshi Bangla, regional Bangla dialect, or mixed Bangla-English.',
            'Write Bangla speech in natural Bangla script and English words naturally.',
            'Output ONLY the exact spoken transcript with zero extra commentary.',
            'If there is strictly no human speech at all (only static/silence), output exactly: [NO_SPEECH]'
        ].join(' ');

        try {
            for (const { key, index } of candidates) {
                if (this.isCoolingDown(`auth:gemini${index}`)) continue;
                const isVertex = classifyGeminiKey(key) === 'vertex_express';

                for (const model of this.config.sttGeminiModels) {
                    const cdId = `stt:gemini${index}:${model}`;
                    if (this.isCoolingDown(cdId)) continue;

                    const { controller, clear } = createAbortTimer(this.config.sttTimeoutMs);
                    try {
                        const url = isVertex
                            ? `${VERTEX_EXPRESS_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
                            : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
                        const headers = { 'Content-Type': 'application/json' };
                        if (!isVertex) headers['x-goog-api-key'] = key;

                        const res = await fetch(url, {
                            method: 'POST',
                            headers,
                            signal: controller.signal,
                            body: JSON.stringify({
                                contents: [{
                                    role: 'user',
                                    parts: [
                                        { text: instruction },
                                        { inlineData: { mimeType, data: base64Audio } }
                                    ]
                                }],
                                generationConfig: { temperature: 0.1, maxOutputTokens: 420 }
                            })
                        });

                        if (res.status === 401 || res.status === 403) {
                            this.markCooldown(`auth:gemini${index}`, this.config.authQuarantineMs);
                            break;
                        }
                        if (res.status === 429 || res.status >= 500) {
                            this.markCooldown(cdId, parseRetryAfterMs(res, this.config.sttCooldownMs));
                            continue;
                        }
                        if (!res.ok) continue;

                        const data = await res.json();
                        const text = normalizeBn(
                            data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join(' ') || ''
                        ).trim();
                        if (!text || text.includes('[NO_SPEECH]')) {
                            return { text: '', noSpeech: true, provider: `${isVertex ? 'geminiAQ' : 'gemini'}${index}:${model}` };
                        }
                        if (!this.isWhisperHallucination(text)) {
                            this.metrics.sttGeminiHits++;
                            return { text, provider: `${isVertex ? 'geminiAQ' : 'gemini'}${index}:${model}` };
                        }
                    } catch {
                        this.markCooldown(cdId, 30 * 1000);
                    } finally {
                        clear();
                    }
                }
            }
            return null;
        } finally {
            base64Audio = '';
        }
    }

    async transcribeWithBackup(audioBuffer, mimeType = 'audio/ogg') {
        const fn = backupAI?.transcribeWithBackupAI || backupAI?.transcribeWithMahiruAI;
        if (typeof fn !== 'function') return null;
        if (typeof backupAI?.isBackupReady === 'function' && !backupAI.isBackupReady()) return null;

        try {
            const text = normalizeBn(await fn(audioBuffer, mimeType, 14000)).trim();
            if (text && !this.isWhisperHallucination(text)) {
                this.metrics.sttBackupHits++;
                return { text, provider: 'backup-ai-stt' };
            }
        } catch {}
        return null;
    }

    async transcribeVoice(audioBuffer, { durationSec = null, preferGroqFirst = true } = {}) {
        this.metrics.sttTotal++;
        const startedAt = Date.now();
        this.syncKeysFromSettings();

        const hasGroq = this.groqKeys.length > 0;
        const { probe, prepared } = await this.inspectAndPrepareIncomingVoice(audioBuffer, durationSec);

        if (!probe.ok) {
            const friendlyReply = probe.reason === 'too_long'
                ? 'ভয়েসটা অনেক বড় হয়ে গেছে, ২ মিনিটের ভেতরে একটু ছোট করে বললে সহজেই বুঝতে পারব।'
                : 'ভয়েসটা মনে হয় একটু কেটে গেছে বা স্পষ্ট শব্দ আসেনি, আবার একটু বলবে?';

            return {
                ok: false,
                reason: probe.reason,
                transcript: '',
                durationSec: probe.durationSec,
                friendlyReply,
                ms: Date.now() - startedAt
            };
        }

        let result = null;
        const geminiMime = prepared?.mimeType || 'audio/ogg';

        try {
            if (preferGroqFirst && hasGroq) {
                result = await this.transcribeWithGroq(prepared.buffer, prepared.filename, prepared.mimeType);
                if (!result) result = await this.transcribeWithGemini(audioBuffer, geminiMime);
            } else {
                result = await this.transcribeWithGemini(audioBuffer, geminiMime);
                if (!result && hasGroq) {
                    result = await this.transcribeWithGroq(prepared.buffer, prepared.filename, prepared.mimeType);
                }
            }

            if (!result?.text && !result?.noSpeech) {
                result = await this.transcribeWithBackup(audioBuffer, geminiMime);
            }
        } finally {
            if (prepared && prepared.buffer !== audioBuffer) prepared.buffer = null;
        }

        if (result?.text) {
            this.metrics.sttSuccess++;
            return {
                ok: true,
                reason: 'transcribed',
                transcript: result.text,
                provider: result.provider,
                durationSec: probe.durationSec,
                ms: Date.now() - startedAt
            };
        }

        this.metrics.sttFailed++;
        return {
            ok: false,
            reason: result?.noSpeech ? 'no_speech' : 'stt_unavailable',
            transcript: '',
            durationSec: probe.durationSec,
            friendlyReply: 'ভয়েসটা নয়েজের কারণে পরিষ্কার বোঝা যায়নি, আরেকবার একটু কাছ থেকে বলবে অথবা লিখে জানাবে?',
            ms: Date.now() - startedAt
        };
    }

    getVoiceConversationRules(isVoiceReply = false) {
        const base = [
            '- ইউজারের ভয়েস ট্রান্সক্রিপ্টে ছোটখাটো বানান বা আঞ্চলিক টানের হেরফের থাকতে পারে; প্রসঙ্গ বুঝে সরাসরি স্বাভাবিক উত্তর দাও।',
            '- কখনোই বলবে না "আমি আপনার ভাষা বুঝতে পারছি না" বা "দয়া করে বাংলা ভাষায় বলুন"।',
            '- এই ভয়েস মেসেজটি সম্পূর্ণ নতুন ইনপুট; ইউজার স্পষ্টভাবে উল্লেখ না করলে আগের কোনো ছবি বা স্ক্রিনশট নিয়ে আন্দাজে কথা বলবে না।'
        ];

        if (isVoiceReply) {
            base.push(
                '- এই উত্তরটি ভয়েস নোট হিসেবে শোনানো হবে: ২ থেকে ৪টি ছোট, স্বাভাবিক ও আন্তরিক কথ্য বাংলাদেশি বাংলা বাক্যে উত্তর দাও—যেন আসল একজন মানুষ অনুভূতি দিয়ে কথা বলছে।',
                '- উত্তরে কোনো বুলেট পয়েন্ট, টেবিল, মার্কডাউন বা লম্বা লিংক দেবে না; স্বাভাবিক বিরতির জন্য সঠিক দাঁড়ি (।), কমা (,), প্রশ্নবোধক (?) বা বিস্ময়সূচক (!) ব্যবহার করো।'
            );
        }
        return base.join('\n');
    }

    isBadVoiceRejection(replyText = '') {
        return BAD_VOICE_REJECTION_RE.test(normalizeBn(replyText));
    }

    // =========================================================================
    // পার্ট ২: ইউনিফাইড ক্রিস্টাল TTS (Gemini + Crystal NeuralVoice + Backup AI)
    // =========================================================================

    detectVoiceMood(replyText = '', userText = '', role = 'auto') {
        const combo = normalizeBn(`${String(userText || '')} ${String(replyText || '')}`).toLowerCase();

        if (/ভালোবাসি|ভালবাসি|মিস করছি|জান|কলিজা|বাবু|আদর|love|miss you|❤️|🥰|😘/.test(combo)) return 'affectionate_sweet';
        if (/দুঃখ|কষ্ট|মন খারাপ|কান্না|কাঁদ|সরি|sorry|দুঃখিত|ক্ষমা|অসুস্থ|জ্বর|ব্যথা|মারা গেছে|হারিয়ে|ভেঙে|খুব খারাপ লাগছে|tension|টেনশন|হতাশ/.test(combo)) return 'empathetic_sad';
        if (/অভিনন্দন|শুভ|খুশি|দারুণ|অসাধারণ|সুপার|congrats|awesome|amazing|happy|জিতেছি|পাস করেছি|ব্রেভো/.test(combo)) return 'happy_warm';
        if (/সত্যি|তাই নাকি|বাহ|ওয়াও|wow|interesting|দারুণ ব্যাপার|কী বলো|শুনে ভালো লাগল/.test(combo)) return 'excited_curious';
        if (/হা হা|হাহা|হাহাহা|মজা|জোক|হাসি|কমেডি|বস|ব্রো|আড্ডা|গল্প|lol|haha|hehe/.test(combo)) return 'playful_casual';
        if (/সতর্ক|সাবধান|ঝুঁকি|অননুমোদিত|নিষিদ্ধ|ব্লক|ব্যান|হ্যাক|সতর্কতা|জরুরি|ভুল করবে না/.test(combo)) return 'serious_firm';
        if (/ধাপ|প্রথমে|তারপর|সমাধান|কীভাবে|কোড|অংক|হিসাব|সেটিংস|রুট|ফ্ল্যাশ|সার্ভার|টাকা/.test(combo)) return 'helpful_clear';
        if (role === 'gf') return 'affectionate_sweet';
        if (role === 'client') return 'helpful_clear';
        return 'natural_friendly';
    }

    buildTTSPayload(rawReplyText, userText = '', role = 'auto') {
        let safeSource = normalizeBn(rawReplyText);
        if (privacyFirewall?.auditOutboundText) {
            const audited = privacyFirewall.auditOutboundText(safeSource, { isSuperOwner: false });
            safeSource = audited.text.replace(/\[(?:REDACTED_[A-Z]+|SERVER_PATH|PROTECTED_[A-Z]+)\]/g, '');
        }

        const spokenText = textSanitizer?.prepareTextForTTS
            ? textSanitizer.prepareTextForTTS(safeSource, this.config.maxTtsChars)
            : safeSource
                .replace(/https?:\/\/\S+/gi, 'আমাদের ওয়েবসাইটে')
                .replace(/@@(?:URLTOKEN|CODEBLOCK)[_\d₀-₉]+@@/g, '')
                .replace(/[*_`~#>|•━═╭╰┃─]+/g, ' ')
                .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, this.config.maxTtsChars);

        if (!spokenText || spokenText.length < 2) return null;

        const mood = this.detectVoiceMood(safeSource, userText, role);
        const preset = MOOD_PRESETS[mood] || MOOD_PRESETS.natural_friendly;

        const ttsPrompt = [
            preset.direction,
            'Pronounce every Bangladeshi Bengali word cleanly and smoothly with natural human feeling, emotion, and brief pauses at commas and periods. Never read these instructions aloud.',
            '',
            spokenText
        ].join('\n');

        return {
            mood,
            studioMood: preset.studioMood || 'calm',
            moodLabel: preset.label,
            preset,
            spokenText,
            ttsPrompt
        };
    }

    detectRawAudioFormat(buffer, mimeType = '') {
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

    isSaneTtsAudioBuffer(buffer, mimeType = '') {
        if (!Buffer.isBuffer(buffer)) return false;
        const fmt = this.detectRawAudioFormat(buffer, mimeType);
        return fmt.type === 'pcm' ? buffer.length >= 10000 : buffer.length >= 1500;
    }

    // ক্রিস্টাল-ক্লিয়ার ট্রান্সপারেন্ট মাস্টারিং (neuralVoice v1.0-এর সাথে ১০০% সিঙ্কড — জিরো ভোঁতা কাটঅফ)
    async masterToWhatsAppPTT(rawBuffer, mimeType = '') {
        return this.runWithFfmpegLock(async () => {
            const fmt = this.detectRawAudioFormat(rawBuffer, mimeType);
            const inFile = makeTempPath('tts_in', fmt.ext);
            const outFile = makeTempPath('tts_out', 'ogg');
            const { heavyFilterGuardMb } = getDynamicRamGuards();
            const lowRamMode = getRssMb() >= heavyFilterGuardMb;

            const sm = settings?.maya?.voice?.studioMaster || {};
            const hp = Math.min(Number(sm.highpassHz) || 75, 90);
            const lp = Math.max(Number(sm.lowpassHz) || 11800, 11000);
            const bitrate = sm.opusBitrate || '64k';
            const sampleRate = String(sm.sampleRate || 48000);

            try {
                fs.writeFileSync(inFile, rawBuffer);

                const inputArgs = fmt.type === 'pcm'
                    ? ['-f', 's16le', '-ar', String(fmt.sampleRate || 24000), '-ac', '1', '-i', inFile]
                    : ['-i', inFile];

                const crystalFilter = lowRamMode
                    ? `highpass=f=${hp},alimiter=limit=0.95`
                    : `highpass=f=${hp},lowpass=f=${lp},alimiter=limit=0.95`;

                const outArgs = [
                    '-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on',
                    '-ar', sampleRate, '-ac', '1', '-application', 'audio', outFile
                ];

                try {
                    await runProcess(
                        'ffmpeg',
                        ['-y', '-threads', '1', ...inputArgs, '-af', crystalFilter, ...outArgs],
                        this.config.ffmpegTimeoutMs
                    );
                } catch {
                    await runProcess(
                        'ffmpeg',
                        ['-y', '-threads', '1', ...inputArgs, ...outArgs],
                        this.config.ffmpegTimeoutMs
                    );
                }

                const opusBuf = fs.readFileSync(outFile);
                if (!opusBuf || opusBuf.length < 500) {
                    throw new Error('Generated Opus buffer is empty or corrupt');
                }
                return opusBuf;
            } finally {
                safeUnlink(inFile);
                safeUnlink(outFile);
            }
        });
    }

    async delegateToStudioEngine(rawReplyText, payload, { role = 'auto', userText = '', selectedVoice = 'Aoede', startedAt = Date.now() } = {}) {
        const nv = getNeuralVoiceLazy();
        if (!nv?.synthesizeStudioVoice) return null;

        const studioRes = await nv.synthesizeStudioVoice(rawReplyText, {
            role,
            userText,
            incomingMood: payload.studioMood || 'calm'
        }).catch(() => null);

        if (!studioRes?.ok || !studioRes.buffer) return null;

        const ms = Date.now() - startedAt;
        this.metrics.ttsSuccess++;
        this.metrics.ttsStudioDelegatedHits++;
        this.metrics.avgTtsMs = this.metrics.ttsSuccess === 1
            ? ms
            : Math.round((this.metrics.avgTtsMs * 0.75) + (ms * 0.25));

        return {
            ok: true,
            buffer: studioRes.buffer,
            mimetype: studioRes.mimetype || 'audio/ogg; codecs=opus',
            ptt: true,
            mood: payload.mood,
            moodLabel: payload.moodLabel,
            voiceName: selectedVoice,
            spokenText: payload.spokenText,
            provider: studioRes.provider || 'crystal-studio',
            ms
        };
    }

    async synthesizeVoice(rawReplyText, { chatId = '', userText = '', voiceName = null, role = 'auto' } = {}) {
        this.metrics.ttsTotal++;
        const startedAt = Date.now();
        this.syncKeysFromSettings();

        const payload = this.buildTTSPayload(rawReplyText, userText, role);
        if (!payload) {
            this.metrics.ttsFailed++;
            return { ok: false, reason: 'empty_spoken_text' };
        }

        const selectedVoice = voiceName || this.getEffectiveVoiceName(chatId);
        const cacheKey = payload.spokenText.length <= 95
            ? `v5:${selectedVoice}:${payload.mood}:${payload.spokenText}`
            : '';

        if (cacheKey) {
            const cached = this.getFromMicroCache(cacheKey);
            if (cached) {
                this.metrics.ttsSuccess++;
                this.metrics.ttsCacheHits++;
                return {
                    ok: true,
                    buffer: cached.buffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true,
                    mood: cached.mood,
                    moodLabel: cached.moodLabel,
                    voiceName: cached.voiceName,
                    spokenText: payload.spokenText,
                    provider: `${cached.provider} (cache)`,
                    ms: 1
                };
            }
            if (this.inFlightTts.has(cacheKey)) return this.inFlightTts.get(cacheKey);
        }

        const { ttsSkipGuardMb } = getDynamicRamGuards();
        if (getRssMb() >= ttsSkipGuardMb || this.ffmpegQueueDepth >= this.config.maxFfmpegQueue) {
            const offlineRes = await this.delegateToStudioEngine(rawReplyText, payload, { role, userText, selectedVoice, startedAt });
            if (offlineRes) return offlineRes;
            this.metrics.ttsQueueSkipped++;
            return { ok: false, reason: 'resource_guard_skip', ms: Date.now() - startedAt };
        }

        const runSynthesis = async () => {
            const nv = getNeuralVoiceLazy();
            const studioStats = nv?.getVoiceStudioStats ? nv.getVoiceStudioStats() : null;
            const studioMode = studioStats?.config?.providerMode || 'auto';

            // Gemini TTS শুধু AIza কী-তে চলে (AQ. কী কোয়ারেন্টাইন না করে স্টুডিওতে পাঠানো)
            const aiStudioGeminiKeys = this.geminiKeys.filter((k) => classifyGeminiKey(k) === 'ai_studio');
            const preferStudioFirst =
                aiStudioGeminiKeys.length === 0 ||
                studioMode === 'cloned' ||
                studioMode === 'gtts' ||
                studioMode === 'edge' ||
                studioMode === 'backup' ||
                (studioMode === 'auto' && Boolean(studioStats?.clonedReady));

            if (preferStudioFirst) {
                const studioHit = await this.delegateToStudioEngine(rawReplyText, payload, { role, userText, selectedVoice, startedAt });
                if (studioHit) {
                    if (cacheKey) this.putInMicroCache(cacheKey, studioHit);
                    return studioHit;
                }
            }

            const candidates = this.getRotatedKeys(aiStudioGeminiKeys, 'tts');
            const ttsModels = [...new Set([this.config.ttsModel, ...(this.config.ttsFallbackModels || [])])].filter(Boolean);

            for (const { key, index } of candidates) {
                if (this.isCoolingDown(`auth:gemini${index}`)) continue;

                for (const model of ttsModels) {
                    const cdId = `tts:gemini${index}:${model}`;
                    if (this.isCoolingDown(cdId)) continue;

                    const { controller, clear } = createAbortTimer(this.config.ttsTimeoutMs);
                    let rawAudioBuf = null;
                    let mimeType = '';

                    try {
                        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
                        const res = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                            signal: controller.signal,
                            body: JSON.stringify({
                                contents: [{ role: 'user', parts: [{ text: payload.ttsPrompt }] }],
                                generationConfig: {
                                    responseModalities: ['AUDIO'],
                                    speechConfig: {
                                        voiceConfig: {
                                            prebuiltVoiceConfig: { voiceName: selectedVoice }
                                        }
                                    }
                                }
                            })
                        });

                        if (res.status === 401 || res.status === 403) {
                            this.markCooldown(`auth:gemini${index}`, this.config.authQuarantineMs);
                            break;
                        }
                        if (res.status === 429 || res.status >= 500) {
                            this.markCooldown(cdId, parseRetryAfterMs(res, this.config.ttsCooldownMs));
                            continue;
                        }
                        if (!res.ok) {
                            this.markCooldown(cdId, 30 * 1000);
                            continue;
                        }

                        const data = await res.json();
                        const parts = data?.candidates?.[0]?.content?.parts || [];
                        const audioPart = parts.find((p) => p?.inlineData?.data);
                        if (audioPart?.inlineData?.data) {
                            rawAudioBuf = Buffer.from(audioPart.inlineData.data, 'base64');
                            mimeType = audioPart.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000';
                        }
                    } catch (err) {
                        const isAbort = err?.name === 'AbortError';
                        if (isAbort) this.metrics.ttsTimeouts++;
                        this.markCooldown(cdId, isAbort ? this.config.ttsCooldownMs : 30 * 1000);
                        continue;
                    } finally {
                        clear();
                    }

                    if (!rawAudioBuf || !this.isSaneTtsAudioBuffer(rawAudioBuf, mimeType)) {
                        rawAudioBuf = null;
                        continue;
                    }

                    try {
                        const opusBuffer = await this.masterToWhatsAppPTT(rawAudioBuf, mimeType);
                        rawAudioBuf = null;
                        const ms = Date.now() - startedAt;

                        this.metrics.ttsSuccess++;
                        this.metrics.avgTtsMs = this.metrics.ttsSuccess === 1
                            ? ms
                            : Math.round((this.metrics.avgTtsMs * 0.75) + (ms * 0.25));

                        const result = {
                            ok: true,
                            buffer: opusBuffer,
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true,
                            mood: payload.mood,
                            moodLabel: payload.moodLabel,
                            voiceName: selectedVoice,
                            spokenText: payload.spokenText,
                            provider: `gemini${index}`,
                            ms
                        };
                        if (cacheKey) this.putInMicroCache(cacheKey, result);
                        return result;
                    } catch (err) {
                        rawAudioBuf = null;
                        if (err?.code === 'FFMPEG_BUSY') {
                            this.metrics.ttsQueueSkipped++;
                            return { ok: false, reason: 'ffmpeg_queue_busy', ms: Date.now() - startedAt };
                        }
                    }
                }
            }

            // স্টুডিও ব্যাকআপ (Crystal Edge Neural -> Backup AI TTS -> gTTS -> Offline Bank)
            if (!preferStudioFirst) {
                const studioFallback = await this.delegateToStudioEngine(rawReplyText, payload, { role, userText, selectedVoice, startedAt });
                if (studioFallback) {
                    if (cacheKey) this.putInMicroCache(cacheKey, studioFallback);
                    return studioFallback;
                }
            }

            this.metrics.ttsFailed++;
            return { ok: false, reason: 'all_tts_unavailable', ms: Date.now() - startedAt };
        };

        const job = runSynthesis().finally(() => {
            if (cacheKey) this.inFlightTts.delete(cacheKey);
        });

        if (cacheKey) this.inFlightTts.set(cacheKey, job);
        return job;
    }

    getStats() {
        const now = Date.now();
        const activeCooldowns = [];
        for (const [id, exp] of this.cooldowns.entries()) {
            if (exp > now) activeCooldowns.push(`${id} (${Math.ceil((exp - now) / 1000)}s)`);
        }

        const geminiAizaKeys = this.geminiKeys.filter((k) => classifyGeminiKey(k) === 'ai_studio').length;
        const geminiAqKeys = this.geminiKeys.filter((k) => classifyGeminiKey(k) === 'vertex_express').length;

        return {
            globalMode: this.prefs.globalMode,
            voiceName: this.prefs.voiceName,
            disabledChatsCount: this.listChatVoiceSettings('off').length,
            customChatsCount: Object.keys(this.prefs.chats || {}).length,
            geminiKeysLoaded: this.geminiKeys.length,
            geminiAizaKeys,
            geminiAqKeys,
            groqKeysLoaded: this.groqKeys.length,
            ffmpegQueueDepth: this.ffmpegQueueDepth,
            microCacheItems: this.microCache.size,
            microCacheKb: Math.round(this.microCacheBytes / 1024),
            activeCooldowns,
            ...this.metrics
        };
    }
}

const voiceEngine = new VoiceEngine();

module.exports = {
    VoiceEngine,
    voiceEngine,
    classifyGeminiKey,
    setVoiceApiKeys: (keys) => voiceEngine.setApiKeys(keys),
    refreshVoiceKeys: () => voiceEngine.refreshKeys(),
    resetVoiceCooldowns: () => voiceEngine.resetCooldowns(),
    clearVoiceMemoryCache: () => voiceEngine.clearMicroCache(),
    getAvailableVoices: () => voiceEngine.getAvailableVoices(),
    transcribeVoice: (buf, opts) => voiceEngine.transcribeVoice(buf, opts),
    synthesizeVoice: (text, opts) => voiceEngine.synthesizeVoice(text, opts),
    shouldSendVoiceReply: (opts) => voiceEngine.shouldSendVoiceReply(opts),
    detectVoiceMood: (reply, user, role) => voiceEngine.detectVoiceMood(reply, user, role),
    getVoiceConversationRules: (isVoice) => voiceEngine.getVoiceConversationRules(isVoice),
    isBadVoiceRejection: (text) => voiceEngine.isBadVoiceRejection(text),
    setGlobalVoiceMode: (mode) => voiceEngine.setGlobalVoiceMode(mode),
    setGlobalVoiceName: (name) => voiceEngine.setGlobalVoiceName(name),
    setChatVoiceName: (chatId, name) => voiceEngine.setChatVoiceName(chatId, name),
    setChatVoiceMode: (chatId, mode) => voiceEngine.setChatVoiceMode(chatId, mode),
    getEffectiveVoiceMode: (chatId) => voiceEngine.getEffectiveVoiceMode(chatId),
    getEffectiveVoiceName: (chatId) => voiceEngine.getEffectiveVoiceName(chatId),
    listChatVoiceSettings: (filter) => voiceEngine.listChatVoiceSettings(filter),
    getVoiceStats: () => voiceEngine.getStats()
};
