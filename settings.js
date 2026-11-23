/**
 * Mahiru Shiina • Mahiru v1.0 ULTIMATE — Immutable Root Security, 256MB-Strict Auto-Scaling & Dual-Gemini Core
 * Fixes: True 256MB OOM-Safe RAM Thresholds (185/222MB) + Strict AIza/AQ. Filter + banner.png Default
 *        + ownerIdentity.json Boot Scrubber + Master Group Control Config + Crystal Voice v1.0 Sync
 * Immutable Root Super Owner: 8801624235915 | 100% Backward-Compatible
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv(override = false) {
    try {
        require('dotenv').config({ override });
    } catch {}
}
loadDotEnv(false);

// ==================================================
// ১. অটুট রুট সুপার-ওনার ভল্ট (কোনো ENV বা এডিটে রিমুভ হবে না)
// ==================================================
const ROOT_SUPER_OWNER = Object.freeze('8801624235915'); // Mahiru bot owner
const ROOT_SUPER_OWNER_LID = Object.freeze('216123442245856@lid'); // Mahiru bot owner LID

const PERMANENT_BLOCKED_ADMINS = Object.freeze([
    '918116201430'   // অননুমোদিত সুডো নম্বর
]);
const PERMANENT_BLOCKED_LIDS = Object.freeze([]);


// ==================================================
// ২. নিরাপদ ENV পার্সার ও ফোন/LID নরম্যালাইজার
// ==================================================
function stripQuotes(val = '') {
    return String(val || '').trim().replace(/^["']+|["']+$/g, '').trim();
}

function envStr(key, fallback = '') {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    const clean = stripQuotes(raw);
    return clean !== '' ? clean : fallback;
}

function envNum(key, fallback, { min = -Infinity, max = Infinity } = {}) {
    const raw = process.env[key];
    if (raw === undefined || String(raw).trim() === '') return fallback;
    const v = Number(stripQuotes(raw));
    if (!Number.isFinite(v)) return fallback;
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

function envBool(key, fallback) {
    const raw = process.env[key];
    if (raw === undefined || String(raw).trim() === '') return fallback;
    return /^(1|true|yes|on)$/i.test(stripQuotes(raw));
}

function envList(key, fallback = []) {
    const raw = envStr(key, '');
    if (!raw) return [...fallback];
    return raw.split(/[\s,;]+/).map(stripQuotes).filter(Boolean);
}

function normalizePhone(raw = '') {
    const str = String(raw || '').trim();
    if (!str || str.toLowerCase().includes('@lid')) return '';
    let digits = str.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && digits.startsWith('01')) digits = `88${digits}`;
    else if (digits.length === 10 && /^1[3-9]/.test(digits)) digits = `880${digits}`;
    else if (digits.startsWith('00880')) digits = digits.slice(2);
    return (digits.length >= 10 && digits.length <= 15) ? digits : '';
}

function normalizeLid(raw = '') {
    const s = String(raw || '').trim().toLowerCase();
    if (!s.includes('@lid')) return '';
    const base = s.split('@')[0].split(':')[0].replace(/\D/g, '');
    return base ? `${base}@lid` : '';
}

// ২৫৬MB বনাম ৩৫৬MB/৫১২MB অটো-স্কেলিং র‍্যাম থ্রেশহোল্ড (OOM-কিল প্রতিরোধী)
const RAM_PROFILE_RAW = envStr('RAM_PROFILE', '256mb').toLowerCase();
const RAM_LIMIT_MB = Math.max(128, parseInt(RAM_PROFILE_RAW.replace(/\D/g, ''), 10) || 256);
const DEFAULT_RAM_SOFT_MB = RAM_LIMIT_MB <= 256 ? 185 : Math.round(RAM_LIMIT_MB * 0.70);
const DEFAULT_RAM_CRIT_MB = RAM_LIMIT_MB <= 256 ? 222 : Math.round(RAM_LIMIT_MB * 0.85);

// ==================================================
// ৩. ডুয়াল-জেমিনি (AIza + AQ.) ও মাল্টি-প্রোভাইডার API Key কালেক্টর
// ==================================================
const warnedBadKeys = new Set();

function classifyGeminiKey(key = '') {
    const k = stripQuotes(key);
    if (!k || k.length < 16 || !/^[\x21-\x7E]+$/.test(k)) return 'invalid';
    if (k.startsWith('AQ.')) return 'vertex_express';
    if (k.startsWith('AIza')) return 'ai_studio';
    return 'invalid';
}

function collectApiKeys(prefixes = [], { provider = '', rejectPrefixes = [], allowedPrefixes = [], strictPrefix = false } = {}) {
    const found = [];
    const addRaw = (raw, sourceName = '') => {
        if (!raw) return;
        for (const token of String(raw).split(/[\s,;]+/)) {
            const clean = stripQuotes(token);
            if (clean.length < 16 || !/^[\x21-\x7E]+$/.test(clean)) continue;

            if (rejectPrefixes.some((p) => clean.startsWith(p))) {
                const warnId = `${provider}:${sourceName}:${clean.slice(0, 5)}`;
                if (!warnedBadKeys.has(warnId)) {
                    warnedBadKeys.add(warnId);
                    console.warn(`⚠️ [Settings:${provider}] Skipped unsupported token in ${sourceName} (${clean.slice(0, 5)}...).`);
                }
                continue;
            }

            if (allowedPrefixes.length && !allowedPrefixes.some((p) => clean.startsWith(p))) {
                const warnId = `${provider}:prefix:${sourceName}`;
                if (!warnedBadKeys.has(warnId)) {
                    warnedBadKeys.add(warnId);
                    console.warn(`⚠️ [Settings:${provider}] ${strictPrefix ? 'Skipped' : 'Unusual'} key prefix in ${sourceName}.`);
                }
                if (strictPrefix) continue;
            }
            found.push(clean);
        }
    };

    for (const base of prefixes) {
        addRaw(process.env[base], base);
        addRaw(process.env[`${base}S`], `${base}S`);
        for (let i = 1; i <= 12; i++) {
            addRaw(process.env[`${base}_${i}`], `${base}_${i}`);
            addRaw(process.env[`${base}${i}`], `${base}${i}`);
        }
    }

    return [...new Set(found)];
}

let cachedAIKeys = null;

function buildAIKeysSnapshot() {
    cachedAIKeys = {
        // AIza (Google AI Studio) এবং AQ. (Vertex AI Express Mode) — দুটোই স্ট্রিক্টলি সমর্থিত
        geminiKeys: collectApiKeys(['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_KEY', 'VERTEX_API_KEY'], {
            provider: 'Gemini',
            rejectPrefixes: ['ya29.'],
            allowedPrefixes: ['AIza', 'AQ.'],
            strictPrefix: true
        }),
        groqKeys: collectApiKeys(['GROQ_API_KEY', 'GROQ_KEY'], {
            provider: 'Groq',
            allowedPrefixes: ['gsk_']
        }),
        openrouterKeys: collectApiKeys(['OPENROUTER_API_KEY', 'OPENROUTER_KEY', 'OR_API_KEY'], {
            provider: 'OpenRouter',
            allowedPrefixes: ['sk-or-']
        })
    };
    return cachedAIKeys;
}

// ==================================================
// ৪. অটো-ক্লিন সিকিউরিটি সুইপার (ফেক অ্যাডমিন সব JSON ফাইল থেকে মুছে ফেলে)
// ==================================================
const HARD_BLOCKED_SUDO = Object.freeze([...new Set([
    ...PERMANENT_BLOCKED_ADMINS,
    ...envList('BLOCKED_SUDO_NUMBERS', []).map(normalizePhone)
].filter((n) => n && n !== ROOT_SUPER_OWNER))]);

const DYNAMIC_OWNERS_FILE = path.join(process.cwd(), 'data', 'dynamic_owners.json');
let dynCacheMtime = -1;
let dynCacheLastStatAt = 0;
let dynCacheState = { lockdown: false, owners: Object.create(null) };

function sanitizeAdminFilesOnce() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) return;

    const writeAtomic = (fp, obj) => {
        const tmp = `${fp}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        try {
            fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
            fs.renameSync(tmp, fp);
        } catch {
            try { fs.unlinkSync(tmp); } catch {}
        }
    };

    // ১. data/owner.json-এ ফেক সুপার-অ্যাডমিন থাকলে রুট ওনার দিয়ে রিপ্লেস
    try {
        const ownerJsonPath = path.join(dataDir, 'owner.json');
        if (fs.existsSync(ownerJsonPath)) {
            const parsed = JSON.parse(fs.readFileSync(ownerJsonPath, 'utf8'));
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const hasFake = arr.some((x) => HARD_BLOCKED_SUDO.includes(normalizePhone(x)));
            const hasRoot = arr.some((x) => normalizePhone(x) === ROOT_SUPER_OWNER);
            if (hasFake || !hasRoot) writeAtomic(ownerJsonPath, [ROOT_SUPER_OWNER]);
        }
    } catch {}

    // ২. data/userGroupData.json থেকে সব ব্লকড সুডো ক্লিন
    try {
        const ugPath = path.join(dataDir, 'userGroupData.json');
        if (fs.existsSync(ugPath)) {
            const ug = JSON.parse(fs.readFileSync(ugPath, 'utf8'));
            if (Array.isArray(ug?.sudo)) {
                const cleaned = ug.sudo.filter((entry) => {
                    const n = normalizePhone(entry);
                    return n && n !== ROOT_SUPER_OWNER && !HARD_BLOCKED_SUDO.includes(n);
                });
                if (cleaned.length !== ug.sudo.length) {
                    ug.sudo = cleaned;
                    writeAtomic(ugPath, ug);
                }
            }
        }
    } catch {}

    // ৩. data/dynamic_owners.json থেকে ব্লকড নম্বর ক্লিন
    try {
        if (fs.existsSync(DYNAMIC_OWNERS_FILE)) {
            const dyn = JSON.parse(fs.readFileSync(DYNAMIC_OWNERS_FILE, 'utf8'));
            if (dyn?.owners && typeof dyn.owners === 'object') {
                let changed = false;
                for (const key of Object.keys(dyn.owners)) {
                    const n = normalizePhone(dyn.owners[key]?.phone || key);
                    if (!n || HARD_BLOCKED_SUDO.includes(n)) {
                        delete dyn.owners[key];
                        changed = true;
                    }
                }
                if (changed) writeAtomic(DYNAMIC_OWNERS_FILE, dyn);
            }
        }
    } catch {}

    // ৪. data/ownerIdentity.json রুট-বাইন্ডিং যাচাই (পুরোনো ফেক LID দূষণ রোধ)
    try {
        const idPath = path.join(dataDir, 'ownerIdentity.json');
        if (fs.existsSync(idPath)) {
            const idData = JSON.parse(fs.readFileSync(idPath, 'utf8'));
            if (idData?.rootOwner !== ROOT_SUPER_OWNER) {
                writeAtomic(idPath, { rootOwner: ROOT_SUPER_OWNER, ownerLids: [ROOT_SUPER_OWNER_LID].filter(Boolean) });
            }
        }
    } catch {}
}

sanitizeAdminFilesOnce();

function readDynamicOwnersCached() {
    const now = Date.now();
    if (now - dynCacheLastStatAt < 2000) return dynCacheState;
    dynCacheLastStatAt = now;

    try {
        const st = fs.statSync(DYNAMIC_OWNERS_FILE);
        if (st.mtimeMs !== dynCacheMtime) {
            const parsed = JSON.parse(fs.readFileSync(DYNAMIC_OWNERS_FILE, 'utf8'));
            dynCacheMtime = st.mtimeMs;
            dynCacheState = {
                lockdown: Boolean(parsed?.lockdown),
                owners: (parsed?.owners && typeof parsed.owners === 'object') ? parsed.owners : Object.create(null)
            };
        }
    } catch {
        dynCacheMtime = -1;
        dynCacheState = { lockdown: false, owners: Object.create(null) };
    }
    return dynCacheState;
}

const extraOwnerLids = envStr('EXTRA_OWNER_LIDS', '')
    .split(/[\s,;]+/)
    .map(normalizeLid)
    .filter(Boolean);

const STATIC_SUPER_OWNERS = Object.freeze([ROOT_SUPER_OWNER]);
const STATIC_OWNER_LIDS = [...new Set([ROOT_SUPER_OWNER_LID, ...extraOwnerLids].filter(Boolean))];
const OWN_BOT_NUMBERS = [...new Set([
    ...envList('OWN_BOT_NUMBERS', []).map(normalizePhone)
].filter((n) => n && n !== ROOT_SUPER_OWNER))];

// ==================================================
// ৫. মাস্টার কনফিগারেশন অবজেক্ট (Mahiru v1.0 ULTIMATE)
// ==================================================
const settings = {
    // --- ব্র্যান্ড ও ওনার পরিচিতি ---
    packname: 'Mahiru',
    author: 'MSK',
    botName: 'Mahiru Shiina',
    assistantName: 'মাহিরু',
    botOwner: 'MSK',
    ownerDisplayName: 'MSK',
    ownerUsername: envStr('OWNER_USERNAME', 'MSKBro0'),
    rootSuperOwner: ROOT_SUPER_OWNER,
    ownerNumber: ROOT_SUPER_OWNER,
    ownerLid: ROOT_SUPER_OWNER_LID,
    superOwnerNumbers: [...STATIC_SUPER_OWNERS],
    ownerNumbers: [...STATIC_SUPER_OWNERS],
    ownerLids: [...STATIC_OWNER_LIDS],
    ownBotNumbers: [...OWN_BOT_NUMBERS],
    ownerWebsite: envStr('OWNER_WEBSITE', 'https://mahiru-shiina-ai.vercel.app'),
    ownerChannelJid: envStr('OWNER_CHANNEL_JID', ''),
    ownerChannelName: envStr('OWNER_CHANNEL_NAME', 'Mahiru Shiina Official'),
    bannerImagePath: envStr('BANNER_IMAGE_PATH', './assets/banner.png'),
    fallbackBannerPath: './assets/banner.jpg',
    bannerImageUrl: envStr('BANNER_IMAGE_URL', ''),

    // --- কোর বট সেটিংস (২৫৬MB ক্লাউড অপটিমাইজড) ---
    prefix: envStr('BOT_PREFIX', '.'),
    timezone: envStr('BOT_TIMEZONE', 'Asia/Dhaka'),
    commandMode: envStr('COMMAND_MODE', 'public'),
    maxStoreMessages: envNum('MAX_STORE_MESSAGES', 20, { min: 5, max: 40 }),
    storeWriteInterval: envNum('STORE_WRITE_INTERVAL', 10000, { min: 10000, max: 120000 }),
    description: 'Mahiru Shiina • Mahiru v1.0 ULTIMATE — Autonomous WhatsApp AI Assistant, Interactive UI & Security Engine.',
    version: '3.0.8',
    ownerInboxNumber: '',
    legacyVersion: '1.0.0',
    ramProfile: RAM_PROFILE_RAW,

    // --- স্মার্ট পেয়ারিং কনফিগারেশন (লগইন নম্বর হার্ডকোড নয়) ---
    pairing: {
        promptTimeoutSec: envNum('PAIRING_PROMPT_SEC', 55, { min: 30, max: 60 }),
        codeValidWindowSec: envNum('PAIRING_WINDOW_SEC', 180, { min: 120, max: 300 }), // ৩ মিনিট
        defaultFallbackNumber: ROOT_SUPER_OWNER
    },

    // --- মিডিয়া ও স্টিকার API ---
    giphyApiKey: envStr('GIPHY_API_KEY', 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq'),
    knightApiUrl: envStr('KNIGHT_API_URL', 'https://Mahiru Shiinaapi.stream'),
    knightApiKey: envStr('KNIGHT_API_KEY', 'knight'),
    mediaApiUrl: envStr('MEDIA_API_URL', 'https://Mahiru Shiinaapi.stream'),
    mediaApiKey: envStr('MEDIA_API_KEY', 'knight'),
    princeApiUrl: envStr('PRINCE_API_URL', 'https://api.princetechn.com'),
    princeApiKey: envStr('PRINCE_API_KEY', 'prince'),
    vidFetchApiKey: envStr('VIDFETCH_API_KEY', 'vf_live_sk_4cfc16047ffb3ccb87ee93daf5d36999f99da9c53d013246'),

    // --- মাহিরু v1.0 ULTIMATE মডিউল কনফিগারেশন ---
    maya: {
        // ১. সিস্টেম অপটিমাইজার ও ডিপ ক্লিনার (২৫৬MB OOM-সেফ)
        optimizer: {
            sessionDir: './session',
            keepPreKeys: envNum('KEEP_PRE_KEYS', 30, { min: 15, max: 80 }),
            keepSessions: envNum('KEEP_SESSIONS', 60, { min: 25, max: 180 }),
            keepSenderKeys: envNum('KEEP_SENDER_KEYS', 40, { min: 20, max: 120 }),
            maxSessionFiles: envNum('MAX_SESSION_FILES', 280, { min: 100, max: 1000 }),
            autoCleanIntervalMs: envNum('AUTO_CLEAN_MIN', 40, { min: 15, max: 360 }) * 60 * 1000,
            ramSoftLimitMb: envNum('RAM_SOFT_LIMIT_MB', DEFAULT_RAM_SOFT_MB, { min: 140, max: 512 }),
            ramCriticalLimitMb: envNum('RAM_CRITICAL_LIMIT_MB', DEFAULT_RAM_CRIT_MB, { min: 180, max: 768 }),
            ramWatchdogCooldownMs: envNum('RAM_WATCHDOG_COOLDOWN_SEC', 300, { min: 60, max: 1800 }) * 1000
        },

        // ২. মাস্টার গ্রুপ কিল-সুইচ কন্ট্রোল (.g / .group)
        groupControl: {
            defaultMode: envStr('DEFAULT_GROUP_MODE', 'cmd'), // 'off' | 'cmd' | 'chat'
            killSwitchEnabled: true
        },

        // ৩. চ্যাট কিউ ও অ্যান্টি-স্প্যাম
        queue: {
            coalesceEnabled: envBool('COALESCE_ENABLED', true),
            coalesceWindowMs: envNum('COALESCE_WINDOW_MS', 1800, { min: 500, max: 6000 }),
            coalesceMaxWaitMs: envNum('COALESCE_MAX_WAIT_MS', 5000, { min: 1500, max: 15000 }),
            taskTimeoutMs: envNum('QUEUE_TASK_TIMEOUT_MS', 65000, { min: 15000, max: 120000 }),
            rateLimitEnabled: envBool('RATE_LIMIT_ENABLED', true),
            maxMessagesPerMinPrivate: envNum('RATE_LIMIT_PRIVATE', 14, { min: 3, max: 60 }),
            maxMessagesPerMinGroup: envNum('RATE_LIMIT_GROUP', 8, { min: 2, max: 40 }),
            humanPresenceEnabled: envBool('HUMAN_PRESENCE_ENABLED', true)
        },

        // ৪. টেক্সট স্যানিটাইজার ও ডেইলি ১-লিংক ফায়ারওয়াল
        sanitizer: {
            linkCooldownMs: envNum('LINK_COOLDOWN_MIN', 1440, { min: 60, max: 10080 }) * 60 * 1000,
            portfolioLinkDailyLimitPerChat: envNum('PORTFOLIO_LINK_DAILY_LIMIT', 1, { min: 0, max: 5 }),
            portfolioLinkAllowInGroups: envBool('PORTFOLIO_LINK_IN_GROUPS', false),
            portfolioLinkRelevantIntentsOnly: envBool('PORTFOLIO_LINK_RELEVANT_ONLY', true),
            safePlaceholderProtection: true,
            maxWhatsAppChars: envNum('MAX_WA_CHARS', 3500, { min: 500, max: 4096 }),
            defaultTtsMaxChars: envNum('MAX_TTS_CHARS', 280, { min: 80, max: 600 }),
            generateHighQualityLinkPreview: false
        },

        // ৫. ভাষা ও বাংলিশ এনফোর্সার
        lang: {
            defaultMode: envStr('DEFAULT_LANG_MODE', 'bn_only'),
            defaultStyle: envStr('DEFAULT_STYLE', 'tumi'),
            allowTuiAuto: envBool('ALLOW_TUI_AUTO', false),
            protectSystemTokens: true
        },

        // ৬. ক্রিস্টাল-ক্লিয়ার ন্যাচারাল ভয়েস v1.0 (neuralVoice ও voiceEngine-এর সাথে ১০০% সিঙ্কড)
        voice: {
            defaultGlobalMode: envStr('DEFAULT_VOICE_MODE', 'auto'),
            defaultVoiceName: envStr('DEFAULT_VOICE_NAME', 'Aoede'),
            ttsModel: envStr('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts'),
            ttsTimeoutMs: envNum('TTS_TIMEOUT_MS', 14000, { min: 5000, max: 30000 }),
            sttTimeoutMs: envNum('STT_TIMEOUT_MS', 14000, { min: 5000, max: 30000 }),
            minVoiceDurationSec: envNum('MIN_VOICE_SEC', 0.75, { min: 0.3, max: 5 }),
            silencePeakDbThreshold: envNum('SILENCE_DB_THRESHOLD', -48, { min: -70, max: -20 }),
            maxTtsChars: envNum('MAX_TTS_CHARS', 280, { min: 80, max: 600 }),
            fallbackOrder: ['cloned', 'gemini', 'edge-neural', 'backup-ai'],
            edgeVoiceBn: envStr('EDGE_VOICE_BN', 'bn-BD-NabanitaNeural'),
            edgeVoiceEn: envStr('EDGE_VOICE_EN', 'en-US-AvaNeural'),
            naturalPauseMs: envNum('VOICE_NATURAL_PAUSE_MS', 180, { min: 80, max: 500 }),
            stripEmojisAndLinks: true,
            edgeProsody: {
                calm: { rate: '0%', pitch: '0Hz' },
                helpful: { rate: '0%', pitch: '0Hz' },
                professional: { rate: '0%', pitch: '0Hz' },
                happy: { rate: '+2%', pitch: '+1Hz' },
                playful_casual: { rate: '+2%', pitch: '+1Hz' },
                affectionate: { rate: '-2%', pitch: '0Hz' },
                sad: { rate: '-3%', pitch: '0Hz' },
                empathetic_sad: { rate: '-3%', pitch: '0Hz' },
                apologetic: { rate: '-2%', pitch: '0Hz' },
                stern: { rate: '-1%', pitch: '0Hz' }
            },
            studioMaster: {
                enabled: envBool('VOICE_STUDIO_MASTER', true),
                disablePitchShift: true,
                highpassHz: 75,
                lowpassHz: 11800,
                opusBitrate: '64k',
                sampleRate: 48000
            }
        },

        // ৭. আল্টিমেট ইন্টারঅ্যাক্টিভ বাটন, লোকেশন ব্যানার ও মেনু UI
        ui: {
            enableInteractiveButtons: envBool('ENABLE_INTERACTIVE_BUTTONS', true),
            buttonFallbackToText: true,
            menuStyle: envStr('MENU_STYLE', 'ultra_framed'),
            footerText: envStr('UI_FOOTER_TEXT', 'Powered By ᴘʀɪᴍᴇ ᴍᴏɴɪʀ • মাহিরু v1.0'),
            runtimeLabel: envStr('RUNTIME_LABEL', 'PRIME CLOUD'),
            useLocationBannerTrick: true,
            useVerifiedQuote: true,
            enableLiveEdit: true,
            groupAntiLinkShield: envBool('GROUP_ANTILINK_SHIELD', true),
            showViewChannelButton: envBool('SHOW_VIEW_CHANNEL_BTN', true)
        },

        // ৮. স্ট্রিক্ট সিকিউরিটি ফায়ারওয়াল ও রুট সুপার-ওনার লক
        security: {
            rootSuperOwner: ROOT_SUPER_OWNER,
            strictOwnerOnly: envBool('STRICT_OWNER_ONLY', false),
            strictOwnerChatbotLock: envBool('STRICT_OWNER_CHATBOT_LOCK', true),
            allowGroupAdminChatbotToggle: envBool('ALLOW_GROUP_ADMIN_CHATBOT', false),
            alertOwnerOnUnauthorizedCommand: envBool('ALERT_UNAUTHORIZED_CMD', true),
            botToBotFirewall: envBool('BOT_TO_BOT_FIREWALL', true),
            hardBlockedSudoNumbers: [...HARD_BLOCKED_SUDO],
            ownBotNumbers: [...OWN_BOT_NUMBERS]
        },

        // ৯. ৬০+ স্মার্ট নন-রিপিটিং ইমোজি ও রিঅ্যাকশন ইঞ্জিন
        emoji: {
            disableTrailingSignatureEmoji: true,
            antiRepeatWindow: envNum('EMOJI_ANTI_REPEAT_WINDOW', 18, { min: 5, max: 40 }),
            useContextPool: true,
            reactOnCommands: true,
            reactOnChat: envBool('SMART_REACTIONS_ENABLED', true)
        },

        // ১০. পার্সোনা লক ও প্রেজেন্স/সিন-অ্যাওয়্যার স্মার্ট টেকওভার
        persona: {
            identityLock: true,
            allowFakeCallPromises: false,
            forwardCallRequestsToOwner: true,
            liveDhakaTimeContext: true,
            humanTakeoverPauseMin: envNum('HUMAN_TAKEOVER_PAUSE_MIN', 2, { min: 1, max: 60 })
        },

        takeover: {
            enabled: envBool('SMART_TAKEOVER_ENABLED', true),
            defaultWaitMin: envNum('TAKEOVER_WAIT_MIN', 2, { min: 1, max: 30 }),
            activeWindowMin: envNum('TAKEOVER_ACTIVE_WINDOW_MIN', 10, { min: 2, max: 60 }),
            presenceAware: true,
            seenAware: true
        },

        // ১১. ইন্টেন্ট রাউটার ও ডকুমেন্ট রিডার
        intent: {
            maxDocumentBytes: envNum('MAX_DOC_MB', 3, { min: 1, max: 6 }) * 1024 * 1024,
            maxExtractedChars: envNum('MAX_DOC_CHARS', 6000, { min: 1000, max: 15000 }),
            enableSmartReactions: envBool('SMART_REACTIONS_ENABLED', true)
        },

        // ১২. ডুয়াল-জেমিনি (AIza + AQ.) + ইমার্জেন্সি Backup AI
        ai: {
            defaultPrimary: envStr('PRIMARY_AI_PROVIDER', 'auto'),
            attemptTimeoutMs: envNum('AI_ATTEMPT_TIMEOUT_MS', 15000, { min: 5000, max: 35000 }),
            openRouterTimeoutMs: envNum('OR_ATTEMPT_TIMEOUT_MS', 11000, { min: 4000, max: 25000 }),
            totalBudgetMs: envNum('AI_TOTAL_BUDGET_MS', 30000, { min: 10000, max: 60000 }),
            baseCooldown429Ms: envNum('AI_429_COOLDOWN_SEC', 75, { min: 15, max: 600 }) * 1000,
            vertexExpressBaseUrl: envStr('VERTEX_EXPRESS_URL', 'https://aiplatform.googleapis.com/v1/publishers/google/models')
        },

        backupAI: {
            enabled: envBool('BACKUP_AI_ENABLED', true),
            apiUrl: envStr('BACKUP_AI_URL', envStr('MAHIRU_AI_API_URL', 'https://mahiru-shiina-ai.vercel.app')),
            timeoutMs: envNum('BACKUP_AI_TIMEOUT_MS', 20000, { min: 5000, max: 35000 }),
            maxImageBytes: 3 * 1024 * 1024
        },

        // ১৩. ৩-স্তরের মেমোরি ইঞ্জিন (২৫৬MB টাইট বাউন্ড)
        memory: {
            maxTurnsStoredPerChat: envNum('MAX_MEMORY_TURNS', 14, { min: 4, max: 24 }),
            defaultPromptTurns: envNum('PROMPT_HISTORY_TURNS', 6, { min: 2, max: 12 }),
            summarizeThreshold: envNum('SUMMARIZE_THRESHOLD', 12, { min: 6, max: 20 }),
            maxProfilesLimit: envNum('MAX_PROFILES', 350, { min: 50, max: 1500 })
        },

        // ১৪. মিনি-RAG নলেজ ও স্মার্ট লিড হ্যান্ডঅফ
        knowledge: {
            maxRetrievedChunks: envNum('RAG_MAX_CHUNKS', 3, { min: 1, max: 6 }),
            leadAlertCooldownMs: envNum('LEAD_ALERT_COOLDOWN_MIN', 30, { min: 5, max: 240 }) * 60 * 1000,
            handoffPauseMinutes: envNum('HANDOFF_PAUSE_MIN', 25, { min: 5, max: 180 }),
            ownerNotifyEnabled: envBool('OWNER_LEAD_NOTIFY', true),
            ignoreLeadNumbers: [...HARD_BLOCKED_SUDO, ...OWN_BOT_NUMBERS, ROOT_SUPER_OWNER]
        },

        // ১৫. ভয়েস ও ন্যাচারাল ওনার এজেন্ট
        ownerAgent: {
            schedulerPollMs: envNum('OWNER_SCHEDULER_POLL_MS', 15000, { min: 5000, max: 60000 }),
            disambiguationTtlMs: 3 * 60 * 1000,
            maxActionsPerCommand: 4
        }
    },

    // ==================================================
    // ৬. গ্লোবাল সিকিউরিটি ও হেল্পার ফাংশনসমূহ
    // ==================================================
    normalizePhone,
    normalizeLid,
    classifyGeminiKey,

    getOwnerJid() {
        return `${ROOT_SUPER_OWNER}@s.whatsapp.net`;
    },

    isRootSuperOwner(jid = '', lid = '') {
        const checkOne = (val) => {
            const raw = String(val || '').trim().toLowerCase();
            if (!raw || raw.endsWith('@g.us') || raw === 'status@broadcast') return false;
            if (raw.includes('@lid')) return normalizeLid(raw) === ROOT_SUPER_OWNER_LID;
            return normalizePhone(raw) === ROOT_SUPER_OWNER;
        };
        return checkOne(jid) || checkOne(lid);
    },

    isBlockedSudoJid(jid = '', lid = '') {
        if (this.isRootSuperOwner(jid, lid)) return false;
        const blocked = this.maya?.security?.hardBlockedSudoNumbers || HARD_BLOCKED_SUDO;
        if (!blocked.length) return false;
        const checkOne = (val) => {
            const norm = normalizePhone(val);
            return Boolean(norm && blocked.includes(norm));
        };
        return checkOne(jid) || checkOne(lid);
    },

    isOwnBotJid(jid = '') {
        const norm = normalizePhone(jid);
        if (!norm || norm === ROOT_SUPER_OWNER) return false;
        return this.ownBotNumbers.includes(norm) || HARD_BLOCKED_SUDO.includes(norm);
    },

    isSuperOwnerJid(jid = '', lid = '') {
        if (this.isRootSuperOwner(jid, lid)) return true;
        if (this.isBlockedSudoJid(jid, lid)) return false;

        const checkOne = (val) => {
            const raw = String(val || '').trim().toLowerCase();
            if (!raw || raw.endsWith('@g.us') || raw === 'status@broadcast') return false;
            if (raw.includes('@lid')) {
                const targetLid = normalizeLid(raw);
                return Boolean(targetLid && this.ownerLids.includes(targetLid));
            }
            const norm = normalizePhone(raw);
            return Boolean(norm && this.superOwnerNumbers.includes(norm));
        };
        return checkOne(jid) || checkOne(lid);
    },

    isOwnerJid(jid = '', lid = '') {
        if (this.isRootSuperOwner(jid, lid)) return true;
        if (this.isBlockedSudoJid(jid, lid)) return false;
        if (this.isSuperOwnerJid(jid, lid)) return true;
        if (this.maya?.security?.strictOwnerOnly) return false;

        if (typeof global.__PRIME_IS_DYNAMIC_OWNER__ === 'function') {
            try { if (global.__PRIME_IS_DYNAMIC_OWNER__(jid, lid, null)) return true; } catch {}
        }

        const dyn = readDynamicOwnersCached();
        if (dyn.lockdown) return false;
        const entries = Object.values(dyn.owners || {});
        if (!entries.length) return false;

        const now = Date.now();
        const checkDyn = (val) => {
            const raw = String(val || '').trim().toLowerCase();
            if (!raw || raw.endsWith('@g.us') || raw === 'status@broadcast') return false;
            if (raw.includes('@lid')) {
                const targetLid = normalizeLid(raw);
                return Boolean(targetLid && entries.some((e) =>
                    (!e.expiresAt || now < e.expiresAt) &&
                    e.lid &&
                    normalizeLid(e.lid) === targetLid &&
                    !this.isBlockedSudoJid(e.phone || '', e.lid || '')
                ));
            }
            const norm = normalizePhone(raw);
            if (!norm || this.isBlockedSudoJid(norm)) return false;
            const entry = dyn.owners[norm] || entries.find((e) => e.phone && normalizePhone(e.phone) === norm);
            return Boolean(entry && (!entry.expiresAt || now < entry.expiresAt));
        };

        return checkDyn(jid) || checkDyn(lid);
    },

    getAllOwnerNumbers() {
        const dyn = readDynamicOwnersCached();
        const now = Date.now();
        const activeDyn = (dyn.lockdown || this.maya?.security?.strictOwnerOnly)
            ? []
            : Object.values(dyn.owners || {})
                .filter((e) => e?.phone && (!e.expiresAt || now < e.expiresAt))
                .map((e) => normalizePhone(e.phone))
                .filter((n) => n && !this.isBlockedSudoJid(n));
        return [...new Set([ROOT_SUPER_OWNER, ...this.superOwnerNumbers, ...activeDyn])];
    },

    getAIKeys(forceRefresh = false) {
        if (!cachedAIKeys || forceRefresh) return buildAIKeysSnapshot();
        return cachedAIKeys;
    },

    reloadEnv() {
        loadDotEnv(true);
        warnedBadKeys.clear();
        dynCacheMtime = -1;
        return buildAIKeysSnapshot();
    }
};

// রুট সুপার-ওনার প্রোপার্টিগুলো রানটাইমে অটুটভাবে লক করা (কেউ ওভাররাইট করতে পারবে না)
Object.defineProperties(settings, {
    rootSuperOwner: { value: ROOT_SUPER_OWNER, writable: false, configurable: false, enumerable: true },
    ownerNumber: { value: ROOT_SUPER_OWNER, writable: false, configurable: false, enumerable: true },
    superOwnerNumbers: { value: Object.freeze([ROOT_SUPER_OWNER]), writable: false, configurable: false, enumerable: true }
});

module.exports = settings;
