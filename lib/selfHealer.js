/**
 * Mahiru Shiina • Mahiru v3.0 ULTRA — Autonomous SRE SelfHealer (v3.5 • 256MB-356MB RAM Edition)
 * Features:
 *  - Dynamic Anti-Thrash RAM Governor (100% synced with settings.js & systemOptimizer — zero limit clash)
 *  - Stat-Cached Atomic JSON Integrity Guardian (zero redundant reads/writes on unchanged files)
 *  - Registered-Only Dual creds.json Shadow Vault (logout-proof & 401-loop-proof)
 *  - Zero-Duplicate Outbox Retry Queue with 12s Send Timeout
 *  - LID-Safe Bad MAC / Signal Decrypt Surgeon + Bounded Console Noise Shield
 *  - Low-RAM Gzip Level-6 Auto-Backup + Super-Owner Locked One-Click Restore (with Auto Cache Flush)
 *  - 10-Point Ultra System Doctor (.heal doctor / .doc) + Interactive Quick-Action Buttons
 * 100% Backward-Compatible Exports & Dual (4-arg / 5-arg) Command Handler
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const v8 = require('v8');
const crypto = require('crypto');
const { monitorEventLoopDelay } = require('perf_hooks');

let settings = {};
try { settings = require('../settings'); } catch {}

const isOwnerOrSudo = (() => {
    try { return require('./isOwner'); } catch { return async () => false; }
})();

const buttonEngine = (() => {
    try { return require('./buttonEngine'); } catch { return null; }
})();

const userGroupLib = (() => {
    try { return require('./index'); } catch { return null; }
})();

const {
    BOT_NAME,
    BOT_VERSION,
    OWNER_NAME,
    loadJson,
    saveJson,
    scheduleSaveJson,
    flushAllPendingSaves,
    markOutgoingBotPayload,
    trackBotMessage,
    safeSend,
    getOwnerJid,
    isOwnerMessage,
    getDhakaTimeInfo,
    sendOwnerAlert
} = require('./mahiruCore');

let systemControl = {};
try { systemControl = require('./systemControl'); } catch {}

let systemOptimizerMod = null;
let memoryEngineMod = null;
let aiOrchestratorMod = null;
let voiceEngineMod = null;
let persistentDataMod = null;

try { systemOptimizerMod = require('./systemOptimizer'); } catch {}
try { memoryEngineMod = require('./memoryEngine'); } catch {}
try { aiOrchestratorMod = require('./aiOrchestrator'); } catch {}
try { voiceEngineMod = require('./voiceEngine'); } catch {}
try { persistentDataMod = require('./persistent_data'); } catch {}

// ==================================================
// ১. ডায়নামিক RAM-অ্যাডাপ্টিভ SRE কনফিগারেশন ও পাথ
// ==================================================
const DATA_DIR = path.join(process.cwd(), 'data');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const VOICE_CACHE_DIR = path.join(DATA_DIR, 'voice_cache');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const HEALER_STATE_FILE = path.join(DATA_DIR, 'mahiru_healer_state.json');
const OUTBOX_FILE = path.join(DATA_DIR, 'mahiru_outbox_queue.json');

function getRamThresholds() {
    const opt = settings.mahiru?.optimizer || {};
    const warnMb = Number(process.env.HEALER_RAM_WARN_MB || opt.ramSoftLimitMb || 235);
    const critMb = Math.max(warnMb + 35, Number(process.env.HEALER_RAM_CRIT_MB || opt.ramCriticalLimitMb || 295));
    const fatalMb = Math.max(critMb + 35, Number(process.env.HEALER_RAM_FATAL_MB || 335));
    return { warnMb, critMb, fatalMb };
}

const DISK_QUOTA_MB = Number(process.env.HEALER_DISK_QUOTA_MB || 85);
const SESSION_BLOAT_WARN = 450;

const AUTH_DIR_CANDIDATES = ['session', 'sessions', 'auth_info_baileys', 'baileys_auth_info', 'auth', 'auth_info'];
const MAX_LOCAL_BACKUPS = 4;
const MAX_HEAL_LOGS = 40;
const MAX_OUTBOX_ITEMS = 25;
const OUTBOX_TTL_MS = 5 * 60 * 1000;
const OUTBOX_SEND_TIMEOUT_MS = 12 * 1000;
const BAD_MAC_THRESHOLD = 2;
const BAD_MAC_WINDOW_MS = 90 * 1000;
const SESSION_HEAL_COOLDOWN_MS = 5 * 60 * 1000;
const OOM_RESTART_COOLDOWN_MS = 3 * 60 * 1000;
const WARN_CLEAN_COOLDOWN_MS = 5 * 60 * 1000;
const CRIT_CLEAN_COOLDOWN_MS = 90 * 1000;
const MAX_SNAPSHOT_JSON_BYTES = 1.5 * 1024 * 1024;
const MAX_INTERNAL_MAP_SIZE = 80;
const DISK_CACHE_TTL_MS = 15 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ==================================================
// ২. ইন্টারনাল স্টেট, রোলিং মেট্রিক্স ও বাউন্ডেড ক্যাশ
// ==================================================
const savedState = loadJson(HEALER_STATE_FILE, {});
const healerState = {
    startedAt: Date.now(),
    healedBadMacs: Number(savedState?.healedBadMacs || 0),
    shieldedCrashes: Number(savedState?.shieldedCrashes || 0),
    repairedJsonFiles: Number(savedState?.repairedJsonFiles || 0),
    repairedCreds: Number(savedState?.repairedCreds || 0),
    ramCleanups: Number(savedState?.ramCleanups || 0),
    diskCleanups: Number(savedState?.diskCleanups || 0),
    outboxRecovered: Number(savedState?.outboxRecovered || 0),
    suppressedSpamLogs: 0,
    backupsDone: Number(savedState?.backupsDone || 0),
    lastBackupDate: savedState?.lastBackupDate || '',
    lastBackupAt: Number(savedState?.lastBackupAt || 0),
    lastOomRestartAt: Number(savedState?.lastOomRestartAt || 0),
    peakRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    lastActivityAt: Date.now(),
    disconnectTimestamps: [],
    recentActions: Array.isArray(savedState?.recentActions) ? savedState.recentActions.slice(-MAX_HEAL_LOGS) : []
};

let pendingOutbox = loadJson(OUTBOX_FILE, []);
if (!Array.isArray(pendingOutbox)) pendingOutbox = [];
pendingOutbox = pendingOutbox.filter((x) => x && x.chatId && x.payload && (Date.now() - (x.queuedAt || 0) < OUTBOX_TTL_MS));

const rssSamples = [];
const snapshotStatCache = new Map(); // filename -> "mtimeMs:size:md5"
const badMacHits = new Map();
const sessionHealCooldown = new Map();
const spamLogLimiter = new Map();
const alertLimiter = new Map();

let cachedDiskTelemetry = { ts: 0, diskMb: 0, sessionFiles: 0, authDirName: 'Not Found' };
let initialized = false;
let isExiting = false;
let isFlushingOutbox = false;
let lastWarnCleanAt = 0;
let lastCritCleanAt = 0;
let lastCredsSig = '';
let sockGetterFn = null;
let reconnectCallbackFn = null;
let ramTimer = null;
let integrityTimer = null;
let heartbeatTimer = null;
let backupTimer = null;
let loopMonitor = null;
let origConsoleError = null;
let origConsoleWarn = null;
let origConsoleLog = null;
let origConsoleInfo = null;

function md5(str = '') {
    return crypto.createHash('md5').update(String(str)).digest('hex');
}

function setBoundedMap(map, key, value, maxSize = MAX_INTERNAL_MAP_SIZE) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    if (map.size > maxSize) map.delete(map.keys().next().value);
}

function atomicWriteText(filePath, content) {
    let tmp = '';
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, filePath);
        return true;
    } catch (err) {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        throw err;
    }
}

function safeRunCleanup(maxAgeMin = 0) {
    try {
        if (typeof systemControl?.runSafeCleanup === 'function') {
            return systemControl.runSafeCleanup(maxAgeMin);
        }
    } catch {}
    return { removedCount: 0, freedKb: 0 };
}

function safeGetRemoteUrl() {
    try {
        if (typeof systemControl?.getRemoteStorageUrl === 'function') {
            return (systemControl.getRemoteStorageUrl() || '').trim();
        }
    } catch {}
    return '';
}

function persistState(immediate = false) {
    const snapshot = {
        healedBadMacs: healerState.healedBadMacs,
        shieldedCrashes: healerState.shieldedCrashes,
        repairedJsonFiles: healerState.repairedJsonFiles,
        repairedCreds: healerState.repairedCreds,
        ramCleanups: healerState.ramCleanups,
        diskCleanups: healerState.diskCleanups,
        outboxRecovered: healerState.outboxRecovered,
        backupsDone: healerState.backupsDone,
        lastBackupDate: healerState.lastBackupDate,
        lastBackupAt: healerState.lastBackupAt,
        lastOomRestartAt: healerState.lastOomRestartAt,
        recentActions: healerState.recentActions.slice(-MAX_HEAL_LOGS)
    };
    if (immediate || typeof scheduleSaveJson !== 'function') {
        saveJson(HEALER_STATE_FILE, snapshot);
    } else {
        scheduleSaveJson(HEALER_STATE_FILE, snapshot, 3500);
    }
}

function persistOutbox() {
    saveJson(OUTBOX_FILE, pendingOutbox.slice(-MAX_OUTBOX_ITEMS));
}

function logHealAction(category, detail, immediateSave = false) {
    const entry = {
        cat: category,
        detail: String(detail || '').slice(0, 140),
        time: new Date().toLocaleTimeString('bn-BD', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: true }),
        ts: Date.now()
    };
    healerState.recentActions.push(entry);
    if (healerState.recentActions.length > MAX_HEAL_LOGS) {
        healerState.recentActions = healerState.recentActions.slice(-MAX_HEAL_LOGS);
    }
    persistState(immediateSave);
    const out = origConsoleLog || console.log;
    out(`🩺 [SelfHealer:${category}] ${entry.detail}`);
}

function getSock() {
    try {
        return typeof sockGetterFn === 'function' ? sockGetterFn() : sockGetterFn;
    } catch {
        return null;
    }
}

async function throttledOwnerAlert(key, title, body, minGapMs = 20 * 60 * 1000) {
    const now = Date.now();
    if (now - (alertLimiter.get(key) || 0) < minGapMs) return;
    setBoundedMap(alertLimiter, key, now);
    const sock = getSock();
    if (sock && sock.user) {
        await sendOwnerAlert(sock, title, body).catch(() => {});
    }
}

function pruneInternalMaps() {
    const now = Date.now();
    for (const [k, list] of badMacHits.entries()) {
        const fresh = list.filter((ts) => now - ts < BAD_MAC_WINDOW_MS);
        if (fresh.length) badMacHits.set(k, fresh);
        else badMacHits.delete(k);
    }
    for (const [k, until] of sessionHealCooldown.entries()) {
        if (now >= until) sessionHealCooldown.delete(k);
    }
    for (const [k, ts] of spamLogLimiter.entries()) {
        if (now - ts > 60 * 60 * 1000) spamLogLimiter.delete(k);
    }
    for (const [k, ts] of alertLimiter.entries()) {
        if (now - ts > 60 * 60 * 1000) alertLimiter.delete(k);
    }
    if (snapshotStatCache.size > MAX_INTERNAL_MAP_SIZE) snapshotStatCache.clear();

    const beforeOut = pendingOutbox.length;
    pendingOutbox = pendingOutbox.filter((x) => x && (now - (x.queuedAt || 0) < OUTBOX_TTL_MS));
    if (pendingOutbox.length !== beforeOut) persistOutbox();
}

function getDirSizeBytes(dirPath, depth = 0, maxDepth = 4) {
    if (depth > maxDepth || !dirPath || !fs.existsSync(dirPath)) return 0;
    let bytes = 0;
    try {
        for (const name of fs.readdirSync(dirPath)) {
            const full = path.join(dirPath, name);
            try {
                const st = fs.lstatSync(full);
                if (st.isSymbolicLink()) continue;
                if (st.isFile()) bytes += st.size;
                else if (st.isDirectory()) bytes += getDirSizeBytes(full, depth + 1, maxDepth);
            } catch {}
        }
    } catch {}
    return bytes;
}

function getDirSizeMb(dirPath) {
    return Number((getDirSizeBytes(dirPath) / (1024 * 1024)).toFixed(2));
}

function getCachedDiskTelemetry(force = false) {
    const now = Date.now();
    if (!force && cachedDiskTelemetry.ts && (now - cachedDiskTelemetry.ts) < DISK_CACHE_TTL_MS) {
        return cachedDiskTelemetry;
    }
    const authDir = detectAuthDir();
    let sessionFiles = 0;
    try { if (authDir) sessionFiles = fs.readdirSync(authDir).length; } catch {}

    const diskMb = Number((
        getDirSizeMb(DATA_DIR) +
        getDirSizeMb(TEMP_DIR) +
        (authDir ? getDirSizeMb(authDir) : 0)
    ).toFixed(1));

    cachedDiskTelemetry = {
        ts: now,
        diskMb,
        sessionFiles,
        authDirName: authDir ? path.basename(authDir) : 'Not Found'
    };
    return cachedDiskTelemetry;
}

// ==================================================
// ৩. জিরো-ডুপ্লিকেট আউটবক্স রিট্রাই কিউ (৪২৮ / Connection Closed ফিক্স)
// ==================================================
function enqueueFailedSend(chatId, payload, opts = {}) {
    if (!chatId || !payload) return false;
    if (!payload.text || payload.audio || payload.image || payload.video || payload.document) return false;

    const now = Date.now();
    const sig = `${chatId}:${String(payload.text).slice(0, 60)}`;
    if (pendingOutbox.some((x) => x.sig === sig && (now - x.queuedAt < 60 * 1000))) return false;

    pendingOutbox.push({
        id: Math.random().toString(36).slice(2, 7).toUpperCase(),
        sig,
        chatId,
        payload: {
            text: payload.text,
            ...(payload.contextInfo ? { contextInfo: payload.contextInfo } : {})
        },
        retries: 0,
        queuedAt: now
    });

    if (pendingOutbox.length > MAX_OUTBOX_ITEMS) {
        pendingOutbox = pendingOutbox.slice(-MAX_OUTBOX_ITEMS);
    }
    persistOutbox();
    logHealAction('OUTBOX', `ডিসকানেক্টে আটকে যাওয়া মেসেজ কিউ হয়েছে (${pendingOutbox.length}টি পেন্ডিং)`);
    return true;
}

function sendOutboxDirectWithTimeout(sock, chatId, payload) {
    let timer = null;
    markOutgoingBotPayload(chatId, payload?.text || '');
    const p = sock.sendMessage(chatId, payload);
    const t = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('outbox_send_timeout')), OUTBOX_SEND_TIMEOUT_MS);
        if (timer.unref) timer.unref();
    });
    return Promise.race([p, t]).finally(() => { if (timer) clearTimeout(timer); });
}

async function flushPendingOutbox() {
    if (isFlushingOutbox || !pendingOutbox.length) return 0;
    const sock = getSock();
    if (!sock || !sock.user || (sock.ws && sock.ws.readyState !== 1)) return 0;

    isFlushingOutbox = true;
    let delivered = 0;
    const now = Date.now();

    try {
        const batch = pendingOutbox.splice(0, pendingOutbox.length);
        const requeue = [];

        for (const item of batch) {
            if (!item || (now - (item.queuedAt || 0) > OUTBOX_TTL_MS)) continue;
            try {
                const sent = await sendOutboxDirectWithTimeout(sock, item.chatId, item.payload);
                trackBotMessage(sent);
                delivered += 1;
                healerState.outboxRecovered += 1;
                await new Promise((r) => setTimeout(r, 650));
            } catch {
                item.retries = (item.retries || 0) + 1;
                if (item.retries < 3) requeue.push(item);
            }
        }

        if (requeue.length) {
            pendingOutbox = [...requeue, ...pendingOutbox].slice(-MAX_OUTBOX_ITEMS);
        }
        persistOutbox();

        if (delivered > 0) {
            logHealAction('OUTBOX', `রিকানেক্টের পর ${delivered}টি মিসড মেসেজ নিরাপদে ডেলিভারি হয়েছে ✅`);
        }
    } finally {
        isFlushingOutbox = false;
    }
    return delivered;
}

// ==================================================
// ৪. Auth ডিরেক্টরি + রেজিস্টার্ড-অনলি creds.json ভল্ট + Bad MAC সার্জন
// ==================================================
function detectAuthDir() {
    const custom = (process.env.SESSION_DIR || process.env.AUTH_DIR || '').trim();
    const list = custom ? [custom, ...AUTH_DIR_CANDIDATES] : AUTH_DIR_CANDIDATES;
    for (const dirName of list) {
        const full = path.isAbsolute(dirName) ? dirName : path.join(process.cwd(), dirName);
        if (fs.existsSync(path.join(full, 'creds.json'))) return full;
    }
    for (const dirName of list) {
        const full = path.isAbsolute(dirName) ? dirName : path.join(process.cwd(), dirName);
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return full;
    }
    return null;
}

function isRegisteredValidCreds(parsed) {
    return Boolean(
        parsed &&
        typeof parsed === 'object' &&
        parsed.registered === true &&
        parsed.me?.id &&
        parsed.noiseKey &&
        parsed.signedIdentityKey
    );
}

function purgeCredsSnapshots(reason = 'loggedOut') {
    for (const f of ['creds.json.bak', 'creds.json.prev.bak']) {
        const full = path.join(SNAPSHOT_DIR, f);
        try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch {}
    }
    lastCredsSig = '';
    try { persistentDataMod?.purgeSessionBackup?.(reason); } catch {}
}

function protectAndVerifyCreds() {
    const authDir = detectAuthDir();
    if (!authDir) return { ok: false, restored: false };

    const credsFile = path.join(authDir, 'creds.json');
    const credsVault = path.join(SNAPSHOT_DIR, 'creds.json.bak');
    const credsPrevVault = path.join(SNAPSHOT_DIR, 'creds.json.prev.bak');

    if (fs.existsSync(credsFile)) {
        try {
            const st = fs.statSync(credsFile);
            const quickSig = `${st.mtimeMs}:${st.size}`;
            if (quickSig === lastCredsSig && fs.existsSync(credsVault)) {
                return { ok: true, restored: false };
            }

            const raw = fs.readFileSync(credsFile, 'utf8');
            const parsed = JSON.parse(raw);

            if (isRegisteredValidCreds(parsed)) {
                if (fs.existsSync(credsVault)) {
                    try {
                        const oldRaw = fs.readFileSync(credsVault, 'utf8');
                        if (isRegisteredValidCreds(JSON.parse(oldRaw))) {
                            atomicWriteText(credsPrevVault, oldRaw);
                        }
                    } catch {}
                }
                atomicWriteText(credsVault, raw);
                lastCredsSig = quickSig;
                return { ok: true, restored: false };
            }
            if (parsed && parsed.noiseKey && parsed.signedIdentityKey) {
                return { ok: false, restored: false };
            }
            throw new Error('Corrupt creds.json');
        } catch {
            for (const candidate of [credsVault, credsPrevVault]) {
                if (!fs.existsSync(candidate)) continue;
                try {
                    const bakRaw = fs.readFileSync(candidate, 'utf8');
                    const parsedBak = JSON.parse(bakRaw);
                    if (isRegisteredValidCreds(parsedBak)) {
                        atomicWriteText(credsFile, bakRaw);
                        const newSt = fs.statSync(credsFile);
                        lastCredsSig = `${newSt.mtimeMs}:${newSt.size}`;
                        healerState.repairedCreds += 1;
                        logHealAction('CREDS-VAULT', `করাপ্ট creds.json ভল্ট (${path.basename(candidate)}) থেকে রিকভার করা হয়েছে!`, true);
                        return { ok: true, restored: true };
                    }
                } catch {}
            }
        }
    }
    return { ok: false, restored: false };
}

function isStrictlyProtectedAuthFile(filename = '') {
    return (
        filename === 'creds.json' ||
        filename.startsWith('creds.') ||
        filename.startsWith('creds-') ||
        filename.startsWith('app-state-sync-')
    );
}

function extractBaseSignalId(rawId = '') {
    const firstPart = String(rawId || '').trim().split(/[_@.:-]/)[0];
    return firstPart.replace(/\D/g, '');
}

function healSignalSessionById(targetId, reason = 'Bad MAC') {
    const cleanId = extractBaseSignalId(targetId);
    if (cleanId.length < 6) return { healed: false, removed: 0 };

    const now = Date.now();
    if (now < (sessionHealCooldown.get(cleanId) || 0)) {
        return { healed: false, removed: 0, cooldown: true };
    }

    const authDir = detectAuthDir();
    if (!authDir) return { healed: false, removed: 0, error: 'Auth dir not found' };

    let removed = 0;
    try {
        const files = fs.readdirSync(authDir);
        for (const f of files) {
            if (isStrictlyProtectedAuthFile(f) || !f.endsWith('.json')) continue;
            if (
                f.startsWith(`session-${cleanId}.`) ||
                f.startsWith(`session-${cleanId}_`) ||
                f.startsWith(`session-${cleanId}@`) ||
                f.startsWith(`session-${cleanId}-`)
            ) {
                try {
                    fs.unlinkSync(path.join(authDir, f));
                    removed += 1;
                } catch {}
            }
        }
    } catch {}

    setBoundedMap(sessionHealCooldown, cleanId, now + SESSION_HEAL_COOLDOWN_MS);
    if (removed > 0) {
        healerState.healedBadMacs += 1;
        cachedDiskTelemetry.ts = 0;
        logHealAction('SESSION', `${reason} ফিক্স: ID ${cleanId}-এর ${removed}টি নষ্ট সেশন ফাইল রিসেট হয়েছে (লগআউট ছাড়াই)`);
        throttledOwnerAlert(
            `badmac:${cleanId}`,
            'অটো সেশন হিলিং 🩺',
            `• কন্টাক্ট আইডি: \`${cleanId}\`\n• সমস্যা: ${reason}\n• অ্যাকশন: ${removed}টি নষ্ট সেশন ফাইল মুছে অটো রিকভার করা হয়েছে।`,
            30 * 60 * 1000
        ).catch(() => {});
        return { healed: true, removed };
    }
    return { healed: false, removed: 0 };
}

function scanAndPruneSessionBloat(mode = 'runtime') {
    const authDir = detectAuthDir();
    if (!authDir) return { totalFiles: 0, pruned: 0 };

    let pruned = 0;

    const lastOptAt = systemOptimizerMod?.optimizer?.lastCleanReport?.at
        ? Date.parse(systemOptimizerMod.optimizer.lastCleanReport.at)
        : 0;
    const recentlyCleaned = mode === 'boot' && lastOptAt && (Date.now() - lastOptAt < 60 * 1000);

    if (!recentlyCleaned && systemOptimizerMod?.deepClean) {
        try {
            const rep = systemOptimizerMod.deepClean(mode);
            pruned += (rep?.sessionRemoved || 0) + (rep?.corruptRemoved || 0);
        } catch {}
    }

    let totalFiles = 0;
    const now = Date.now();
    try {
        const files = fs.readdirSync(authDir);
        totalFiles = files.length;
        for (const f of files) {
            if (isStrictlyProtectedAuthFile(f)) continue;
            if (/\.tmp-/i.test(f)) {
                const full = path.join(authDir, f);
                try {
                    const st = fs.statSync(full);
                    if (now - st.mtimeMs > 5 * 60 * 1000) {
                        fs.unlinkSync(full);
                        pruned += 1;
                        totalFiles = Math.max(0, totalFiles - 1);
                    }
                } catch {}
            }
        }
    } catch {}

    cachedDiskTelemetry.ts = 0;
    return { totalFiles, pruned };
}

// ==================================================
// ৫. বাউন্ডেড কনসোল স্প্যাম শিল্ড ও সিগন্যাল এরর ইন্টারসেপ্টর
// ==================================================
const SESSION_NOISE_RX = /^(?:Closing|Opening|Migrating|Removing old closed)\s+session\b/i;
const OWNER_LID_NOISE_RX = /\[Owner ID\]\s*Verified (?:Super-)?Owner LID saved/i;
const SIGNAL_ERR_RX = /(?:Bad MAC|Failed to decrypt message with any known session|No matching sessions found|No session found to decrypt|Decryption failed|MessageCounterError|Invalid PreKey ID|InvalidMessageException|Over 2000 messages into the future)/i;

function handlePotentialBadMacText(rawText = '', firstArgStr = '') {
    const lead = String(firstArgStr || rawText || '').trim();
    if (!lead && !rawText) return false;

    if (SESSION_NOISE_RX.test(lead) || /Closing session:/i.test(rawText)) {
        healerState.suppressedSpamLogs += 1;
        return true;
    }

    if (OWNER_LID_NOISE_RX.test(rawText)) {
        const now = Date.now();
        const last = spamLogLimiter.get('owner_lid_saved') || 0;
        if (now - last < 60 * 60 * 1000) {
            healerState.suppressedSpamLogs += 1;
            return true;
        }
        setBoundedMap(spamLogLimiter, 'owner_lid_saved', now);
        return false;
    }

    if (SIGNAL_ERR_RX.test(rawText)) {
        const idMatches = [
            ...rawText.matchAll(/at\s+async\s+(\d{6,20})(?:[_:]\d+)?(?:\.\d+)?/gi),
            ...rawText.matchAll(/session[-_](\d{6,20})/gi),
            ...rawText.matchAll(/(\d{10,20})(?::\d+)?@(?:lid|s\.whatsapp\.net)/gi)
        ].map((m) => m[1]);

        const uniqueIds = Array.from(new Set(idMatches));
        const now = Date.now();

        for (const id of uniqueIds) {
            const recent = (badMacHits.get(id) || []).filter((ts) => now - ts < BAD_MAC_WINDOW_MS);
            recent.push(now);
            setBoundedMap(badMacHits, id, recent);

            if (recent.length >= BAD_MAC_THRESHOLD) {
                badMacHits.delete(id);
                healSignalSessionById(id, 'Bad MAC / Decrypt Error');
            }
        }

        const limitKey = `sig:${uniqueIds[0] || 'generic'}`;
        const lastLog = spamLogLimiter.get(limitKey) || 0;
        if (now - lastLog > 30 * 1000) {
            setBoundedMap(spamLogLimiter, limitKey, now);
            const out = origConsoleLog || console.log;
            out(`⚠️ [SelfHealer] Signal decrypt error (${uniqueIds.join(',') || 'unknown'}) — auto-healing active.`);
        }
        healerState.suppressedSpamLogs += 1;
        return true;
    }

    return false;
}

function installConsoleInterceptor() {
    if (origConsoleError) return;
    origConsoleError = console.error.bind(console);
    origConsoleWarn = console.warn.bind(console);
    origConsoleLog = console.log.bind(console);
    origConsoleInfo = console.info.bind(console);

    const stringifyArgsCapped = (args) => {
        let out = '';
        for (const a of args) {
            if (out.length >= 500) break;
            if (a instanceof Error) out += `${a.message} ${(a.stack || '').slice(0, 260)} `;
            else if (typeof a === 'string') out += `${a.slice(0, 320)} `;
            else {
                try { out += `${String(a).slice(0, 120)} `; } catch {}
            }
        }
        return out.slice(0, 500);
    };

    const shouldSuppress = (args) => {
        const first = typeof args[0] === 'string' ? args[0].slice(0, 240) : '';
        return handlePotentialBadMacText(stringifyArgsCapped(args), first);
    };

    console.error = (...args) => { if (!shouldSuppress(args)) origConsoleError(...args); };
    console.warn = (...args) => { if (!shouldSuppress(args)) origConsoleWarn(...args); };
    console.info = (...args) => { if (!shouldSuppress(args)) origConsoleInfo(...args); };
    console.log = (...args) => {
        const first = typeof args[0] === 'string' ? args[0].slice(0, 240) : '';
        if (first && (SESSION_NOISE_RX.test(first) || OWNER_LID_NOISE_RX.test(first) || SIGNAL_ERR_RX.test(first) || /Session error:/i.test(first))) {
            if (shouldSuppress(args)) return;
        }
        origConsoleLog(...args);
    };
}

// ==================================================
// ৬. ডায়নামিক অ্যান্টি-থ্র্যাশ RAM গভর্নর, ডিস্ক কোটা ও ইভেন্ট-লুপ মনিটর
// ==================================================
function startEventLoopMonitor() {
    if (loopMonitor) return;
    try {
        loopMonitor = monitorEventLoopDelay({ resolution: 25 });
        loopMonitor.enable();
    } catch {
        loopMonitor = null;
    }
}

function getEventLoopLagMs() {
    if (!loopMonitor) return 0;
    try {
        const p95 = loopMonitor.percentile(95) / 1e6;
        return Number.isFinite(p95) ? Number(p95.toFixed(1)) : 0;
    } catch {
        return 0;
    }
}

function recordRssSample(rssMb) {
    rssSamples.push({ ts: Date.now(), rssMb });
    if (rssSamples.length > 12) rssSamples.shift();
}

function getMemoryTrendText() {
    if (rssSamples.length < 4) return 'স্থিতিশীল';
    const delta = rssSamples[rssSamples.length - 1].rssMb - rssSamples[0].rssMb;
    if (delta >= 25) return `⚠️ বাড়ছে (+${delta} MB)`;
    if (delta <= -12) return `📉 কমছে (${delta} MB)`;
    return '🟢 স্থিতিশীল';
}

function trimVoiceCacheIfNeeded(keepMax = 20) {
    let removed = 0;
    try {
        if (!fs.existsSync(VOICE_CACHE_DIR)) return 0;
        const files = fs.readdirSync(VOICE_CACHE_DIR)
            .filter((f) => f.endsWith('.ogg'))
            .map((f) => ({ full: path.join(VOICE_CACHE_DIR, f), mtime: fs.statSync(path.join(VOICE_CACHE_DIR, f)).mtimeMs }));
        if (files.length <= keepMax) return 0;
        files.sort((a, b) => a.mtime - b.mtime);
        for (const item of files.slice(0, files.length - keepMax)) {
            try { fs.unlinkSync(item.full); removed += 1; } catch {}
        }
    } catch {}
    return removed;
}

function flushAllV3Caches(reason = 'memory') {
    try { flushAllPendingSaves(); } catch {}
    try { memoryEngineMod?.flushMemory?.(); } catch {}
    try { voiceEngineMod?.clearVoiceMemoryCache?.(); } catch {}
    try {
        if (typeof systemOptimizerMod?.emergencyMemoryFlush === 'function') {
            systemOptimizerMod.emergencyMemoryFlush(reason);
        } else {
            systemOptimizerMod?.flushRegisteredHooks?.(reason);
        }
    } catch {}
    pruneInternalMaps();
}

function enforceDiskQuota() {
    const disk = getCachedDiskTelemetry(true);
    if (disk.diskMb < DISK_QUOTA_MB) return { totalMb: disk.diskMb, cleaned: false };

    const res = safeRunCleanup(0);
    const voiceTrimmed = trimVoiceCacheIfNeeded(12);
    const sess = scanAndPruneSessionBloat('memory');
    healerState.diskCleanups += 1;
    cachedDiskTelemetry.ts = 0;
    logHealAction('DISK', `ডিস্ক ${disk.diskMb}MB (>=${DISK_QUOTA_MB}MB) -> টেম্প:${res.removedCount}, ভয়েস:${voiceTrimmed}, সেশন:${sess.pruned} ক্লিন হয়েছে।`);
    return { totalMb: disk.diskMb, cleaned: true, voiceTrimmed, tempRemoved: res.removedCount, sessionPruned: sess.pruned };
}

async function runMemoryGovernor(forceCleanup = false) {
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
    if (rssMb > healerState.peakRssMb) healerState.peakRssMb = rssMb;
    recordRssSample(rssMb);

    const { warnMb, critMb, fatalMb } = getRamThresholds();
    const lagMs = getEventLoopLagMs();
    if (loopMonitor && lagMs > 1200) loopMonitor.reset();
    const now = Date.now();

    // ১. FATAL OOM গার্ড (সেভড ডেটাসহ ক্লিন রিস্টার্ট)
    if (!forceCleanup && rssMb >= fatalMb) {
        flushAllV3Caches('fatal_guard');
        safeRunCleanup(0);
        trimVoiceCacheIfNeeded(8);
        scanAndPruneSessionBloat('memory');
        if (typeof global.gc === 'function') { try { global.gc(); } catch {} }

        const recheckMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const inRestartCooldown = now - (healerState.lastOomRestartAt || 0) < OOM_RESTART_COOLDOWN_MS;

        if (recheckMb >= fatalMb && !inRestartCooldown && !isExiting) {
            isExiting = true;
            healerState.lastOomRestartAt = now;
            logHealAction('OOM-GUARD', `RAM ${recheckMb}MB (>=${fatalMb}MB) — ডেটা সেভ করে ক্লিন রিস্টার্ট!`, true);
            try { persistentDataMod?.backup?.({ force: true }); } catch {}
            await throttledOwnerAlert(
                'ram_fatal',
                'ইমার্জেন্সি RAM প্রটেকশন 🚨',
                `• RAM: *${recheckMb} MB* (লিমিট: ${fatalMb} MB)\n• সব ডেটা সেভ করে বট অটো-রিস্টার্ট হচ্ছে।`,
                5 * 60 * 1000
            );
            setTimeout(() => process.exit(1), 1500).unref();
            return { level: 'FATAL', rssMb: recheckMb, heapMb, freedKb: 0 };
        }
        return { level: 'CRITICAL_CLEANED', rssMb: recheckMb, heapMb, freedKb: 0 };
    }

    // ২. CRITICAL ডিপ ক্লিন (অ্যান্টি-থ্র্যাশ ৯০ সেকেন্ড কুলডাউনসহ)
    if (forceCleanup || rssMb >= critMb) {
        if (!forceCleanup && (now - lastCritCleanAt) < CRIT_CLEAN_COOLDOWN_MS) {
            return { level: 'CRITICAL_COOLDOWN', rssMb, heapMb, lagMs };
        }
        lastCritCleanAt = now;

        flushAllV3Caches('memory');
        const res = safeRunCleanup(0);
        const voiceTrimmed = trimVoiceCacheIfNeeded(15);
        const sess = scanAndPruneSessionBloat(forceCleanup ? 'manual' : 'memory');
        if (typeof global.gc === 'function') { try { global.gc(); } catch {} }

        healerState.ramCleanups += 1;
        const afterMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
        logHealAction('RAM', `ডিপ ক্লিন: ${rssMb}MB -> ${afterMb}MB (টেম্প: ${res.removedCount}, ভয়েস: ${voiceTrimmed}, সেশন: ${sess.pruned})`);

        if (!forceCleanup && afterMb >= critMb) {
            throttledOwnerAlert(
                'ram_crit',
                'হাই RAM সতর্কতা ⚠️',
                `• বর্তমান RAM: *${afterMb} MB* | Heap: *${heapMb} MB*\n• ইভেন্ট লুপ ল্যাগ: \`${lagMs}ms\`\n• অটো ডিপ ক্লিন চালানো হয়েছে।`,
                30 * 60 * 1000
            ).catch(() => {});
        }
        return { level: 'CRITICAL_CLEANED', rssMb: afterMb, heapMb, freedKb: res.freedKb, voiceTrimmed, sessionPruned: sess.pruned };
    }

    // ৩. WARN লাইট ক্লিন (অ্যান্টি-থ্র্যাশ ৫ মিনিট কুলডাউন — জিরো লুপ স্প্যাম)
    if (rssMb >= warnMb) {
        if ((now - lastWarnCleanAt) < WARN_CLEAN_COOLDOWN_MS) {
            return { level: 'WARN_COOLDOWN', rssMb, heapMb, lagMs };
        }
        lastWarnCleanAt = now;

        const res = safeRunCleanup(5);
        const voiceTrimmed = trimVoiceCacheIfNeeded(25);
        if (typeof global.gc === 'function') { try { global.gc(); } catch {} }
        if (res.removedCount > 0 || voiceTrimmed > 0) {
            healerState.ramCleanups += 1;
            logHealAction('RAM', `লাইট ক্লিন (${rssMb}MB): ${res.removedCount} টেম্প, ${voiceTrimmed} পুরোনো ভয়েস ক্যাশ মুক্ত।`);
        }
        return { level: 'WARN_CLEANED', rssMb, heapMb, freedKb: res.freedKb, voiceTrimmed };
    }

    return { level: 'HEALTHY', rssMb, heapMb, lagMs };
}

// ==================================================
// ৭. স্ট্যাট-ক্যাশড অ্যাটমিক JSON ইন্টিগ্রিটি গার্ডিয়ান
// ==================================================
function verifyAndSnapshotDataFiles() {
    let checked = 0;
    let repaired = 0;
    let cleanedOrphans = 0;
    const now = Date.now();

    protectAndVerifyCreds();

    try {
        for (const name of fs.readdirSync(DATA_DIR)) {
            const full = path.join(DATA_DIR, name);
            let st;
            try { st = fs.lstatSync(full); } catch { continue; }
            if (!st.isFile() || st.isSymbolicLink()) continue;

            if (/\.tmp(?:[.-]|$)/i.test(name)) {
                if (now - st.mtimeMs > 5 * 60 * 1000) {
                    try { fs.unlinkSync(full); cleanedOrphans += 1; } catch {}
                }
                continue;
            }

            if (!name.endsWith('.json')) continue;
            checked += 1;
            const snapPath = path.join(SNAPSHOT_DIR, `${name}.bak`);
            const statPrefix = `${st.mtimeMs}:${st.size}:`;
            const cachedEntry = snapshotStatCache.get(name) || '';

            if (cachedEntry.startsWith(statPrefix) && fs.existsSync(snapPath)) {
                continue;
            }

            if (st.size > MAX_SNAPSHOT_JSON_BYTES) continue;

            try {
                const raw = fs.readFileSync(full, 'utf8');
                JSON.parse(raw);
                if (st.size > 0) {
                    const hash = md5(raw);
                    const prevHash = cachedEntry.split(':')[2] || '';
                    if (prevHash !== hash || !fs.existsSync(snapPath)) {
                        atomicWriteText(snapPath, raw);
                    }
                    setBoundedMap(snapshotStatCache, name, `${statPrefix}${hash}`);
                }
            } catch {
                if (fs.existsSync(snapPath)) {
                    try {
                        const bakRaw = fs.readFileSync(snapPath, 'utf8');
                        JSON.parse(bakRaw);
                        atomicWriteText(full, bakRaw);
                        const newSt = fs.statSync(full);
                        setBoundedMap(snapshotStatCache, name, `${newSt.mtimeMs}:${newSt.size}:${md5(bakRaw)}`);
                        repaired += 1;
                        healerState.repairedJsonFiles += 1;
                        logHealAction('INTEGRITY', `করাপ্ট "${name}" স্ন্যাপশট থেকে অ্যাটমিকভাবে রিকভার হয়েছে!`, true);
                        throttledOwnerAlert(
                            `json:${name}`,
                            'ডেটা অটো-রিকভারি 🛡️',
                            `• করাপ্ট ফাইল: \`${name}\`\n• অ্যাকশন: স্ন্যাপশট ব্যাকআপ থেকে ১০০% সুরক্ষিতভাবে পুনরুদ্ধার করা হয়েছে।`,
                            15 * 60 * 1000
                        ).catch(() => {});
                    } catch {}
                }
            }
        }
    } catch {}

    return { checked, repaired, cleanedOrphans };
}

// ==================================================
// ৮. লো-RAM কম্প্রেসড (Gzip L6) ব্যাকআপ ও ক্যাশ-সিঙ্কড সুপার-ওনার রিস্টোর
// ==================================================
function createCompressedBackupBundle() {
    let bundle = {
        meta: {
            bot: BOT_NAME,
            version: settings?.version || BOT_VERSION || '3.0.0-ULTRA',
            owner: OWNER_NAME,
            createdAt: new Date().toISOString(),
            dhakaTime: getDhakaTimeInfo().formatted
        },
        files: {}
    };

    const skipFiles = new Set(['mahiru_live_models_cache.json', 'mahiru_healer_state.json', 'mahiru_outbox_queue.json']);
    let fileCount = 0;
    let totalRawBytes = 0;
    const MAX_BUNDLE_RAW_BYTES = 3 * 1024 * 1024;

    for (const name of fs.readdirSync(DATA_DIR)) {
        if (!name.endsWith('.json') || skipFiles.has(name)) continue;
        const full = path.join(DATA_DIR, name);
        try {
            const st = fs.lstatSync(full);
            if (!st.isFile() || st.size === 0 || st.size > MAX_SNAPSHOT_JSON_BYTES) continue;
            if (totalRawBytes + st.size > MAX_BUNDLE_RAW_BYTES) continue;
            bundle.files[name] = JSON.parse(fs.readFileSync(full, 'utf8'));
            totalRawBytes += st.size;
            fileCount += 1;
        } catch {}
    }

    const gzBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8'), { level: 6 });
    bundle = null; // দ্রুত মেমোরি মুক্তি

    const nowDhaka = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const stamp = nowDhaka.toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const fileName = `mahiru_backup_${stamp}.json.gz`;
    const filePath = path.join(BACKUP_DIR, fileName);

    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tmpPath, gzBuffer);
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
        throw err;
    }

    try {
        const archives = fs.readdirSync(BACKUP_DIR)
            .filter((f) => f.endsWith('.json.gz'))
            .map((f) => ({ full: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        for (const old of archives.slice(MAX_LOCAL_BACKUPS)) {
            try { fs.unlinkSync(old.full); } catch {}
        }
    } catch {}

    cachedDiskTelemetry.ts = 0;
    return {
        fileName,
        filePath,
        buffer: gzBuffer,
        fileCount,
        sizeKb: Number((gzBuffer.length / 1024).toFixed(1))
    };
}

function restoreLatestBackup() {
    try {
        const archives = fs.readdirSync(BACKUP_DIR)
            .filter((f) => f.endsWith('.json.gz'))
            .map((f) => ({ name: f, full: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);

        if (!archives.length) return { ok: false, error: 'কোনো লোকাল ব্যাকআপ ফাইল পাওয়া যায়নি।' };

        const latest = archives[0];
        const rawJson = zlib.gunzipSync(fs.readFileSync(latest.full)).toString('utf8');
        const bundle = JSON.parse(rawJson);
        const filesObj = bundle?.files;
        if (!filesObj || typeof filesObj !== 'object') {
            return { ok: false, error: 'ব্যাকআপ ফাইলের ফরম্যাট সঠিক নয়।' };
        }

        let restoredCount = 0;
        for (const [fileName, data] of Object.entries(filesObj)) {
            if (!/^[a-zA-Z0-9._-]+\.json$/.test(fileName)) continue;
            atomicWriteText(path.join(DATA_DIR, fileName), JSON.stringify(data, null, 2));
            restoredCount += 1;
        }

        // রিস্টোরের পর সব ইন-মেমোরি ক্যাশ তাৎক্ষণিক রিফ্রেশ
        snapshotStatCache.clear();
        try { userGroupLib?.invalidateUserGroupCache?.(); } catch {}
        try { isOwnerOrSudo?.invalidateOwnerIdentityCache?.(); } catch {}
        flushAllV3Caches('restore');

        logHealAction('RESTORE', `${latest.name} থেকে ${restoredCount}টি ডেটা ফাইল রিস্টোর করা হয়েছে।`, true);
        return { ok: true, fileName: latest.name, restoredCount, createdAt: bundle?.meta?.dhakaTime || '' };
    } catch (err) {
        return { ok: false, error: `রিস্টোর এরর: ${err?.message || err}` };
    }
}

async function uploadBackupToTelegram(backupObj) {
    const token = (process.env.BACKUP_TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = (process.env.BACKUP_TG_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '').trim();
    if (!token || !chatId) return false;

    try {
        const ver = settings?.version || BOT_VERSION || '3.0.0-ULTRA';
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', `🛡️ ${BOT_NAME} v${ver} Auto-Backup\n📁 ফাইল: ${backupObj.fileCount}টি (${backupObj.sizeKb} KB)\n🕒 ${getDhakaTimeInfo().formatted}`);
        form.append('document', new Blob([backupObj.buffer], { type: 'application/gzip' }), backupObj.fileName);

        const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(15000)
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function uploadBackupToRemoteWebhook(backupObj) {
    const url = safeGetRemoteUrl();
    if (!url || !/^https?:\/\//i.test(url)) return false;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: backupObj.fileName,
                fileCount: backupObj.fileCount,
                sizeKb: backupObj.sizeKb,
                createdAt: Date.now(),
                gzipBase64: backupObj.buffer.toString('base64')
            }),
            signal: AbortSignal.timeout(15000)
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function runFullBackup({ sendToWhatsApp = false, targetChatId = '' } = {}) {
    flushAllPendingSaves();
    try { memoryEngineMod?.flushMemory?.(); } catch {}
    try { persistentDataMod?.backup?.({ force: true }); } catch {}

    const backup = createCompressedBackupBundle();
    const targets = ['Local'];

    const [tgOk, cloudOk] = await Promise.all([
        uploadBackupToTelegram(backup),
        uploadBackupToRemoteWebhook(backup)
    ]);
    if (tgOk) targets.push('Telegram');
    if (cloudOk) targets.push('Cloud');

    if (sendToWhatsApp) {
        const sock = getSock();
        const dest = targetChatId || (sock ? getOwnerJid(sock) : '');
        if (sock && dest) {
            try {
                const ver = settings?.version || BOT_VERSION || '3.0.0-ULTRA';
                const syncList = [...targets, 'WhatsApp'];
                const delivered = await safeSend(sock, dest, {
                    document: backup.buffer,
                    mimetype: 'application/gzip',
                    fileName: backup.fileName,
                    caption: `🛡️ *${BOT_NAME} v${ver} • সুরক্ষিত ব্যাকআপ*\n──────────────\n• ডেটা ফাইল: *${backup.fileCount}টি* (\`${backup.sizeKb} KB\`)\n• সিঙ্ক: ${syncList.join(' + ')}\n• সময়: \`${getDhakaTimeInfo().formatted}\``
                });
                if (!delivered) throw new Error('WhatsApp backup delivery was not confirmed');
                targets.push('WhatsApp');
            } catch {}
        }
    }

    const dhakaDay = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    healerState.backupsDone += 1;
    healerState.lastBackupDate = dhakaDay;
    healerState.lastBackupAt = Date.now();
    logHealAction('BACKUP', `${backup.fileName} (${backup.sizeKb} KB, ${backup.fileCount} files) -> ${targets.join(', ')}`, true);

    return { ...backup, targets };
}

// ==================================================
// ৯. জম্বি সকেট ওয়াচডগ, ক্র্যাশ শিল্ড ও ডক্টর ডায়াগনস্টিক
// ==================================================
function recordSocketActivity() {
    healerState.lastActivityAt = Date.now();
    if (pendingOutbox.length > 0 && !isFlushingOutbox) {
        flushPendingOutbox().catch(() => {});
    }
}

function recordSocketDisconnect(reason = '') {
    const now = Date.now();
    healerState.disconnectTimestamps = healerState.disconnectTimestamps.filter((ts) => now - ts < 5 * 60 * 1000);
    healerState.disconnectTimestamps.push(now);

    if (String(reason) === '401' || String(reason).toLowerCase().includes('loggedout')) {
        purgeCredsSnapshots('401_disconnect');
    }

    if (healerState.disconnectTimestamps.length >= 6) {
        logHealAction('SOCKET', `ডিসকানেক্ট স্টর্ম শনাক্ত (${healerState.disconnectTimestamps.length} বার / ৫ মি): ${String(reason).slice(0, 60)}`);
    }
}

function checkSocketHeartbeat() {
    const sock = getSock();
    if (!sock) return;

    const wsState = sock?.ws?.readyState;
    const idleMin = Math.floor((Date.now() - healerState.lastActivityAt) / 60000);

    if (wsState === 1 && pendingOutbox.length > 0) {
        flushPendingOutbox().catch(() => {});
    }

    if (wsState === 3 && idleMin >= 3) {
        logHealAction('HEARTBEAT', `জম্বি সকেট শনাক্ত (wsState=CLOSED, ${idleMin}m idle)`);
        if (typeof reconnectCallbackFn === 'function') {
            try { reconnectCallbackFn(); } catch {}
        }
    }
}

const TRANSIENT_ERROR_RX = /(Bad MAC|No matching sessions|No session found|Decryption failed|MessageCounterError|Invalid PreKey|InvalidMessageException|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|Stream Errored|Connection Closed|Connection Terminated|rate-overlimit|Timed Out|Aborted|conflict|readline was closed)/i;

function installGlobalCrashShield() {
    if (process.__mahiruCrashShieldInstalled) return;
    process.__mahiruCrashShieldInstalled = true;

    process.on('unhandledRejection', (reason) => {
        const msg = reason instanceof Error ? `${reason.message}\n${reason.stack || ''}` : String(reason || '');
        if (handlePotentialBadMacText(msg)) return;

        healerState.shieldedCrashes += 1;
        const firstLine = msg.split('\n')[0].slice(0, 90);
        logHealAction('SHIELD', `${TRANSIENT_ERROR_RX.test(msg) ? 'ট্রানজিয়েন্ট' : 'Unhandled'} Rejection আটকানো হয়েছে: ${firstLine}`);
    });

    process.on('uncaughtException', (err) => {
        const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err || '');
        if (handlePotentialBadMacText(msg)) return;

        if (TRANSIENT_ERROR_RX.test(msg)) {
            healerState.shieldedCrashes += 1;
            logHealAction('SHIELD', `ট্রানজিয়েন্ট ক্র্যাশ আটকানো হয়েছে: ${msg.split('\n')[0].slice(0, 90)}`);
            return;
        }

        if (isExiting) return;
        isExiting = true;
        healerState.shieldedCrashes += 1;
        logHealAction('FATAL', `গুরুতর এরর: ${msg.split('\n')[0].slice(0, 100)} — ডেটা ফ্লাশ করা হচ্ছে`, true);
        flushAllV3Caches('fatal');
        persistOutbox();
        try { persistentDataMod?.backup?.({ force: true }); } catch {}
        setTimeout(() => process.exit(1), 1000).unref();
    });
}

function formatUptime(ms) {
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

function computeHealthScore({ rssMb, lagMs, diskMb, sockConnected, sessionFiles }) {
    const { warnMb, critMb } = getRamThresholds();
    let score = 100;
    if (rssMb >= critMb) score -= 35;
    else if (rssMb >= warnMb) score -= 15;
    if (lagMs > 250) score -= 20;
    else if (lagMs > 100) score -= 8;
    if (diskMb > DISK_QUOTA_MB) score -= 10;
    if (sessionFiles > 800) score -= 15;
    else if (sessionFiles > SESSION_BLOAT_WARN) score -= 5;
    if (!sockConnected) score -= 25;
    if (healerState.disconnectTimestamps.length >= 4) score -= 10;
    return Math.max(0, Math.min(100, score));
}

function getHealerStatus(forceDiskScan = false) {
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapLimitMb = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
    const lagMs = getEventLoopLagMs();
    const disk = getCachedDiskTelemetry(forceDiskScan);

    const sock = getSock();
    const sockConnected = Boolean(sock && sock.user);
    const healthScore = computeHealthScore({
        rssMb, lagMs, diskMb: disk.diskMb, sockConnected, sessionFiles: disk.sessionFiles
    });

    return {
        healthScore,
        uptime: formatUptime(Date.now() - healerState.startedAt),
        rssMb,
        heapMb,
        heapLimitMb,
        peakRssMb: Math.max(healerState.peakRssMb, rssMb),
        ramTrend: getMemoryTrendText(),
        lagMs,
        diskMb: disk.diskMb,
        diskQuotaMb: DISK_QUOTA_MB,
        sessionFiles: disk.sessionFiles,
        authDirName: disk.authDirName,
        credsVaultReady: fs.existsSync(path.join(SNAPSHOT_DIR, 'creds.json.bak')),
        pendingOutboxCount: pendingOutbox.length,
        outboxRecovered: healerState.outboxRecovered,
        suppressedSpamLogs: healerState.suppressedSpamLogs,
        healedBadMacs: healerState.healedBadMacs,
        shieldedCrashes: healerState.shieldedCrashes,
        repairedJsonFiles: healerState.repairedJsonFiles,
        repairedCreds: healerState.repairedCreds,
        ramCleanups: healerState.ramCleanups,
        diskCleanups: healerState.diskCleanups,
        backupsDone: healerState.backupsDone,
        lastBackupDate: healerState.lastBackupDate || 'এখনো হয়নি',
        telegramReady: Boolean((process.env.BACKUP_TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim() && (process.env.BACKUP_TG_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '').trim()),
        recentActions: healerState.recentActions.slice(-8).reverse()
    };
}

function buildHealerReportText() {
    const s = getHealerStatus(false);
    const ver = settings?.version || BOT_VERSION || '3.0.0-ULTRA';
    const scoreIcon = s.healthScore >= 85 ? '🟢' : s.healthScore >= 60 ? '🟡' : '🔴';

    return (
`> 🩺 *${BOT_NAME} v${ver} • SRE সেলফ-হিলার v3.5*
> হেলথ স্কোর: ${scoreIcon} *${s.healthScore}/100* | আপটাইম: \`${s.uptime}\`

📊 *লাইভ রিসোর্স*
──────────────
• *RAM:* \`${s.rssMb} MB\` (পিক \`${s.peakRssMb} MB\`) — ${s.ramTrend}
• *Heap / ল্যাগ:* \`${s.heapMb} MB\` | \`${s.lagMs}ms\`
• *ডিস্ক:* \`${s.diskMb} / ${s.diskQuotaMb} MB\` | *সেশন:* ${s.sessionFiles} ফাইল
• *Creds ভল্ট:* ${s.credsVaultReady ? '🔒 ডুয়াল সুরক্ষিত' : '⚪ পেন্ডিং'} | *আউটবক্স:* ${s.pendingOutboxCount}টি

🛡️ *অটো-প্রটেকশন স্কোরকার্ড*
──────────────
• *Bad MAC ফিক্স:* ${s.healedBadMacs} | *ক্র্যাশ শিল্ড:* ${s.shieldedCrashes}
• *JSON / Creds রিকভারি:* ${s.repairedJsonFiles} / ${s.repairedCreds}
• *মিসড মেসেজ উদ্ধার:* ${s.outboxRecovered} | *স্প্যাম ব্লক:* ${s.suppressedSpamLogs}
• *RAM / ডিস্ক ক্লিন:* ${s.ramCleanups} / ${s.diskCleanups}
• *ব্যাকআপ:* ${s.backupsDone}টি (\`${s.lastBackupDate}\`) | TG: ${s.telegramReady ? '🟢' : '⚪'}

⚡ *কুইক কমান্ড*
──────────────
• \`.doc\` / \`.heal doctor\` — ১০-পয়েন্ট ফুল ডায়াগনস্টিক
• \`.ram\` / \`.heal ram\` — ডিপ র‍্যাম, সেশন ও ক্যাশ ক্লিন
• \`.bk\` / \`.heal backup\` — তাৎক্ষণিক Gzip ব্যাকআপ
• \`.heal restore\` — শেষ ব্যাকআপ রিস্টোর (Super Owner)
• \`.heal mac <ID>\` — নষ্ট সেশন ফিক্স
• \`.heal logs\` — অটো-হিলিং অ্যাকশন লগ`
    );
}

function runDoctorDiagnostic() {
    const verify = verifyAndSnapshotDataFiles();
    const disk = enforceDiskQuota();
    const s = getHealerStatus(true);
    const { warnMb, critMb } = getRamThresholds();
    const sock = getSock();
    const sockOk = Boolean(sock && sock.user && (!sock.ws || sock.ws.readyState === 1));
    const aiHealth = aiOrchestratorMod?.getAIHealthStats ? aiOrchestratorMod.getAIHealthStats() : null;
    const vHealth = voiceEngineMod?.getVoiceStats ? voiceEngineMod.getVoiceStats() : null;

    const checks = [
        `${s.credsVaultReady ? '✅' : '⚠️'} *Creds শ্যাডো ভল্ট:* ${s.credsVaultReady ? 'সুরক্ষিত (লগআউট প্রুফ)' : 'অপেক্ষমাণ'}`,
        `${verify.repaired === 0 ? '✅' : '🛠️'} *JSON ডেটাবেজ:* ${verify.checked}টি ভ্যালিড (${verify.repaired}টি রিকভারড)`,
        `${s.sessionFiles <= SESSION_BLOAT_WARN ? '✅' : '🟡'} *সেশন হেলথ:* ${s.sessionFiles} ফাইল (${s.sessionFiles <= SESSION_BLOAT_WARN ? 'ক্লিন' : 'ডিপ ক্লিন প্রয়োজন'})`,
        `${s.rssMb < warnMb ? '✅' : s.rssMb < critMb ? '🟡' : '🔴'} *RAM স্ট্যাটাস:* \`${s.rssMb} MB\` (${s.ramTrend})`,
        `${s.lagMs < 100 ? '✅' : '🟡'} *ইভেন্ট-লুপ স্পিড:* \`${s.lagMs}ms\``,
        `${sockOk ? '✅' : '🔴'} *WhatsApp সকেট:* ${sockOk ? 'লাইভ কানেক্টেড' : 'রিকানেক্টিং'} (আউটবক্স: ${s.pendingOutboxCount})`,
        `${disk.totalMb < DISK_QUOTA_MB ? '✅' : '🟡'} *ডিস্ক ব্যবহার:* \`${disk.totalMb} / ${DISK_QUOTA_MB} MB\``,
        `${aiHealth ? '✅' : 'ℹ️'} *AI পুল v3.0:* ${aiHealth ? `মোড \`${aiHealth.primaryProvider}\` | Avg \`${aiHealth.avgLatencyMs}ms\` | কুলডাউন: ${aiHealth.coolingSlots.length}` : 'লিগ্যাসি মোড'}`,
        `${vHealth ? '✅' : 'ℹ️'} *ভয়েস স্টুডিও v3:* ${vHealth ? `মোড \`${vHealth.globalMode}\` (${vHealth.voiceName}) | Avg \`${vHealth.avgTtsMs}ms\`` : 'লিগ্যাসি মোড'}`,
        `${s.backupsDone > 0 ? '✅' : 'ℹ️'} *ব্যাকআপ স্ট্যাটাস:* ${s.backupsDone}টি (সর্বশেষ: \`${s.lastBackupDate}\`)`
    ];

    return `> 🔬 *MAHIRU • ১০-পয়েন্ট আল্ট্রা ডক্টর*\n> ফাইনাল স্কোর: *${s.healthScore}/100*\n\n${checks.join('\n')}`;
}

function initSelfHealer(sockGetter, { onReconnectNeeded = null } = {}) {
    if (sockGetter) sockGetterFn = sockGetter;
    if (typeof onReconnectNeeded === 'function') reconnectCallbackFn = onReconnectNeeded;
    if (initialized) return;
    initialized = true;

    installConsoleInterceptor();
    installGlobalCrashShield();
    startEventLoopMonitor();

    if (systemOptimizerMod?.registerCleanupHook) {
        systemOptimizerMod.registerCleanupHook('selfHealerMaps', pruneInternalMaps);
    }

    const bootCheck = verifyAndSnapshotDataFiles();
    const bootSess = scanAndPruneSessionBloat('boot');
    const ver = settings?.version || BOT_VERSION || '3.0.0-ULTRA';
    const out = origConsoleLog || console.log;
    out(`🩺 Mahiru v${ver} SelfHealer SRE v3.5 ON [JSON:${bootCheck.checked} ok, ${bootCheck.repaired} fixed | Session:${bootSess.totalFiles} files (pruned:${bootSess.pruned}) | Outbox:${pendingOutbox.length}]`);

    ramTimer = setInterval(() => runMemoryGovernor(false).catch(() => {}), 60 * 1000);
    if (ramTimer.unref) ramTimer.unref();

    integrityTimer = setInterval(() => {
        verifyAndSnapshotDataFiles();
        scanAndPruneSessionBloat('runtime');
        enforceDiskQuota();
        pruneInternalMaps();
    }, 30 * 60 * 1000);
    if (integrityTimer.unref) integrityTimer.unref();

    heartbeatTimer = setInterval(() => checkSocketHeartbeat(), 60 * 1000);
    if (heartbeatTimer.unref) heartbeatTimer.unref();

    backupTimer = setInterval(() => {
        const nowDhaka = new Date(Date.now() + 6 * 60 * 60 * 1000);
        const hour = nowDhaka.getUTCHours();
        const today = nowDhaka.toISOString().slice(0, 10);
        const { critMb } = getRamThresholds();
        const currentRss = Math.round(process.memoryUsage().rss / 1024 / 1024);
        if (hour === 3 && healerState.lastBackupDate !== today && currentRss < critMb) {
            runFullBackup({ sendToWhatsApp: true }).catch(() => {});
        }
    }, 10 * 60 * 1000);
    if (backupTimer.unref) backupTimer.unref();
}

function stopSelfHealer() {
    clearInterval(ramTimer);
    clearInterval(integrityTimer);
    clearInterval(heartbeatTimer);
    clearInterval(backupTimer);
    ramTimer = integrityTimer = heartbeatTimer = backupTimer = null;
    try { loopMonitor?.disable?.(); } catch {}
    persistState(true);
    persistOutbox();
    initialized = false;
}

// ==================================================
// ১০. ওনার কমান্ড হ্যান্ডলার (.heal / .health / .doc / .ram / .bk) — 4 & 5 Arg Safe
// ==================================================
async function isAuthorizedHealerCaller(sock, chatId, message) {
    if (message?.key?.fromMe) return true;
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId || '';
    const altId = message?.key?.participantAlt || message?.key?.remoteJidAlt || '';
    if (typeof isOwnerOrSudo?.isBlockedIdentity === 'function' && isOwnerOrSudo.isBlockedIdentity(senderId, altId)) {
        return false;
    }
    if (isOwnerMessage(message, senderId, sock)) return true;
    try { return Boolean(await isOwnerOrSudo(senderId, sock, chatId, message)); } catch { return false; }
}

function isSuperOwnerCaller(message, chatId) {
    if (message?.key?.fromMe) return true;
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId || '';
    const altId = message?.key?.participantAlt || message?.key?.remoteJidAlt || '';
    if (typeof isOwnerOrSudo?.isBlockedIdentity === 'function' && isOwnerOrSudo.isBlockedIdentity(senderId, altId)) {
        return false;
    }
    if (typeof global.__PRIME_IS_SUPER_OWNER__ === 'function') {
        try { if (global.__PRIME_IS_SUPER_OWNER__(senderId, message)) return true; } catch {}
    }
    if (typeof settings?.isSuperOwnerJid === 'function') {
        try { return Boolean(settings.isSuperOwnerJid(senderId, altId)); } catch {}
    }
    return false;
}

async function sendHealerInteractiveCard(sock, chatId, message, bodyText, subtitle = 'SRE SELF-HEALER') {
    const p = settings?.prefix || '.';
    if (typeof buttonEngine?.sendInteractiveCard === 'function') {
        try {
            await buttonEngine.sendInteractiveCard(sock, chatId, {
                body: bodyText,
                headerTitle: `${buttonEngine.toSmallCaps(settings?.botName || 'Mahiru Shiina')} • SRE`,
                headerSubtitle: `🩺 ${buttonEngine.toSmallCaps(subtitle)}`,
                headerType: 'none',
                buttons: [
                    { text: 'DOCTOR 🔬', id: `${p}doc`, type: 'quick_reply' },
                    { text: 'RAM CLEAN 🧹', id: `${p}ram`, type: 'quick_reply' },
                    { text: 'BACKUP 🛡️', id: `${p}bk`, type: 'quick_reply' },
                    { text: 'LOGS 📋', id: `${p}heal logs`, type: 'quick_reply' }
                ],
                quoted: message
            });
            return;
        } catch {}
    }
    return safeSend(sock, chatId, { text: bodyText }, { quoted: message });
}

async function handleSelfHealerCommand(sock, chatId, message, arg4 = '', arg5 = '') {
    if (!(await isAuthorizedHealerCaller(sock, chatId, message))) {
        await safeSend(sock, chatId, {
            text: '🔒 এই Self-Healer কমান্ডটি শুধু যাচাইকৃত Bot Owner বা অনুমোদিত Sudo ব্যবহার করতে পারবেন।'
        }, { quoted: message }).catch(() => {});
        return;
    }

    // 5-arg (baseCmd, cmdArgs) ও 4-arg (rawArgs) উভয় কলই নির্ভুলভাবে পার্স হবে
    let sub = '';
    let extraArg = '';
    const first = String(arg4 || '').trim();
    const second = String(arg5 || '').trim();

    if (first.startsWith('.')) {
        const parts = first.split(/\s+/).filter(Boolean);
        const cmd = (parts[0] || '').toLowerCase();
        const args = parts.slice(1);
        if (cmd === '.doc' || cmd === '.doctor') sub = 'doctor';
        else if (cmd === '.ram') sub = 'ram';
        else if (cmd === '.bk' || cmd === '.backup') sub = 'backup';
        else if (cmd === '.heal' || cmd === '.health') {
            sub = (args[0] || '').toLowerCase();
            extraArg = args[1] || '';
        } else {
            sub = (args[0] || '').toLowerCase();
            extraArg = args[1] || '';
        }
    } else {
        const parts = first.split(/\s+/).filter(Boolean);
        sub = (parts[0] || '').toLowerCase();
        extraArg = parts[1] || '';
    }

    if (sub === 'doctor' || sub === 'doc' || sub === 'diag') {
        return sendHealerInteractiveCard(sock, chatId, message, runDoctorDiagnostic(), '10-POINT DOCTOR');
    }

    if (sub === 'ram' || sub === 'clean') {
        const res = await runMemoryGovernor(true);
        return safeSend(sock, chatId, {
            text: `🧹 *RAM, সেশন ও ক্যাশ ডিপ ক্লিন সম্পন্ন!*\n• বর্তমান RAM: *${res.rssMb} MB* | মুক্ত: \`${res.freedKb || 0} KB\`\n• সেশন ক্লিন: *${res.sessionPruned || 0}টি* | ভয়েস ক্যাশ ছাঁটা: *${res.voiceTrimmed || 0}টি*`
        }, { quoted: message });
    }

    if (sub === 'backup' || sub === 'bk') {
        if (!isSuperOwnerCaller(message, chatId)) {
            return safeSend(sock, chatId, { text: '🔐 ব্যাকআপ শুধু মূল Super Owner তৈরি করতে পারবেন।' }, { quoted: message });
        }
        if (String(chatId || '').endsWith('@g.us')) {
            return safeSend(sock, chatId, { text: '🔒 নিরাপত্তার জন্য ব্যাকআপ শুধু Bot Owner-এর ব্যক্তিগত ইনবক্সে পাঠানো যাবে।' }, { quoted: message });
        }
        await safeSend(sock, chatId, { text: '⏳ সুরক্ষিত Gzip ব্যাকআপ তৈরি হচ্ছে...' }, { quoted: message });
        try {
            const bk = await runFullBackup({ sendToWhatsApp: true, targetChatId: chatId });
            if (bk.targets.includes('WhatsApp')) {
                return safeSend(sock, chatId, {
                    text: `✅ *Backup WhatsApp-এ পাঠানো হয়েছে!*\n• ফাইল: \`${bk.fileName}\`\n• সাইজ: ${bk.sizeKb} KB\n• কপি: ${bk.targets.join(', ')}`
                }, { quoted: message });
            }
            return safeSend(sock, chatId, {
                text: `⚠️ *Local backup তৈরি হয়েছে, কিন্তু WhatsApp-এ পাঠানো যায়নি।*\n• ফাইল: \`${bk.fileName}\`\n• সাইজ: ${bk.sizeKb} KB\n• কপি: ${bk.targets.join(', ')}\nTelegram/Cloud backup চালু করতে BACKUP_TG_BOT_TOKEN + BACKUP_TG_CHAT_ID অথবা remote backup URL সেট করুন।`
            }, { quoted: message });
        } catch (error) {
            console.error('[SELF-HEALER] Manual backup failed:', error?.stack || error);
            return safeSend(sock, chatId, {
                text: `❌ *Backup তৈরি/পাঠানো যায়নি।*\nকারণ: ${String(error?.message || error).slice(0, 300)}`
            }, { quoted: message });
        }
    }

    if (sub === 'restore') {
        if (String(chatId || '').endsWith('@g.us')) {
            return safeSend(sock, chatId, { text: '🔒 নিরাপত্তার জন্য ব্যাকআপ রিস্টোর শুধু ব্যক্তিগত ইনবক্সে চালানো যাবে।' }, { quoted: message });
        }
        if (!isSuperOwnerCaller(message, chatId)) {
            return safeSend(sock, chatId, { text: '🔐 ব্যাকআপ রিস্টোর শুধু মূল *Super Owner* করতে পারবেন।' }, { quoted: message });
        }
        const res = restoreLatestBackup();
        return safeSend(sock, chatId, {
            text: res.ok
                ? `♻️ *ব্যাকআপ রিস্টোর সম্পন্ন!*\n• ফাইল: \`${res.fileName}\`\n• রিস্টোর হয়েছে: *${res.restoredCount}টি* ডেটা ফাইল (ক্যাশ রিফ্রেশ সম্পন্ন)\n• _পরিবর্তনগুলো পুরোপুরি লোড হতে বট একবার \`.rb\` দিয়ে রিস্টার্ট দাও।_`
                : `❌ ${res.error}`
        }, { quoted: message });
    }

    if (sub === 'verify' || sub === 'check') {
        const r = verifyAndSnapshotDataFiles();
        const s = scanAndPruneSessionBloat('manual');
        pruneInternalMaps();
        return safeSend(sock, chatId, {
            text: `🛡️ *সিস্টেম ইন্টিগ্রিটি চেক সম্পন্ন:*\n• যাচাইকৃত JSON: *${r.checked}টি*\n• অটো-রিকভারি: *${r.repaired}টি*\n• সেশন ও অরফান ক্লিন: *${r.cleanedOrphans + s.pruned}টি* (বাকি সেশন: *${s.totalFiles}টি*)`
        }, { quoted: message });
    }

    if (sub === 'mac' || sub === 'session') {
        const target = extraArg || '';
        if (!target) {
            return safeSend(sock, chatId, { text: '🩺 নিয়ম: `.heal mac 99206060572701` (লগআউট ছাড়াই ওই আইডির Bad MAC সেশন ফিক্স করবে)' }, { quoted: message });
        }
        const res = healSignalSessionById(target, 'Manual Heal');
        return safeSend(sock, chatId, {
            text: res.healed
                ? `✅ আইডি \`${extractBaseSignalId(target)}\`-এর ${res.removed}টি নষ্ট সেশন ফাইল রিসেট হয়েছে!`
                : `ℹ️ আইডি \`${extractBaseSignalId(target)}\`-এর কোনো নষ্ট সেশন ফাইল পাওয়া যায়নি।`
        }, { quoted: message });
    }

    if (sub === 'outbox' || sub === 'flush') {
        const flushed = await flushPendingOutbox();
        return safeSend(sock, chatId, {
            text: `📤 আউটবক্স ফ্লাশ সম্পন্ন: *${flushed}টি* ডেলিভারি হয়েছে (বাকি: ${pendingOutbox.length}টি)।`
        }, { quoted: message });
    }

    if (sub === 'logs' || sub === 'log') {
        const logs = healerState.recentActions.slice(-10).reverse();
        const txt = logs.length
            ? logs.map((l, i) => `${i + 1}. \`[${l.cat}]\` (${l.time}) — ${l.detail}`).join('\n')
            : '✅ এখনো কোনো এরর বা অটো-হিলিংয়ের প্রয়োজন পড়েনি।';
        return safeSend(sock, chatId, {
            text: `📋 *সেলফ-হিলার অ্যাকশন লগ (${logs.length}টি)*\n──────────────\n${txt}`
        }, { quoted: message });
    }

    return sendHealerInteractiveCard(sock, chatId, message, buildHealerReportText(), 'SRE HEALTH PANEL');
}

module.exports = {
    initSelfHealer,
    stopSelfHealer,
    purgeCredsSnapshots,
    healSignalSessionById,
    runMemoryGovernor,
    verifyAndSnapshotDataFiles,
    runFullBackup,
    restoreLatestBackup,
    enqueueFailedSend,
    flushPendingOutbox,
    recordSocketActivity,
    recordSocketDisconnect,
    getHealerStatus,
    buildHealerReportText,
    runDoctorDiagnostic,
    handleSelfHealerCommand
};
