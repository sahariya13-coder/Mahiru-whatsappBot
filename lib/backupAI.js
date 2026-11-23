/**
 * Mahiru Shiina • Mahiru v1.0 ULTIMATE — Fast Zero-Downtime Emergency Backup AI Engine
 * Tuned for 256MB Cloud RAM (20s Timeout, 3MB Image Cap, Circuit Breaker, Zero Persona Leak)
 * Replaces legacy mahiruAI.js with strict Mahiru branding & OOM protection
 */
const crypto = require('crypto');

const settings = (() => {
    try { return require('../settings'); } catch { return null; }
})();

const bkCfg = settings.mahiru?.backupAI || {};

const API_BASE = String(
    bkCfg.apiUrl ||
    process.env.BACKUP_AI_URL ||
    process.env.MAHIRU_AI_API_URL ||
    'https://mahiru-shiina-ai.vercel.app'
).replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = Math.min(Number(bkCfg.timeoutMs || 20000), 35000);
const MAX_IMAGE_BYTES = Math.min(Number(bkCfg.maxImageBytes || 3 * 1024 * 1024), 3.5 * 1024 * 1024);
const MAX_AUDIO_BYTES = 2.5 * 1024 * 1024;
const COOLDOWN_MS = 60 * 1000;

let cooldownUntil = 0;
let consecutiveFails = 0;

function isBackupEnabled() {
    return settings.mahiru?.backupAI?.enabled !== false;
}

function isBackupReady() {
    if (!isBackupEnabled()) return false;
    return Date.now() >= cooldownUntil;
}

function markBackupOk() {
    cooldownUntil = 0;
    consecutiveFails = 0;
}

function markBackupFail() {
    consecutiveFails = Math.min(consecutiveFails + 1, 5);
    cooldownUntil = Date.now() + Math.min(COOLDOWN_MS * consecutiveFails, 5 * 60 * 1000);
}

function resetBackupCooldown() {
    cooldownUntil = 0;
    consecutiveFails = 0;
}

function makeUid(value) {
    return crypto.createHash('sha256')
        .update(String(value || 'mahiru-default'))
        .digest('hex')
        .slice(0, 24);
}

// ব্যাকআপ এপিআই থেকে কখনো পুরোনো নাম লিক হলে তাৎক্ষণিক মাহিরু ব্র্যান্ডে রূপান্তর
function scrubLegacyPersona(text = '') {
    const assistantName = settings?.assistantName || 'মাহিরু';
    const ownerName = settings?.ownerDisplayName || 'প্রাইম মনির';
    return String(text || '')
        .replace(/\bMahiru\s+Shiina\b/gi, assistantName)
        .replace(/\bMahiru\b/gi, assistantName)
        .replace(/মাহিরু\s*শিনা/g, assistantName)
        .replace(/মাহিরু/g, assistantName)
        .replace(/\bOpenAI\s*GPT-?4[o]?\b/gi, `${ownerName}-এর ${assistantName}`)
        .trim();
}

function createTimer(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    if (timer.unref) timer.unref();
    return { controller, clear: () => clearTimeout(timer) };
}

async function requestJson(endpoint, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const { controller, clear } = createTimer(timeoutMs);
    try {
        const response = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            const err = new Error(data.error || data.message || `Backup AI HTTP ${response.status}`);
            err.status = response.status;
            throw err;
        }
        markBackupOk();
        return data;
    } catch (err) {
        markBackupFail();
        throw err;
    } finally {
        clear();
    }
}

function normalizeImage(image) {
    if (!image) return null;

    const rawData = Buffer.isBuffer(image.data)
        ? image.data.toString('base64')
        : String(image.data || image.base64 || '');

    const imageBase64 = rawData
        .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
        .trim();

    const mimeType = String(image.mimeType || 'image/jpeg')
        .split(';')[0]
        .trim()
        .toLowerCase();

    if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(mimeType)) {
        throw new Error('Unsupported image type: ' + mimeType);
    }

    // ২৫৬MB RAM সেফটি: পুরো বাফার ডিকোড না করেই base64 লেন্থ দিয়ে সাইজ যাচাই
    const approxBytes = Math.floor((imageBase64.length * 3) / 4);
    if (!imageBase64 || approxBytes > MAX_IMAGE_BYTES) {
        throw new Error('Image exceeds 3 MB RAM-safe backup limit');
    }

    return {
        data: imageBase64,
        mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
    };
}

