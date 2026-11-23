/**
 * Mahiru Shiina • Mahiru v2.0 ULTRA — System Control, Concurrency Queue, Anti-Abuse & Master PIN Vault
 * Tuned for 256MB RAM (Bounded LRU Abuse Map, Cached Banner Buffer, Smart Priority Queue)
 * 100% Backward-Compatible Exports + Encrypted Master PIN (scrypt) + Live Zero-Code Branding Engine
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let settings = {};
try { settings = require('../settings'); } catch {}

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

const DATA_DIR = path.join(process.cwd(), 'data');
const CONTROL_FILE = path.join(DATA_DIR, 'maya_system_control.json');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const ALT_TMP_DIR = path.join(process.cwd(), 'tmp');

// গুরুত্বপূর্ণ সিকিউরিটি, অ্যাক্সেস ও SRE কমান্ড (ভুল করেও ব্লক করা যাবে না)
const PROTECTED_COMMANDS = new Set([
    '.maya', '.chatbot', '.cmd', '.clean', '.deepclean', '.summary', '.callblock',
    '.cb', '.sch', '.schedule', '.role', '.style', '.mode', '.guard',
    '.antiabuse', '.rules', '.block', '.unblock',
    '.addowner', '.delowner', '.ownerlist', '.owners', '.lockdown', '.unlockdown', '.owneralert',
    '.heal', '.hl', '.health', '.fx', '.fix', '.recover', '.doc', '.doctor', '.bk', '.backup',
    '.reload', '.maint', '.pin', '.setpin', '.brand', '.config'
]);

const COMMAND_ALIAS_GROUPS = [
    ['.play', '.song', '.music', '.mp3', '.ytmp3'],
    ['.video', '.ytmp4'],
    ['.tiktok', '.tt'],
    ['.instagram', '.insta', '.ig'],
    ['.fb', '.facebook'],
    ['.sticker', '.s'],
    ['.take', '.steal'],
    ['.delete', '.del'],
    ['.gpt', '.gemini'],
    ['.imagine', '.flux', '.dalle'],
    ['.translate', '.trt'],
    ['.ss', '.ssweb', '.screenshot'],
    ['.removebg', '.rmbg', '.nobg'],
    ['.remini', '.enhance', '.upscale'],
    ['.tourl', '.url'],
    ['.emojimix', '.emix'],
    ['.tg', '.stickertelegram', '.tgsticker', '.telesticker'],
    ['.ttt', '.tictactoe'],
    ['.goodnight', '.lovenight', '.gn'],
    ['.shayari', '.shayri'],
    ['.git', '.github', '.sc', '.script', '.repo'],
    ['.help', '.menu', '.bot', '.list'],
    ['.groupinfo', '.infogp', '.infogrupo'],
    ['.resetlink', '.revoke', '.anularlink'],
    ['.staff', '.admins', '.listadmin']
];

const optCfg = settings?.maya?.optimizer || {};
const RAM_WARN_MB = Number(optCfg.ramSoftLimitMb || 175);
const RAM_CRIT_MB = Math.min(Number(optCfg.ramCriticalLimitMb || 218), 220);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

function loadControl() {
    try {
        if (fs.existsSync(CONTROL_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8'));
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch {}
    return {};
}

const raw = loadControl();
let sysState = {
    version: '2.0',
    ownerTitle: raw.ownerTitle || 'বস',
    ownerCustomInstruction: raw.ownerCustomInstruction || '',
    ownerRules: Array.isArray(raw.ownerRules) ? raw.ownerRules : [],
    remoteAssetUrl: raw.remoteAssetUrl || (process.env.REMOTE_ASSET_URL || '').trim(),
    disabledCommands: raw.disabledCommands && typeof raw.disabledCommands === 'object' ? raw.disabledCommands : {},
    branding: {
        botName: raw?.branding?.botName || settings.botName || 'Mahiru Shiina',
        assistantName: raw?.branding?.assistantName || settings.assistantName || settings.botName || 'Mahiru Shiina',
        ownerName: raw?.branding?.ownerName || settings.ownerDisplayName || settings.botOwner || 'MSK',
        ownerWebsite: raw?.branding?.ownerWebsite || settings.ownerWebsite || '',
        packname: raw?.branding?.packname || settings.packname || 'Mahiru',
        author: raw?.branding?.author || settings.author || 'MSK',
        customBannerPath: raw?.branding?.customBannerPath || ''
    },
    masterPin: {
        salt: raw?.masterPin?.salt || '',
        hash: raw?.masterPin?.hash || '',
        updatedAt: Number(raw?.masterPin?.updatedAt || 0)
    },
    antiAbuse: {
        enabled: typeof raw?.antiAbuse?.enabled === 'boolean' ? raw.antiAbuse.enabled : true,
        action: ['off', 'block', 'warn_then_off', 'warn_then_block'].includes(raw?.antiAbuse?.action)
            ? raw.antiAbuse.action
            : 'warn_then_off',
        repeatLimit: Number(raw?.antiAbuse?.repeatLimit || 3),
        floodLimit: Number(raw?.antiAbuse?.floodLimit || 8),
        maxStrikes: Number(raw?.antiAbuse?.maxStrikes || 2)
    }
};

function saveControl() {
    let tmp = '';
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        tmp = `${CONTROL_FILE}.tmp-${unique}`;
        fs.writeFileSync(tmp, JSON.stringify(sysState, null, 2), 'utf8');
        fs.renameSync(tmp, CONTROL_FILE);
        return true;
    } catch (err) {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        console.error('SystemControl save error:', err?.message || err);
        return false;
    }
}

function syncBrandingToRuntime() {
    const b = sysState.branding;
    try {
        if (b.packname) global.packname = b.packname;
        if (b.author) global.author = b.author;
        if (b.ownerWebsite) global.channelLink = b.ownerWebsite;
        if (b.botName) global.botname = b.botName;
        if (settings && typeof settings === 'object') {
            if (b.botName) settings.botName = b.botName;
            if (b.assistantName) settings.assistantName = b.assistantName;
            if (b.ownerWebsite) settings.ownerWebsite = b.ownerWebsite;
            if (b.packname) settings.packname = b.packname;
            if (b.author) settings.author = b.author;
        }
    } catch {}
}

syncBrandingToRuntime();

// ==================================================
// ১. মাল্টি-ইউজার কনকারেন্সি ইঞ্জিন (Priority Lane + 256MB Backpressure Guard)
// ==================================================
const MAX_GLOBAL_WORKERS = 4;
const MAX_GLOBAL_WAITING = 35;
const MAX_PENDING_PER_CHAT = 5;
const TASK_TIMEOUT_MS = 40 * 1000;

let activeGlobalWorkers = 0;
let totalProcessedTasks = 0;
let totalTimedOutTasks = 0;
let totalDroppedTasks = 0;

const globalWaitQueue = []; // { priority, resolve }
const perChatQueues = new Map();
const perChatDepth = new Map();

function acquireGlobalSlot(priority = false) {
    if (activeGlobalWorkers < MAX_GLOBAL_WORKERS) {
        activeGlobalWorkers += 1;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const entry = { priority: Boolean(priority), resolve };
        if (priority) {
            // ওনার টাস্ক সব সাধারণ টাস্কের আগে ঢুকবে
            const idx = globalWaitQueue.findIndex((w) => !w.priority);
            if (idx === -1) globalWaitQueue.push(entry);
            else globalWaitQueue.splice(idx, 0, entry);
        } else {
            globalWaitQueue.push(entry);
        }
    });
}

function releaseGlobalSlot() {
    if (globalWaitQueue.length > 0) {
        const next = globalWaitQueue.shift();
        next.resolve();
    } else {
        activeGlobalWorkers = Math.max(0, activeGlobalWorkers - 1);
    }
}

function runWithTimeout(taskFn, timeoutMs = TASK_TIMEOUT_MS) {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('TASK_TIMEOUT')), timeoutMs);
        if (timer.unref) timer.unref();
    });
    return Promise.race([Promise.resolve().then(taskFn), timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function enqueueChatTask(chatKey, taskFn, { priority = false, timeoutMs = TASK_TIMEOUT_MS } = {}) {
    if (typeof taskFn !== 'function') return Promise.resolve();
    const key = String(chatKey || 'global');
    const currentDepth = perChatDepth.get(key) || 0;

    if (!priority && (currentDepth >= MAX_PENDING_PER_CHAT || globalWaitQueue.length >= MAX_GLOBAL_WAITING)) {
        totalDroppedTasks += 1;
        console.warn(`⚠️ Queue backpressure dropped task [${key}] (depth:${currentDepth}, wait:${globalWaitQueue.length})`);
        return Promise.resolve();
    }

    perChatDepth.set(key, currentDepth + 1);
    const prev = perChatQueues.get(key) || Promise.resolve();

    const next = prev
        .catch(() => {})
        .then(async () => {
            await acquireGlobalSlot(priority);
            let released = false;
            const safeRelease = () => {
                if (released) return;
                released = true;
                releaseGlobalSlot();
            };
            try {
                const res = await runWithTimeout(taskFn, timeoutMs);
                totalProcessedTasks += 1;
                return res;
            } catch (err) {
                if (err?.message === 'TASK_TIMEOUT') {
                    totalTimedOutTasks += 1;
                    console.error(`⏱️ Queue task timed out [${key}] (${timeoutMs}ms)`);
                } else {
                    console.error(`❌ Queue task error [${key}]:`, err?.message || err);
                }
            } finally {
                safeRelease();
            }
        });

    const cleanup = next.finally(() => {
        const rem = (perChatDepth.get(key) || 1) - 1;
        if (rem <= 0) perChatDepth.delete(key);
        else perChatDepth.set(key, rem);

        if (perChatQueues.get(key) === cleanup) perChatQueues.delete(key);
    });

    perChatQueues.set(key, cleanup);
    return cleanup;
}

function getQueueStats() {
    return {
        activeWorkers: activeGlobalWorkers,
        maxWorkers: MAX_GLOBAL_WORKERS,
        waitingGlobal: globalWaitQueue.length,
        activeChats: perChatQueues.size,
        processed: totalProcessedTasks,
        timedOut: totalTimedOutTasks,
        dropped: totalDroppedTasks
    };
}

function getSystemHealth() {
    const mem = process.memoryUsage();
    const rssMb = Number((mem.rss / (1024 * 1024)).toFixed(1));
    const heapMb = Number((mem.heapUsed / (1024 * 1024)).toFixed(1));
    const status = rssMb >= RAM_CRIT_MB ? '🔴 CRITICAL' : rssMb >= RAM_WARN_MB ? '🟡 HIGH' : '🟢 OPTIMAL';
    return { rssMb, heapMb, status };
}

// ==================================================
// ২. এনক্রিপ্টেড মাস্টার PIN ভল্ট (বড় পরিবর্তনের নিরাপত্তা)
// ==================================================
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
const PIN_UNLOCK_SESSION_MS = 10 * 60 * 1000;

const pinAttempts = new Map(); // actorId -> { count, lockedUntil }
const pinSessions = new Map(); // actorId -> expiresAt

function derivePinHash(pinStr, saltHex) {
    // 256MB RAM ফ্রেন্ডলি scrypt প্যারামিটার (~8MB, অতি নিরাপদ)
    return crypto.scryptSync(String(pinStr), Buffer.from(saltHex, 'hex'), 32, { N: 8192, r: 8, p: 1 }).toString('hex');
}

function hasMasterPin() {
    return Boolean(sysState.masterPin?.salt && sysState.masterPin?.hash);
}

function setMasterPin(newPin = '') {
    const clean = String(newPin || '').trim();
    if (clean.length < 4 || clean.length > 24) {
        return { ok: false, error: 'মাস্টার PIN অবশ্যই ৪ থেকে ২৪ অক্ষরের মধ্যে হতে হবে।' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = derivePinHash(clean, salt);
    sysState.masterPin = { salt, hash, updatedAt: Date.now() };
    pinAttempts.clear();
    pinSessions.clear();
    saveControl();
    return { ok: true };
}

function verifyMasterPin(pinInput = '', actorId = 'super_owner') {
    if (!hasMasterPin()) {
        return { ok: false, notSet: true, error: 'এখনো কোনো মাস্টার PIN সেট করা হয়নি। সেট করতে লিখুন: `.setpin <নতুন_পিন>`' };
    }

    const now = Date.now();
    const key = String(actorId || 'super_owner');
    const att = pinAttempts.get(key) || { count: 0, lockedUntil: 0 };

    if (att.lockedUntil > now) {
        const waitMin = Math.ceil((att.lockedUntil - now) / 60000);
        return { ok: false, locked: true, error: `🔒 একাধিক ভুল PIN দেওয়ায় *${waitMin} মিনিটের* জন্য লক করা হয়েছে।` };
    }

    const clean = String(pinInput || '').trim();
    if (!clean) return { ok: false, error: '❌ সঠিক মাস্টার PIN দিন।' };

    try {
        const computed = Buffer.from(derivePinHash(clean, sysState.masterPin.salt), 'hex');
        const stored = Buffer.from(sysState.masterPin.hash, 'hex');
        const matched = computed.length === stored.length && crypto.timingSafeEqual(computed, stored);

        if (matched) {
            pinAttempts.delete(key);
            const expiresAt = now + PIN_UNLOCK_SESSION_MS;
            pinSessions.set(key, expiresAt);
            if (pinSessions.size > 20) pinSessions.delete(pinSessions.keys().next().value);
            return { ok: true, unlockedUntil: expiresAt };
        }
    } catch {}

    att.count += 1;
    if (att.count >= PIN_MAX_ATTEMPTS) {
        att.lockedUntil = now + PIN_LOCKOUT_MS;
        att.count = 0;
        pinAttempts.set(key, att);
        return { ok: false, locked: true, error: '🚨 ৫ বার ভুল PIN! নিরাপত্তার জন্য ১৫ মিনিট লক করা হলো।' };
    }
    pinAttempts.set(key, att);
    return { ok: false, remaining: PIN_MAX_ATTEMPTS - att.count, error: `❌ ভুল PIN! আর *${PIN_MAX_ATTEMPTS - att.count} বার* সুযোগ বাকি।` };
}

function isPinSessionUnlocked(actorId = 'super_owner') {
    const exp = pinSessions.get(String(actorId || 'super_owner')) || 0;
    if (exp <= Date.now()) {
        pinSessions.delete(String(actorId || 'super_owner'));
        return false;
    }
    return true;
}

function lockPinSession(actorId = '') {
    if (actorId) pinSessions.delete(String(actorId));
    else pinSessions.clear();
}

function getMasterPinStatus(actorId = 'super_owner') {
    const unlocked = isPinSessionUnlocked(actorId);
    const exp = pinSessions.get(String(actorId || 'super_owner')) || 0;
    return {
        configured: hasMasterPin(),
        unlocked,
        remainingMin: unlocked ? Math.ceil((exp - Date.now()) / 60000) : 0,
        updatedAt: sysState.masterPin?.updatedAt || 0
    };
}

// ==================================================
// ৩. জিরো-কোড লাইভ ব্র্যান্ডিং ও আইডেন্টিটি কন্ট্রোল
// ==================================================
function getBotBranding() {
    return { ...sysState.branding };
}

function setBotBranding(updates = {}) {
    const b = sysState.branding;
    const changed = [];
    const setStr = (field, maxLen, label) => {
        if (typeof updates[field] === 'string' && updates[field].trim()) {
            b[field] = updates[field].trim().slice(0, maxLen);
            changed.push(label);
        }
    };

    setStr('botName', 40, 'বটের নাম');
    setStr('assistantName', 24, 'অ্যাসিস্ট্যান্ট নাম');
    setStr('ownerName', 40, 'ওনারের নাম');
    setStr('packname', 40, 'স্টিকার প্যাক');
    setStr('author', 40, 'অথর');

    if (typeof updates.ownerWebsite === 'string' && /^https?:\/\//i.test(updates.ownerWebsite.trim())) {
        b.ownerWebsite = updates.ownerWebsite.trim().replace(/\/+$/, '').slice(0, 140);
        changed.push('ওয়েবসাইট লিংক');
    }
    if (typeof updates.customBannerPath === 'string') {
        b.customBannerPath = updates.customBannerPath.trim().slice(0, 200);
        clearBannerCache();
        changed.push('ব্যানার ছবি');
    }

    if (changed.length) {
        saveControl();
        syncBrandingToRuntime();
    }
    return { branding: getBotBranding(), changed };
}

// ==================================================
// ৪. ইউনিভার্সাল কমান্ড কন্ট্রোল + অ্যালিয়াস রিজলভার
// ==================================================
function normalizeCmd(cmd = '') {
    let c = String(cmd || '').trim().toLowerCase();
    if (!c) return '';
    if (!c.startsWith('.')) c = `.${c}`;
    return c.split(/\s+/)[0];
}

function expandCommandAliases(commands = []) {
    const set = new Set();
    for (const rawCmd of commands) {
        const clean = normalizeCmd(rawCmd);
        if (!clean) continue;
        set.add(clean);
        for (const group of COMMAND_ALIAS_GROUPS) {
            if (group.includes(clean)) group.forEach((alias) => set.add(alias));
        }
    }
    return Array.from(set);
}

function setCommandsState(commands = [], enabled = false, scope = 'all', expandAliases = true) {
    const validScope = ['group', 'private', 'all'].includes(scope) ? scope : 'all';
    const finalList = expandAliases ? expandCommandAliases(commands) : commands.map(normalizeCmd);
    const updated = [];

    for (const cmd of finalList) {
        if (!cmd || PROTECTED_COMMANDS.has(cmd)) continue;

        if (enabled) {
            if (sysState.disabledCommands[cmd]) {
                const cur = sysState.disabledCommands[cmd].scope;
                if (validScope === 'all' || cur === validScope) delete sysState.disabledCommands[cmd];
                else if (cur === 'all') sysState.disabledCommands[cmd].scope = validScope === 'group' ? 'private' : 'group';
                updated.push(cmd);
            }
        } else {
            const existing = sysState.disabledCommands[cmd];
            if (existing && existing.scope !== validScope && existing.scope !== 'all') {
                sysState.disabledCommands[cmd] = { scope: 'all', updatedAt: Date.now() };
            } else {
                sysState.disabledCommands[cmd] = { scope: validScope, updatedAt: Date.now() };
            }
            updated.push(cmd);
        }
    }

    if (updated.length) saveControl();
    return updated;
}

function isCommandBlocked(cmd = '', isGroup = false) {
    const clean = normalizeCmd(cmd);
    if (!clean || PROTECTED_COMMANDS.has(clean)) return { blocked: false };
    const entry = sysState.disabledCommands[clean];
    if (!entry) return { blocked: false };
    if (entry.scope === 'all') return { blocked: true, scope: 'all' };
    if (entry.scope === 'group' && isGroup) return { blocked: true, scope: 'group' };
    if (entry.scope === 'private' && !isGroup) return { blocked: true, scope: 'private' };
    return { blocked: false };
}

function getDisabledCommands() { return sysState.disabledCommands; }

// ==================================================
// ৫. ওনার ডাকনাম ও স্থায়ী নিয়ম
// ==================================================
function getOwnerPrefs() {
    return {
        ownerTitle: sysState.ownerTitle || 'বস',
        ownerCustomInstruction: sysState.ownerCustomInstruction || ''
    };
}

function setOwnerPrefs({ ownerTitle, ownerCustomInstruction } = {}) {
    if (typeof ownerTitle === 'string' && ownerTitle.trim()) sysState.ownerTitle = ownerTitle.trim().slice(0, 30);
    if (typeof ownerCustomInstruction === 'string') sysState.ownerCustomInstruction = ownerCustomInstruction.trim().slice(0, 300);
    saveControl();
    return getOwnerPrefs();
}

function addOwnerRule(ruleText = '') {
    const clean = String(ruleText || '').trim().slice(0, 260);
    if (!clean) return null;
    const item = {
        id: 'R' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        rule: clean,
        createdAt: Date.now()
    };
    sysState.ownerRules.push(item);
    if (sysState.ownerRules.length > 30) sysState.ownerRules = sysState.ownerRules.slice(-30);
    saveControl();
    return item;
}

function removeOwnerRule(idOrIndex = '') {
    const token = String(idOrIndex || '').trim().toUpperCase();
    if (!token) return false;
    const before = sysState.ownerRules.length;
    const numIdx = parseInt(token, 10);
    if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= sysState.ownerRules.length) sysState.ownerRules.splice(numIdx - 1, 1);
    else sysState.ownerRules = sysState.ownerRules.filter((r) => r.id !== token);
    if (sysState.ownerRules.length < before) { saveControl(); return true; }
    return false;
}

function getOwnerRules() { return sysState.ownerRules || []; }
function clearOwnerRules() { sysState.ownerRules = []; saveControl(); }

// ==================================================
// ৬. বাউন্ডেড অ্যান্টি-অ্যাবিউজ ও স্প্যাম গার্ড (জিরো মেমোরি লিক)
// ==================================================
const MAX_ABUSE_TRACKER = 200;
const abuseTracker = new Map();
const TOXIC_PATTERNS = /(?:মাগি|খানকি|চুদ|চোদ|চোদা|মাদারচোদ|বাইনচোদ|ভোদাই|রেন্ডি|কুত্তার\s*বাচ্চা|হারামজাদা|শালা\s*কুত্তা|নটির|বেশ্যা|fuck\s*you|motherfucker|bitch|asshole|bastard|madarchod|bainchod|chudi|choda|khanki|magi|rendi|haramjada)/i;

function getAntiAbuseConfig() { return sysState.antiAbuse; }

function setAntiAbuseConfig(updates = {}) {
    if (typeof updates.enabled === 'boolean') sysState.antiAbuse.enabled = updates.enabled;
    if (['off', 'block', 'warn_then_off', 'warn_then_block'].includes(updates.action)) sysState.antiAbuse.action = updates.action;
    if (typeof updates.repeatLimit === 'number' && updates.repeatLimit >= 2 && updates.repeatLimit <= 10) sysState.antiAbuse.repeatLimit = Math.round(updates.repeatLimit);
    if (typeof updates.floodLimit === 'number' && updates.floodLimit >= 4 && updates.floodLimit <= 25) sysState.antiAbuse.floodLimit = Math.round(updates.floodLimit);
    if (typeof updates.maxStrikes === 'number' && updates.maxStrikes >= 1 && updates.maxStrikes <= 5) sysState.antiAbuse.maxStrikes = Math.round(updates.maxStrikes);
    saveControl();
    return sysState.antiAbuse;
}

function resetUserStrikes(chatKey) { abuseTracker.delete(chatKey); }

function pruneAbuseTracker(maxIdleMs = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [k, v] of abuseTracker.entries()) {
        const lastTouch = Math.max(v.lastSeenAt || 0, v.lastStrikeAt || 0);
        if (now - lastTouch > maxIdleMs) abuseTracker.delete(k);
    }
    while (abuseTracker.size > MAX_ABUSE_TRACKER) {
        abuseTracker.delete(abuseTracker.keys().next().value);
    }
}

function evaluateMessageAbuse(chatKey, text = '') {
    const cfg = sysState.antiAbuse;
    if (!cfg.enabled) return { triggered: false };

    const clean = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
    if (!clean) return { triggered: false };

    const now = Date.now();
    let record = abuseTracker.get(chatKey);
    if (!record) {
        if (abuseTracker.size >= MAX_ABUSE_TRACKER) {
            abuseTracker.delete(abuseTracker.keys().next().value);
        }
        record = { recent: [], strikes: 0, lastStrikeAt: 0, lastSeenAt: now };
    } else {
        abuseTracker.delete(chatKey); // LRU রিফ্রেশ
    }
    record.lastSeenAt = now;

    if (record.lastStrikeAt && now - record.lastStrikeAt > 30 * 60 * 1000) record.strikes = 0;

    record.recent = record.recent.filter((item) => now - item.ts < 2 * 60 * 1000);
    record.recent.push({ text: clean, ts: now });
    if (record.recent.length > 15) record.recent = record.recent.slice(-15);

    let reason = '';
    if (TOXIC_PATTERNS.test(clean)) {
        reason = 'অশ্লীল/উল্টাপাল্টা ভাষা ব্যবহার';
    } else if (clean.length >= 2) {
        const sameCount = record.recent.filter((item) => item.text === clean).length;
        if (sameCount >= cfg.repeatLimit) reason = `একই মেসেজ বারবার (${sameCount} বার) স্প্যাম করা`;
    }
    if (!reason) {
        const rapidCount = record.recent.filter((item) => now - item.ts < 20 * 1000).length;
        if (rapidCount >= cfg.floodLimit) reason = `অতিরিক্ত মেসেজ ফ্লাড (${rapidCount}টি/২০ সেকেন্ড)`;
    }

    if (!reason) {
        abuseTracker.set(chatKey, record);
        return { triggered: false };
    }

    record.strikes += 1;
    record.lastStrikeAt = now;
    record.recent = [];
    abuseTracker.set(chatKey, record);

    const actionMode = cfg.action;
    if (actionMode === 'block') return { triggered: true, decision: 'block', reason, strikes: record.strikes };
    if (actionMode === 'off') return { triggered: true, decision: 'off', reason, strikes: record.strikes };
    if (record.strikes < cfg.maxStrikes) return { triggered: true, decision: 'warn', reason, strikes: record.strikes, maxStrikes: cfg.maxStrikes };
    return { triggered: true, decision: actionMode === 'warn_then_block' ? 'block' : 'off', reason, strikes: record.strikes };
}

// ==================================================
// ৭. ক্যাশড ব্যানার বাফার ও ২৫৬MB-টিউনড সেফ অটো-ক্লিনার
// ==================================================
const MAX_BANNER_BYTES = 512 * 1024; // ৫১২KB থাম্বনেইল ক্যাপ (২৫৬MB RAM সাশ্রয়ী)
let cachedRemoteThumb = null;
let cachedRemoteThumbAt = 0;
let remoteFetchInFlight = false;
let lastRemoteFetchFailAt = 0;

let cachedLocalThumb = null;
let cachedLocalThumbSig = '';

function clearBannerCache() {
    cachedRemoteThumb = null;
    cachedRemoteThumbAt = 0;
    cachedLocalThumb = null;
    cachedLocalThumbSig = '';
}

function getRemoteStorageUrl() { return sysState.remoteAssetUrl || ''; }

function setRemoteStorageUrl(url = '') {
    sysState.remoteAssetUrl = String(url || '').trim().replace(/\/+$/, '');
    clearBannerCache();
    lastRemoteFetchFailAt = 0;
    saveControl();
    if (sysState.remoteAssetUrl) preloadRemoteThumb().catch(() => {});
    return sysState.remoteAssetUrl;
}

async function preloadRemoteThumb() {
    const base = getRemoteStorageUrl();
    if (!base || remoteFetchInFlight) return cachedRemoteThumb;
    if (Date.now() - lastRemoteFetchFailAt < 10 * 60 * 1000) return null;

    remoteFetchInFlight = true;
    try {
        const targetUrl = /\.(jpg|jpeg|png|webp)$/i.test(base) ? base : `${base}/banner.jpg`;
        const res = await fetch(targetUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            lastRemoteFetchFailAt = Date.now();
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length <= MAX_BANNER_BYTES) {
            cachedRemoteThumb = buf;
            cachedRemoteThumbAt = Date.now();
            return buf;
        }
    } catch {
        lastRemoteFetchFailAt = Date.now();
    } finally {
        remoteFetchInFlight = false;
    }
    return null;
}

function getCachedBannerBuffer() {
    if (cachedRemoteThumb && Date.now() - cachedRemoteThumbAt < 60 * 60 * 1000) return cachedRemoteThumb;
    if (getRemoteStorageUrl() && !remoteFetchInFlight && Date.now() - lastRemoteFetchFailAt >= 10 * 60 * 1000) {
        preloadRemoteThumb().catch(() => {});
    }

    const candidates = [
        sysState.branding?.customBannerPath,
        path.join(process.cwd(), 'assets', 'banner.jpg'),
        path.join(process.cwd(), 'assets', 'bot_image.jpg'),
        path.join(process.cwd(), 'assets', 'logo.jpg')
    ].filter(Boolean);

    for (const p of candidates) {
        try {
            const st = fs.lstatSync(p);
            if (!st.isFile() || st.isSymbolicLink() || st.size === 0 || st.size > MAX_BANNER_BYTES) continue;
            const sig = `${p}:${st.mtimeMs}:${st.size}`;
            if (cachedLocalThumb && cachedLocalThumbSig === sig) return cachedLocalThumb;
            cachedLocalThumb = fs.readFileSync(p);
            cachedLocalThumbSig = sig;
            return cachedLocalThumb;
        } catch {}
    }
    return null;
}

let cleanerTimer = null;

function cleanDirectoryFiles(dirPath, maxAgeMs, onlyTmpPattern = false) {
    let removedCount = 0;
    let freedBytes = 0;
    if (!fs.existsSync(dirPath)) return { removedCount, freedBytes };

    try {
        const now = Date.now();
        for (const file of fs.readdirSync(dirPath)) {
            if (file === '.gitkeep' || file === '.keep') continue;
            if (onlyTmpPattern && !/\.tmp(?:[.-]|$)/i.test(file)) continue;
            const fullPath = path.join(dirPath, file);
            try {
                const st = fs.lstatSync(fullPath);
                if (st.isFile() && !st.isSymbolicLink() && (now - st.mtimeMs) >= maxAgeMs) {
                    fs.unlinkSync(fullPath);
                    removedCount += 1;
                    freedBytes += st.size;
                }
            } catch {}
        }
    } catch {}
    return { removedCount, freedBytes };
}

function runSafeCleanup(maxAgeInput = 15 * 60 * 1000) {
    // ইউনিট-সেফ নরম্যালাইজেশন: 1..1440 দিলে মিনিট হিসেবে ধরে নেবে (selfHealer কম্প্যাটিবিলিটি ফিক্স)
    const rawNum = Number(maxAgeInput);
    const maxAgeMs = (!Number.isFinite(rawNum) || rawNum <= 0)
        ? 0
        : (rawNum <= 1440 ? rawNum * 60 * 1000 : rawNum);

    const r1 = cleanDirectoryFiles(TEMP_DIR, maxAgeMs, false);
    const r2 = cleanDirectoryFiles(ALT_TMP_DIR, maxAgeMs, false);
    const r3 = cleanDirectoryFiles(DATA_DIR, Math.max(maxAgeMs, 5 * 60 * 1000), true);

    const removedCount = r1.removedCount + r2.removedCount + r3.removedCount;
    const freedBytes = r1.freedBytes + r2.freedBytes + r3.freedBytes;

    pruneAbuseTracker(maxAgeMs === 0 ? 15 * 60 * 1000 : 30 * 60 * 1000);

    // মেয়াদোত্তীর্ণ PIN সেশন পরিষ্কার
    const now = Date.now();
    for (const [k, exp] of pinSessions.entries()) {
        if (exp <= now) pinSessions.delete(k);
    }

    if (typeof global.gc === 'function') {
        try { global.gc(); } catch {}
    }
    return { removedCount, freedKb: (freedBytes / 1024).toFixed(1) };
}

function startSafeAutoCleaner() {
    if (cleanerTimer) return;
    preloadRemoteThumb().catch(() => {});
    runSafeCleanup(10 * 60 * 1000);

    cleanerTimer = setInterval(() => {
        const { rssMb } = getSystemHealth();
        const ageMs = rssMb >= RAM_WARN_MB ? 2 * 60 * 1000 : 15 * 60 * 1000;
        const res = runSafeCleanup(ageMs);
        if (rssMb >= RAM_CRIT_MB) clearBannerCache();
        if (res.removedCount > 0 || rssMb >= RAM_WARN_MB) {
            console.log(`🧹 Mahiru v2.0 Auto-Cleaner: ${res.removedCount} files (${res.freedKb} KB) | RAM: ${rssMb} MB`);
        }
    }, 15 * 60 * 1000);
    if (cleanerTimer.unref) cleanerTimer.unref();
}

function stopSafeAutoCleaner() {
    if (cleanerTimer) {
        clearInterval(cleanerTimer);
        cleanerTimer = null;
    }
}

if (typeof registerCleanupHook === 'function') {
    registerCleanupHook('systemControl', () => {
        pruneAbuseTracker(15 * 60 * 1000);
        clearBannerCache();
    });
}

module.exports = {
    PROTECTED_COMMANDS,
    COMMAND_ALIAS_GROUPS,
    enqueueChatTask,
    getQueueStats,
    getSystemHealth,
    setCommandsState,
    isCommandBlocked,
    getDisabledCommands,
    getOwnerPrefs,
    setOwnerPrefs,
    addOwnerRule,
    removeOwnerRule,
    getOwnerRules,
    clearOwnerRules,
    getAntiAbuseConfig,
    setAntiAbuseConfig,
    evaluateMessageAbuse,
    resetUserStrikes,
    getRemoteStorageUrl,
    setRemoteStorageUrl,
    preloadRemoteThumb,
    getCachedBannerBuffer,
    clearBannerCache,
    runSafeCleanup,
    startSafeAutoCleaner,
    stopSafeAutoCleaner,
    // নতুন এন্টারপ্রাইজ এক্সপোর্ট (মাস্টার PIN ও জিরো-কোড লাইভ ব্র্যান্ডিং)
    getBotBranding,
    setBotBranding,
    hasMasterPin,
    setMasterPin,
    verifyMasterPin,
    isPinSessionUnlocked,
    lockPinSession,
    getMasterPinStatus
};