async function chatWithBackupAI({ uid = 'mahiru', text = '', system = '', history = [], image = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!isBackupReady()) {
        throw new Error('Backup AI is disabled or cooling down');
    }

    const clean = String(text || '').trim().slice(0, 6000);
    const safeSystem = String(system || '').trim().slice(0, 5000);

    if (image) {
        const normalizedImage = normalizeImage(image);
        const data = await requestJson('/api/vision', {
            image: normalizedImage.data,
            mimeType: normalizedImage.mimeType,
            prompt: clean || 'এই ছবিটি বিশ্লেষণ করে কী দেখা যাচ্ছে তা সংক্ষেপে বাংলায় বলো।',
            system: safeSystem
        }, timeoutMs);

        const reply = scrubLegacyPersona(data.reply || data.answer || data.response || '');
        if (!reply) throw new Error('Backup Vision API returned empty reply');
        return reply;
    }

    if (!clean) throw new Error('Missing text');

    const messages = [];
    if (safeSystem) messages.push({ role: 'system', content: safeSystem });

    if (Array.isArray(history) && history.length) {
        for (const h of history.slice(-6)) {
            const role = (h?.role === 'assistant' || h?.role === 'model') ? 'assistant' : 'user';
            const content = String(h?.text ?? h?.content ?? '').trim().slice(0, 500);
            if (content) messages.push({ role, content });
        }
    }
    messages.push({ role: 'user', content: clean });

    const data = await requestJson('/api/chat', {
        uid: makeUid(uid),
        messages
    }, timeoutMs);

    const reply = scrubLegacyPersona(data.reply || data.answer || data.response || '');
    if (!reply) throw new Error('Backup AI returned empty reply');
    return reply;
}

async function transcribeWithBackupAI(buffer, mimeType = 'audio/ogg', timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!isBackupReady()) throw new Error('Backup STT unavailable');
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Voice audio is empty');
    if (buffer.length > MAX_AUDIO_BYTES) throw new Error('Voice file exceeds 2.5 MB backup limit');

    const data = await requestJson('/api/stt', {
        audio_base64: buffer.toString('base64'),
        mime_type: String(mimeType || 'audio/ogg').split(';')[0]
    }, timeoutMs);

    const transcript = String(data.text || '').trim();
    if (!transcript) throw new Error('Backup STT returned empty transcription');
    return transcript;
}

async function synthesizeWithBackupAI(text, voice = 'Aoede', timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!isBackupReady()) throw new Error('Backup TTS unavailable');
    const cleanText = String(text || '').trim().slice(0, 320);
    if (!cleanText) throw new Error('Empty TTS text');

    const { controller, clear } = createTimer(timeoutMs);
    try {
        const response = await fetch(API_BASE + '/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'audio/wav'
            },
            body: JSON.stringify({ text: cleanText, voice }),
            signal: controller.signal
        });

        if (!response.ok) {
            markBackupFail();
            throw new Error(`Backup TTS HTTP ${response.status}`);
        }

        const audio = Buffer.from(await response.arrayBuffer());
        if (!audio.length || audio.length < 500) {
            markBackupFail();
            throw new Error('Backup TTS returned empty audio');
        }

        markBackupOk();
        return {
            audio,
            mimeType: response.headers.get('content-type') || 'audio/wav'
        };
    } catch (err) {
        markBackupFail();
        throw err;
    } finally {
        clear();
    }
}

function getBackupAIStatus() {
    const now = Date.now();
    return {
        enabled: isBackupEnabled(),
        ready: isBackupReady(),
        cooldownRemainingSec: cooldownUntil > now ? Math.ceil((cooldownUntil - now) / 1000) : 0,
        consecutiveFails
    };
}

module.exports = {
    API_BASE,
    makeUid,
    isBackupEnabled,
    isBackupReady,
    resetBackupCooldown,
    getBackupAIStatus,
    scrubLegacyPersona,
    chatWithBackupAI,
    transcribeWithBackupAI,
    synthesizeWithBackupAI,
    // লিগ্যাসি ব্যাকওয়ার্ড-কম্প্যাটিবল এক্সপোর্ট
    chatWithMahiruAI: chatWithBackupAI,
    transcribeWithMahiruAI: transcribeWithBackupAI,
    synthesizeWithMahiruAI: synthesizeWithBackupAI
};
