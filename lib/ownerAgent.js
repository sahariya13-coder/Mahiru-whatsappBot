/**
 * PRIME MONIR • Maya v3.0 ULTRA — Natural Language Voice/Text Owner Agent & Zero-Code Control Center
 * Tuned for 256MB-356MB Cloud RAM (Zero-Allocation Contact/Group Scan, Bounded Tasks/Choices, Compact Atomic JSON)
 * Upgraded: Bangla↔English Phonetic Contact Matcher (হুমায়রা ↔ Humayra), Group (@g.us) Support + Owner Lock Sync,
 * Contact De-duplication, Own-Bot Filter, @lid Phone Guard & main.js handleOwnerDotCommand Bridge
 * 100% Backward-Compatible Exports
 */

const fs = require('fs');
const path = require('path');

let settings = null;
try { settings = require('../settings'); } catch {}

let systemOptimizer = null;
try { systemOptimizer = require('./systemOptimizer'); } catch {}

let systemControl = null;
try { systemControl = require('./systemControl'); } catch {}

let chatQueue = null;
try { chatQueue = require('./chatQueue'); } catch {}

let langGuard = null;
try { langGuard = require('./langGuard'); } catch {}

let voiceEngine = null;
try { voiceEngine = require('./voiceEngine'); } catch {}

let aiOrchestrator = null;
try { aiOrchestrator = require('./aiOrchestrator'); } catch {}

let memoryEngine = null;
try { memoryEngine = require('./memoryEngine'); } catch {}

let knowledgeEngine = null;
try { knowledgeEngine = require('./knowledgeEngine'); } catch {}

let dynamicCommands = null;
try { dynamicCommands = require('./dynamicCommands'); } catch {}

let styleLearner = null;
try { styleLearner = require('./styleLearner'); } catch {}

let privacyFirewall = null;
try { privacyFirewall = require('./privacyFirewall'); } catch {}

let userGroupLib = null;
try { userGroupLib = require('./index'); } catch {}

let lightweightStore = null;
try { lightweightStore = require('./lightweight_store'); } catch {}

const oaCfg = settings?.maya?.ownerAgent || {};

const DEFAULT_CONFIG = {
    tasksFile: './data/owner_tasks.json',
    schedulerPollMs: Number(oaCfg.schedulerPollMs || 15 * 1000),
    disambiguationTtlMs: Number(oaCfg.disambiguationTtlMs || 3 * 60 * 1000),
    maxActionsPerCommand: Number(oaCfg.maxActionsPerCommand || 4),
    maxScheduledTasks: 50,
    maxPendingChoices: 15,
    taskSendTimeoutMs: 15 * 1000
};

const BN_NUM_MAP = Object.freeze({
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
});

const BN_WORD_TO_NUM = Object.freeze({
    'এক': 1, '১': 1, '1': 1, 'প্রথম': 1, 'first': 1, 'one': 1,
    'দুই': 2, '২': 2, '2': 2, 'দ্বিতীয়': 2, 'second': 2, 'two': 2,
    'তিন': 3, '৩': 3, '3': 3, 'তৃতীয়': 3, 'third': 3, 'three': 3,
    'চার': 4, '৪': 4, '4': 4, 'চতুর্থ': 4, 'fourth': 4, 'four': 4,
    'পাঁচ': 5, '৫': 5, '5': 5, 'পঞ্চম': 5, 'fifth': 5, 'five': 5
});

const CANCEL_CHOICE_RE = /^(?:বাতিল|বাদ\s*দাও|থাক|দরকার\s*নাই|না|cancel|stop|no|nevermind)[!.\s]*$/i;

const OWNER_DOT_COMMANDS = new Set([
    'health', 'status', 'st', 'rp', 'report', 'clean', 'deepclean',
    'voice', 'vc', 'lang', 'ln', 'style',
    'bot', 'cb', 'pause', 'resume', 'inboxes', 'offlist', 'ol', 'leads', 'ld',
    'kb', 'knowledge', 'model', 'ai', 'memory', 'forget', 'tasks', 'remind',
    'send', 'alias', 'mayahelp', 'ownerhelp',
    'dcmd', 'trigger', 'brand', 'setpin', 'pin', 'lockpin',
    'firewall', 'fw', 'styleinfo', 'stylereset', 'orule'
]);

const VOICE_MODE_ALIASES = Object.freeze({
    on: 'on', 'চালু': 'on', 'অন': 'on', enable: 'on', true: 'on',
    off: 'off', 'বন্ধ': 'off', 'অফ': 'off', disable: 'off', false: 'off',
    auto: 'auto', 'অটো': 'auto', smart: 'auto'
});

const LANG_MODE_ALIASES = Object.freeze({
    auto: 'auto', 'অটো': 'auto',
    bn: 'bn', bangla: 'bn', bengali: 'bn', 'বাংলা': 'bn',
    banglish: 'banglish', 'বাংলিশ': 'banglish',
    en: 'en', english: 'en', 'ইংরেজি': 'en', 'ইংলিশ': 'en'
});

const STYLE_ALIASES = Object.freeze({
    auto: 'auto', 'অটো': 'auto',
    apni: 'apni', 'আপনি': 'apni', formal: 'apni',
    tumi: 'tumi', 'তুমি': 'tumi', friendly: 'tumi',
    tui: 'tui', 'তুই': 'tui', casual: 'tui'
});

// বাংলা -> ফোনেটিক ল্যাটিন ম্যাপ (হুমায়রা ↔ Humayra, রিফাত ↔ Rifat, মনির ↔ Monir)
const BN_TO_LATIN_MAP = Object.freeze({
    'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri',
    'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
    'চ': 'ch', 'ছ': 'ch', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
    'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
    'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
    'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
    'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '',
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri',
    'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', '্': ''
});

// বাংলা ক্যানোনিকাল নরম্যালাইজার (Unicode NFC-তে ভেঙে যাওয়া য়/ড়/ঢ় অক্ষত রাখে)
function normalizeBn(str = '') {
    return String(str || '')
        .normalize('NFC')
        .replace(/\u09AF\u09BC/g, '\u09DF')
        .replace(/\u09A1\u09BC/g, '\u09DC')
        .replace(/\u09A2\u09BC/g, '\u09DD');
}

function toEnglishDigits(str = '') {
    return normalizeBn(str).replace(/[০-৯]/g, (d) => BN_NUM_MAP[d] || d);
}

// @lid কখনোই ফোন নম্বর হিসেবে পার্স হবে না
function normalizePhone(raw = '') {
    const str = String(raw || '').trim();
    if (!str || str.toLowerCase().includes('@lid')) return '';
    if (typeof settings?.normalizePhone === 'function') {
        const res = settings.normalizePhone(toEnglishDigits(str));
        if (res) return res;
    }
    const cleaned = toEnglishDigits(str).split('@')[0].split(':')[0].replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.length === 11 && cleaned.startsWith('01')) return `88${cleaned}`;
    if (cleaned.length === 10 && /^1[3-9]/.test(cleaned)) return `880${cleaned}`;
    if (cleaned.startsWith('00880')) return cleaned.slice(2);
    return (cleaned.length >= 10 && cleaned.length <= 15) ? cleaned : '';
}

function stripDeviceJid(jid = '') {
    const s = String(jid || '').trim().toLowerCase();
    if (!s) return '';
    const at = s.indexOf('@');
    if (at === -1) return s.split(':')[0];
    return `${s.slice(0, at).split(':')[0]}@${s.slice(at + 1)}`;
}

function isOwnBotTarget(jid = '', phone = '') {
    if (typeof settings?.isOwnBotJid === 'function') {
        if (settings.isOwnBotJid(jid) || (phone && settings.isOwnBotJid(phone))) return true;
    }
    return false;
}

function isHardBlockedTarget(jid = '', phone = '') {
    if (typeof settings?.isBlockedSudoJid === 'function') {
        if (settings.isBlockedSudoJid(jid, phone)) return true;
    }
    return false;
}

// লাইটওয়েট বাংলা-ইংরেজি ফোনেটিক কী (জিরো ডিপেন্ডেন্সি, ২৫৬MB RAM-সেফ)
function toPhoneticKey(text = '') {
    const norm = normalizeBn(text).toLowerCase();
    let out = '';
    for (let i = 0; i < norm.length; i++) {
        const ch = norm[i];
        if (BN_TO_LATIN_MAP[ch] !== undefined) {
            out += BN_TO_LATIN_MAP[ch];
        } else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === ' ') {
            out += ch;
        } else {
            out += ' ';
        }
    }
    // সমোচ্চারিত অক্ষর একীভূতকরণ (ph->f, bh->v, sh->s, ee/oo->i/u, y->i, ডাবল লেটার কমানো)
    return out
        .replace(/ph/g, 'f')
        .replace(/bh/g, 'b')
        .replace(/kh/g, 'k')
        .replace(/gh/g, 'g')
        .replace(/th/g, 't')
        .replace(/dh/g, 'd')
        .replace(/sh/g, 's')
        .replace(/ch/g, 'c')
        .replace(/ee/g, 'i')
        .replace(/oo/g, 'u')
        .replace(/y/g, 'i')
        .replace(/z/g, 'j')
        .replace(/w/g, 'o')
        .replace(/([a-z])\1+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

// হালকা ১-ডি এডিট ডিস্ট্যান্স (টাইপো যেমন Baypass ↔ Bypass ধরার জন্য)
function editDistBounded(a = '', b = '', maxDist = 2) {
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > maxDist) return maxDist + 1;
    if (!m) return n;
    if (!n) return m;
    let prev = new Uint8Array(n + 1);
    let curr = new Uint8Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        let rowMin = i;
        const ca = a.charCodeAt(i - 1);
        for (let j = 1; j <= n; j++) {
            const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1));
            curr[j] = v;
            if (v < rowMin) rowMin = v;
        }
        if (rowMin > maxDist) return maxDist + 1;
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

// নাম/গ্রুপ ম্যাচিং স্কোরার (ডাইরেক্ট + ফোনেটিক + টাইপো-টলারেন্ট)
function scoreNameMatch(queryRaw = '', candidateRaw = '') {
    const q = normalizeBn(queryRaw).trim().toLowerCase();
    const c = normalizeBn(candidateRaw).trim().toLowerCase();
    if (!q || !c) return 0;
    if (c === q) return 100;
    if (c.startsWith(q)) return 90;
    if (c.includes(q)) return 80;

    const qPh = toPhoneticKey(q);
    const cPh = toPhoneticKey(c);
    if (!qPh || qPh.length < 2 || !cPh) return 0;

    if (cPh === qPh) return 95;
    if (cPh.startsWith(qPh)) return 85;
    if (cPh.includes(qPh)) return 75;

    // কনসোনেন্ট-স্কেলেটন ও টোকেন ফাজি ম্যাচ (হুমায়রা [humaira] ↔ Humayra [humaira], Baypass ↔ Bypass)
    const qTokens = qPh.split(' ').filter((t) => t.length >= 2);
    const cTokens = cPh.split(' ').filter((t) => t.length >= 2);
    if (!qTokens.length || !cTokens.length) return 0;

    let matchedTokens = 0;
    for (const qt of qTokens) {
        const hit = cTokens.some((ct) => {
            if (ct === qt || ct.startsWith(qt) || qt.startsWith(ct)) return true;
            const maxD = qt.length >= 5 ? 2 : 1;
            return editDistBounded(qt, ct, maxD) <= maxD;
        });
        if (hit) matchedTokens++;
    }

    if (matchedTokens === qTokens.length) return 72;
    if (matchedTokens > 0 && matchedTokens / qTokens.length >= 0.6) return 60;
    return 0;
}

function clampMinutes(val, fallback = 0, min = 0, max = 43200) {
    const n = Number(toEnglishDigits(String(val ?? '')));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeVoiceMode(val = '') {
    return VOICE_MODE_ALIASES[normalizeBn(val).trim().toLowerCase()] || '';
}

function normalizeLangMode(val = '') {
    return LANG_MODE_ALIASES[normalizeBn(val).trim().toLowerCase()] || '';
}

function normalizeStyleMode(val = '') {
    return STYLE_ALIASES[normalizeBn(val).trim().toLowerCase()] || '';
}

function getLiveBrand() {
    const ver = String(settings?.version || '3.0.0-ULTRA').replace(/^v/i, '');
    try {
        if (typeof systemControl?.getBotBranding === 'function') {
            const b = systemControl.getBotBranding();
            return {
                botName: b.botName || settings?.botName || 'Mahiru Shiina',
                assistantName: b.assistantName || settings?.assistantName || 'Mahiru',
                ownerName: b.ownerName || settings?.ownerDisplayName || settings?.botOwner || 'MSK',
                ownerWebsite: b.ownerWebsite || settings?.ownerWebsite || '',
                packname: b.packname || settings?.packname || 'Mahiru',
                version: ver
            };
        }
    } catch {}
    return {
        botName: settings?.botName || 'Mahiru Shiina',
        assistantName: settings?.assistantName || 'Mahiru',
        ownerName: settings?.ownerDisplayName || settings?.botOwner || 'MSK',
        ownerWebsite: settings?.ownerWebsite || '',
        packname: settings?.packname || 'Mahiru',
        version: ver
    };
}

function withTimeout(promise, ms, label = 'timeout') {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
        if (timer.unref) timer.unref();
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function atomicWriteJson(filePath, data, compact = true) {
    let tmp = '';
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 5)}`;
        fs.writeFileSync(tmp, compact ? JSON.stringify(data) : JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, filePath);
        return true;
    } catch {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        return false;
    }
}

function safeReadJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) return fallback;
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function formatDhakaClock(ts) {
    try {
        return new Date(ts).toLocaleString('bn-BD', {
            timeZone: 'Asia/Dhaka',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
        });
    } catch {
        return new Date(ts).toISOString();
    }
}

function checkIsSuperOwner(senderId = '', chatId = '', sock = null) {
    if (isHardBlockedTarget(senderId, chatId)) return false;
    if (sock?.user) {
        const botNum = normalizePhone(sock.user.id || '');
        const botLid = String(sock.user.lid || '').split(':')[0].toLowerCase();
        const sNum = normalizePhone(senderId || chatId);
        const sLid = String(senderId || chatId || '').split(':')[0].toLowerCase();
        if (botNum && sNum && botNum === sNum) return true;
        if (botLid && sLid && sLid.includes('@lid') && sLid.startsWith(botLid)) return true;
    }
    if (typeof global.__PRIME_IS_SUPER_OWNER__ === 'function') {
        try {
            if (global.__PRIME_IS_SUPER_OWNER__(senderId, null)) return true;
        } catch {}
    }
    if (typeof settings?.isSuperOwnerJid === 'function') {
        try {
            if (settings.isSuperOwnerJid(senderId) || (chatId && !chatId.endsWith('@g.us') && settings.isSuperOwnerJid(chatId))) {
                return true;
            }
        } catch {}
    }
    return false;
}

function getMainDynamicOwnerApi() {
    try {
        const mainPath = require.resolve('../main');
        return require.cache[mainPath]?.exports || null;
    } catch {
        return null;
    }
}

function getMayaCoreLazy() {
    try {
        const corePath = require.resolve('./mayaCore');
        return require.cache[corePath]?.exports || require('./mayaCore');
    } catch {
        return null;
    }
}

class OwnerAgent {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };
        this.tasks = [];
        this.pendingChoices = new Map();
        this.schedulerTimer = null;
        this.bootTimer = null;
        this.activeSockRef = null;
        this.activeSafeSendRef = null;
        this.isPollingTasks = false;

        this.metrics = {
            commandsHandled: 0,
            aiPlannedCommands: 0,
            fastPathCommands: 0,
            dotCommands: 0,
            messagesSentForOwner: 0,
            tasksScheduled: 0,
            tasksExecuted: 0
        };

        this.loadTasks();

        if (systemOptimizer?.registerCleanupHook) {
            systemOptimizer.registerCleanupHook('ownerAgent', () => this.sweepPendingChoices());
        }

        process.once('beforeExit', () => this.saveTasks());
        global.ownerAgent = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    // =========================================================================
    // ১. পারসিস্টেন্ট শিডিউলার (২৫৬MB RAM সেফ + কম্প্যাক্ট স্টোরেজ + টাইমআউট গার্ড)
    // =========================================================================

    loadTasks() {
        const loaded = safeReadJson(this.config.tasksFile, []);
        this.tasks = Array.isArray(loaded) ? loaded.slice(-this.config.maxScheduledTasks) : [];
    }

    saveTasks() {
        if (this.tasks.length > this.config.maxScheduledTasks) {
            const pending = this.tasks.filter((t) => t.status === 'pending');
            const others = this.tasks.filter((t) => t.status !== 'pending');
            const keepOthers = Math.max(0, this.config.maxScheduledTasks - pending.length);
            this.tasks = [...others.slice(-keepOthers), ...pending.slice(-this.config.maxScheduledTasks)];
        }
        return atomicWriteJson(this.config.tasksFile, this.tasks, true);
    }

    startScheduler(sock, safeSendFn = null) {
        this.activeSockRef = sock;
        this.activeSafeSendRef = safeSendFn;
        this.stopScheduler();

        this.bootTimer = setTimeout(() => {
            this.bootTimer = null;
            this.pollScheduledTasks().catch(() => {});
        }, 3000);
        if (this.bootTimer.unref) this.bootTimer.unref();

        this.schedulerTimer = setInterval(() => {
            this.pollScheduledTasks().catch(() => {});
        }, this.config.schedulerPollMs);
        if (this.schedulerTimer.unref) this.schedulerTimer.unref();
    }

    stopScheduler() {
        if (this.bootTimer) {
            clearTimeout(this.bootTimer);
            this.bootTimer = null;
        }
        if (this.schedulerTimer) {
            clearInterval(this.schedulerTimer);
            this.schedulerTimer = null;
        }
    }

    async sendRaw(sock, safeSendFn, jid, payload) {
        if (!jid) throw new Error('missing_target_jid');
        const runner = typeof safeSendFn === 'function'
            ? safeSendFn(sock, jid, payload)
            : (sock && typeof sock.sendMessage === 'function' ? sock.sendMessage(jid, payload) : null);
        if (!runner) throw new Error('socket_unavailable');
        return await withTimeout(runner, this.config.taskSendTimeoutMs, 'send_timeout');
    }

    async pollScheduledTasks() {
        if (this.isPollingTasks || !this.activeSockRef) return;
        const now = Date.now();
        const due = this.tasks.filter((t) => t.status === 'pending' && t.runAt <= now);
        if (!due.length) return;

        this.isPollingTasks = true;
        let mutated = false;
        const brand = getLiveBrand();

        try {
            for (const task of due) {
                try {
                    if (task.kind === 'reminder') {
                        await this.sendRaw(this.activeSockRef, this.activeSafeSendRef, task.targetJid, {
                            text: `⏰ *${brand.botName} • রিমাইন্ডার*\n──────────────────\n${task.message}`
                        });
                    } else if (task.sendAsVoice && voiceEngine?.synthesizeVoice) {
                        const tts = await withTimeout(
                            voiceEngine.synthesizeVoice(task.message, { chatId: task.targetJid }),
                            this.config.taskSendTimeoutMs,
                            'tts_timeout'
                        ).catch(() => null);

                        if (tts?.ok && tts.buffer) {
                            await this.sendRaw(this.activeSockRef, this.activeSafeSendRef, task.targetJid, {
                                audio: tts.buffer,
                                mimetype: tts.mimetype,
                                ptt: true
                            });
                        } else {
                            await this.sendRaw(this.activeSockRef, this.activeSafeSendRef, task.targetJid, { text: task.message });
                        }
                    } else {
                        await this.sendRaw(this.activeSockRef, this.activeSafeSendRef, task.targetJid, { text: task.message });
                    }

                    task.status = 'done';
                    task.executedAt = Date.now();
                    this.metrics.tasksExecuted++;
                    mutated = true;

                    if (task.kind === 'message' && task.ownerJid && task.ownerJid !== task.targetJid) {
                        await this.sendRaw(this.activeSockRef, this.activeSafeSendRef, task.ownerJid, {
                            text: `✅ শিডিউল্ড মেসেজ পাঠানো হয়েছে -> *${task.targetName}*\n_"${task.message.slice(0, 120)}"_`
                        }).catch(() => {});
                    }
                } catch (err) {
                    task.retries = (task.retries || 0) + 1;
                    if (task.retries >= 3) {
                        task.status = 'failed';
                        task.error = String(err?.message || 'send_failed').slice(0, 60);
                    } else {
                        task.runAt = Date.now() + 60 * 1000;
                    }
                    mutated = true;
                }
            }
        } finally {
            const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
            const before = this.tasks.length;
            this.tasks = this.tasks.filter((t) => t.status === 'pending' || (t.executedAt || t.createdAt || 0) > cutoff);
            if (mutated || this.tasks.length !== before) this.saveTasks();
            this.isPollingTasks = false;
        }
    }

    // =========================================================================
    // ২. ইন্টারেক্টিভ কনফার্মেশন ("১" বা "২" + চেইন অ্যাকশন কন্টিনিউয়েশন)
    // =========================================================================

    sweepPendingChoices() {
        const now = Date.now();
        for (const [key, item] of this.pendingChoices.entries()) {
            if (item.expiresAt <= now) this.pendingChoices.delete(key);
        }
    }

    async handlePendingDisambiguation(ctx) {
        const pending = this.pendingChoices.get(ctx.chatId);
        if (!pending) return null;

        if (pending.expiresAt <= Date.now()) {
            this.pendingChoices.delete(ctx.chatId);
            return null;
        }

        const clean = toEnglishDigits(ctx.text).trim().toLowerCase();
        if (CANCEL_CHOICE_RE.test(clean)) {
            this.pendingChoices.delete(ctx.chatId);
            return { handled: true, reply: 'ঠিক আছে বস, কাজটা বাতিল করে দিলাম।' };
        }

        const stripped = clean.replace(/(?:নম্বর|নাম্বার|টা|number|no\.?|option)/gi, '').trim();
        const choiceNum = BN_WORD_TO_NUM[stripped] || (/^\d+$/.test(stripped) ? Number(stripped) : 0);

        if (choiceNum >= 1 && choiceNum <= pending.matches.length) {
            const chosen = pending.matches[choiceNum - 1];
            this.pendingChoices.delete(ctx.chatId);

            const queue = [
                { ...pending.action, resolvedTarget: chosen },
                ...(Array.isArray(pending.remainingActions) ? pending.remainingActions.map((rem) => {
                    const t = normalizeBn(rem.target || '').trim().toLowerCase();
                    const orig = normalizeBn(pending.originalQuery || '').trim().toLowerCase();
                    if (!t || t === orig || /^(?:ওকে|তাকে|ওর|তার|him|her|them|same)$/i.test(t)) {
                        return { ...rem, resolvedTarget: chosen };
                    }
                    return rem;
                }) : [])
            ];

            const replies = [];
            let executed = 0;
            for (let i = 0; i < queue.length; i++) {
                const res = await this.executeSingleAction(queue[i], ctx, queue.slice(i + 1));
                if (res?.message) replies.push(res.message);
                if (res?.ok) executed++;
                if (res?.needsChoice) break;
            }
            return { handled: true, reply: replies.join('\n\n'), actionsExecuted: executed };
        }

        return null;
    }

    // =========================================================================
    // ৩. ফোনেটিক (বাংলা↔ইংরেজি) + গ্রুপ-অ্যাওয়্যার + ডি-ডুপ্লিকেটেড টার্গেট রিজল্ভার
    // =========================================================================

    _dedupeCandidates(candidates = []) {
        const byKey = new Map();
        for (const item of candidates) {
            if (!item || !item.chatId) continue;
            const phone = normalizePhone(item.phone || item.chatId);
            if (isOwnBotTarget(item.chatId, phone)) continue;

            const dedupeKey = item.chatId.endsWith('@g.us')
                ? stripDeviceJid(item.chatId)
                : (phone ? `ph:${phone}` : stripDeviceJid(item.chatId));

            const prev = byKey.get(dedupeKey);
            if (!prev || (item.score || 0) > (prev.score || 0)) {
                byKey.set(dedupeKey, {
                    chatId: item.chatId,
                    name: item.name || (phone ? `+${phone}` : item.chatId.split('@')[0]),
                    phone,
                    isGroup: item.chatId.endsWith('@g.us'),
                    score: item.score || 0
                });
            }
        }
        return Array.from(byKey.values()).sort((a, b) => b.score - a.score).slice(0, 5);
    }

    _searchGroupCandidates(query = '', ctx = {}) {
        const cleanedQ = normalizeBn(query).replace(/\b(?:group|গ্রুপ|গ্রুপে|গ্রুপের)\b/gi, '').trim() || query;
        const found = [];
        const chatSources = [
            ctx.sock?.store?.chats,
            lightweightStore?.chats
        ].filter(Boolean);

        const pushIfMatch = (jid, subject) => {
            if (!jid || !String(jid).endsWith('@g.us') || !subject) return;
            const sc = Math.max(scoreNameMatch(query, subject), scoreNameMatch(cleanedQ, subject));
            if (sc >= 60) {
                found.push({ chatId: jid, name: subject, phone: '', isGroup: true, score: sc });
            }
        };

        for (const src of chatSources) {
            if (src instanceof Map) {
                for (const [jid, c] of src.entries()) {
                    pushIfMatch(jid, c?.name || c?.subject || '');
                }
            } else if (typeof src === 'object') {
                for (const jid in src) {
                    const c = src[jid];
                    pushIfMatch(jid, c?.name || c?.subject || '');
                }
            }
        }

        // memoryEngine-এ সেভ থাকা গ্রুপ প্রোফাইলও চেক করা হয়
        try {
            const profiles = memoryEngine?.listProfiles?.() || memoryEngine?.getAllProfiles?.() || [];
            const arr = Array.isArray(profiles) ? profiles : Object.values(profiles || {});
            for (const p of arr) {
                const jid = String(p?.chatId || p?.jid || '');
                if (!jid.endsWith('@g.us')) continue;
                pushIfMatch(jid, p?.alias || p?.name || p?.pushName || '');
            }
        } catch {}

        return this._dedupeCandidates(found);
    }

    resolveActionTarget(targetQuery = '', ctx = {}, { allowGroups = true } = {}) {
        const raw = normalizeBn(targetQuery).trim();
        const lower = raw.toLowerCase();

        if (!raw || /^(?:this|here|current|এই\s*চ্যাট|এই\s*ইনবক্স|এখানে|এই\s*গ্রুপ)$/i.test(lower)) {
            if (ctx.quotedJid && raw === '') {
                const qp = memoryEngine?.getProfile?.(ctx.quotedJid);
                return {
                    status: 'ok',
                    target: {
                        chatId: ctx.quotedJid,
                        name: memoryEngine?.getDisplayName?.(qp) || ctx.quotedJid.split('@')[0],
                        phone: qp?.phone || normalizePhone(ctx.quotedJid),
                        isGroup: String(ctx.quotedJid).endsWith('@g.us')
                    }
                };
            }
            const cp = memoryEngine?.getProfile?.(ctx.chatId);
            return {
                status: 'ok',
                target: {
                    chatId: ctx.chatId,
                    name: memoryEngine?.getDisplayName?.(cp) || 'এই চ্যাট',
                    phone: cp?.phone || normalizePhone(ctx.chatId),
                    isGroup: String(ctx.chatId).endsWith('@g.us')
                }
            };
        }

        if (/^(?:me|self|owner|আমাকে|নিজেকে|আমার)$/i.test(lower)) {
            const selfTarget = ctx.actorJid || ctx.ownerJid || ctx.chatId;
            const oJid = memoryEngine?.normalizeChatId ? memoryEngine.normalizeChatId(selfTarget) : selfTarget;
            return {
                status: 'ok',
                target: { chatId: oJid, name: 'নিজে', phone: normalizePhone(oJid), isGroup: false }
            };
        }

        // ১. সরাসরি গ্রুপ JID দিলে
        if (raw.endsWith('@g.us')) {
            return {
                status: 'ok',
                target: { chatId: raw, name: raw.split('@')[0], phone: '', isGroup: true }
            };
        }

        // ২. কোয়েরিতে "গ্রুপ / group" থাকলে আগে গ্রুপ লিস্টে খুঁজবে
        const wantsGroup = allowGroups && /(?:group|গ্রুপ|গ্রুপে|গ্রুপের)/i.test(raw);
        if (wantsGroup) {
            const grpMatches = this._searchGroupCandidates(raw, ctx);
            if (grpMatches.length === 1) return { status: 'ok', target: grpMatches[0] };
            if (grpMatches.length > 1) return { status: 'ambiguous', query: raw, matches: grpMatches };
        }

        // ৩. সরাসরি ফোন নম্বর দিলে
        const directPhone = normalizePhone(raw);
        if (directPhone && directPhone.length >= 11 && /^\+?[\d০-৯\s-]+$/.test(raw)) {
            const jid = `${directPhone}@s.whatsapp.net`;
            const c = ctx.sock?.contacts?.[jid] || ctx.sock?.store?.contacts?.[jid] || lightweightStore?.contacts?.[jid];
            return {
                status: 'ok',
                target: {
                    chatId: jid,
                    name: c?.name || c?.notify || `+${directPhone}`,
                    phone: directPhone,
                    isGroup: false
                }
            };
        }

        // ৪. সমন্বিত কন্টাক্ট সার্চ (memoryEngine + sock.contacts + lightweightStore) — বাংলা↔ইংরেজি ফোনেটিকসহ
        const collected = [];

        if (memoryEngine?.resolveContact) {
            const res = memoryEngine.resolveContact(raw, { maxResults: 5 });
            if (res?.found) {
                const list = res.ambiguous ? res.matches : [res.best];
                for (const m of list) {
                    if (m?.chatId) collected.push({ ...m, score: 92 });
                }
            }
        }

        // memoryEngine প্রোফাইলগুলোতে ফোনেটিক ম্যাচ (হুমায়রা ↔ Humayra)
        try {
            const profiles = memoryEngine?.listProfiles?.() || memoryEngine?.getAllProfiles?.() || [];
            const arr = Array.isArray(profiles) ? profiles : Object.values(profiles || {});
            for (const p of arr) {
                const jid = String(p?.chatId || p?.jid || '');
                if (!jid || jid.endsWith('@g.us')) continue;
                const labels = [p?.alias, p?.name, p?.pushName, ...(Array.isArray(p?.aliases) ? p.aliases : [])].filter(Boolean);
                let bestSc = 0;
                for (const lb of labels) {
                    const sc = scoreNameMatch(raw, lb);
                    if (sc > bestSc) bestSc = sc;
                }
                if (bestSc >= 65) {
                    collected.push({
                        chatId: jid,
                        name: p?.alias || p?.name || p?.pushName || jid.split('@')[0],
                        phone: normalizePhone(p?.phone || jid),
                        score: bestSc
                    });
                }
            }
        } catch {}

        // sock.contacts, sock.store.contacts এবং lightweightStore.contacts স্ক্যান
        const buckets = [ctx.sock?.contacts, ctx.sock?.store?.contacts, lightweightStore?.contacts].filter(Boolean);
        if (buckets.length && lower.length >= 2) {
            for (const bucket of buckets) {
                for (const jid in bucket) {
                    if (!jid || jid.endsWith('@g.us')) continue;
                    const c = bucket[jid];
                    const label = normalizeBn(c?.name || c?.notify || c?.verifiedName || '').trim();
                    if (!label) continue;
                    const sc = scoreNameMatch(raw, label);
                    if (sc >= 65) {
                        collected.push({
                            chatId: jid,
                            name: label,
                            phone: normalizePhone(c?.phoneNumber || jid),
                            score: sc
                        });
                    }
                }
            }
        }

        const deduped = this._dedupeCandidates(collected);
        if (deduped.length === 1) return { status: 'ok', target: deduped[0] };
        if (deduped.length > 1) {
            // শীর্ষ ম্যাচের স্কোর দ্বিতীয়টির চেয়ে অনেক বেশি হলে সরাসরি বেছে নেওয়া
            if ((deduped[0].score - deduped[1].score) >= 18) {
                return { status: 'ok', target: deduped[0] };
            }
            return { status: 'ambiguous', query: raw, matches: deduped };
        }

        // ৫. ব্যক্তিগত কন্টাক্টে না পেলে গ্রুপে ফলব্যাক সার্চ
        if (allowGroups && !wantsGroup) {
            const grpFallback = this._searchGroupCandidates(raw, ctx);
            if (grpFallback.length === 1) return { status: 'ok', target: grpFallback[0] };
            if (grpFallback.length > 1) return { status: 'ambiguous', query: raw, matches: grpFallback };
        }

        return { status: 'not_found', query: raw };
    }

    // =========================================================================
    // ৪. ডট কমান্ড পার্সার (সব কোর + এন্টারপ্রাইজ নো-কোড/PIN/ব্র্যান্ডিং কমান্ড)
    // =========================================================================

    parseDotCommand(text = '') {
        const raw = normalizeBn(text).trim();
        if (!raw || !/^[./!]/.test(raw)) return null;

        const body = raw.slice(1).trim();
        if (!body) return null;

        const parts = body.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const rest = body.slice(parts[0].length).trim();
        const args = parts.slice(1);

        if (!OWNER_DOT_COMMANDS.has(cmd)) return null;

        switch (cmd) {
            case 'health':
            case 'status':
            case 'st':
                return [{ tool: 'system_health' }];
            case 'clean':
            case 'deepclean':
                return [{ tool: 'deep_clean' }];
            case 'inboxes':
            case 'offlist':
            case 'ol':
            case 'rp':
            case 'report':
                return [{ tool: 'inbox_status', filter: 'all' }];
            case 'pause': {
                const firstNum = parseInt(toEnglishDigits(args[0] || ''), 10);
                const hasExplicitMin = Number.isFinite(firstNum) && firstNum > 0;
                const target = hasExplicitMin ? args.slice(1).join(' ') : rest;
                return [{ tool: 'chat_bot_control', mode: 'pause', minutes: hasExplicitMin ? clampMinutes(firstNum, 30, 1, 1440) : 30, target }];
            }
            case 'resume':
                return [{ tool: 'chat_bot_control', mode: 'resume', target: rest }];
            case 'bot':
            case 'cb': {
                const sub = (args[0] || '').toLowerCase();
                if (['on', 'off', 'চালু', 'বন্ধ', 'অন', 'অফ'].includes(sub)) {
                    const isOn = ['on', 'চালু', 'অন'].includes(sub);
                    const target = args.slice(1).join(' ');
                    if (['all', 'সব', 'সকল'].includes(target.toLowerCase())) {
                        return [{ tool: 'bulk_inbox_control', scope: 'bot', mode: isOn ? 'on' : 'off' }];
                    }
                    if (target.toLowerCase() === 'global') {
                        return [{ tool: 'global_bot_control', enabled: isOn }];
                    }
                    return [{ tool: 'chat_bot_control', mode: isOn ? 'on' : 'off', target }];
                }
                return [{ tool: 'inbox_status', filter: 'bot' }];
            }
            case 'voice':
            case 'vc': {
                const sub = (args[0] || '').toLowerCase();
                if (!sub || sub === 'status' || sub === 'list') {
                    return [{ tool: 'inbox_status', filter: 'voice' }];
                }
                if (sub === 'voices' || sub === 'names') {
                    return [{ tool: 'voice_control', scope: 'list_voices' }];
                }
                if (sub === 'global' && args[1]) {
                    return [{ tool: 'voice_control', scope: 'global', mode: normalizeVoiceMode(args[1]) || args[1] }];
                }
                if (sub === 'name' && args[1]) {
                    return [{ tool: 'voice_control', scope: 'voice_name', voiceName: args[1] }];
                }
                const normMode = normalizeVoiceMode(sub);
                if (normMode) {
                    const target = args.slice(1).join(' ');
                    if (['all', 'সব', 'global'].includes(target.toLowerCase())) {
                        return [{ tool: 'voice_control', scope: 'global', mode: normMode }];
                    }
                    return [{ tool: 'voice_control', scope: 'chat', mode: normMode, target }];
                }
                return [{ tool: 'inbox_status', filter: 'voice' }];
            }
            case 'lang':
            case 'ln': {
                const mode = args[0] || '';
                const target = args.slice(1).join(' ');
                if (!mode || mode === 'list') return [{ tool: 'inbox_status', filter: 'lang' }];
                const normLang = normalizeLangMode(mode) || mode;
                if (target.toLowerCase() === 'global') return [{ tool: 'lang_control', scope: 'global', mode: normLang }];
                return [{ tool: 'lang_control', scope: 'chat', mode: normLang, target }];
            }
            case 'style': {
                const style = args[0] || '';
                const target = args.slice(1).join(' ');
                if (!style) return [{ tool: 'inbox_status', filter: 'lang' }];
                const normStyle = normalizeStyleMode(style) || style;
                if (target.toLowerCase() === 'global') return [{ tool: 'style_control', scope: 'global', style: normStyle }];
                return [{ tool: 'style_control', scope: 'chat', style: normStyle, target }];
            }
            case 'model':
            case 'ai': {
                const prov = (args[0] || '').toLowerCase();
                if (!prov || prov === 'status') return [{ tool: 'system_health' }];
                if (['refresh', 'discover'].includes(prov)) return [{ tool: 'ai_control', action: 'discover' }];
                if (['reload', 'reset', 'sync'].includes(prov)) return [{ tool: 'ai_control', action: 'reload_keys' }];
                return [{ tool: 'ai_control', action: 'set_provider', provider: prov, modelName: args[1] || '' }];
            }
            case 'leads':
            case 'ld': {
                const sub = (args[0] || 'recent').toLowerCase();
                if (sub === 'done' && args[1]) return [{ tool: 'leads_control', action: 'mark_done', leadId: args[1] }];
                return [{ tool: 'leads_control', action: 'list', filter: ['today', 'new', '24h'].includes(sub) ? sub : 'recent' }];
            }
            case 'kb':
            case 'knowledge': {
                const sub = (args[0] || 'list').toLowerCase();
                if (sub === 'list') return [{ tool: 'knowledge_control', action: 'list' }];
                if (['del', 'delete', 'remove'].includes(sub) && args[1]) {
                    return [{ tool: 'knowledge_control', action: 'remove', idOrTitle: args.slice(1).join(' ') }];
                }
                if (sub === 'add' && args.length >= 2) {
                    const payload = args.slice(1).join(' ');
                    const [titlePart, ...contentParts] = payload.split('|');
                    return [{
                        tool: 'knowledge_control',
                        action: 'add',
                        title: contentParts.length ? titlePart.trim() : '',
                        content: contentParts.length ? contentParts.join('|').trim() : payload.trim()
                    }];
                }
                return [{ tool: 'knowledge_control', action: 'list' }];
            }
            case 'memory':
                return [{ tool: 'memory_control', action: 'view', target: rest }];
            case 'forget':
                return [{ tool: 'memory_control', action: 'forget', target: rest }];
            case 'tasks': {
                const sub = (args[0] || '').toLowerCase();
                if (['cancel', 'del', 'delete', 'rm', 'remove'].includes(sub) && args[1]) {
                    return [{ tool: 'tasks_control', action: 'cancel', taskId: args[1] }];
                }
                return [{ tool: 'tasks_control', action: 'list' }];
            }
            case 'remind': {
                if (!args.length) return [{ tool: 'tasks_control', action: 'list' }];
                const timeToken = toEnglishDigits(args[0]).toLowerCase();
                const mMatch = timeToken.match(/^(\d+)(m|min|h|hr|d)?$/);
                let delayMinutes = 10;
                let msgBody = rest;
                if (mMatch) {
                    const val = parseInt(mMatch[1], 10);
                    const unit = mMatch[2] || 'm';
                    delayMinutes = unit.startsWith('h') ? val * 60 : unit.startsWith('d') ? val * 1440 : val;
                    msgBody = args.slice(1).join(' ').trim();
                }
                return [{ tool: 'schedule_reminder', delayMinutes: clampMinutes(delayMinutes, 10, 1, 43200), message: msgBody }];
            }
            case 'send': {
                if (args.length >= 2) {
                    return [{ tool: 'send_message', target: args[0], message: args.slice(1).join(' '), delayMinutes: 0 }];
                }
                return null;
            }
            case 'alias': {
                if (args.length >= 2) {
                    return [{ tool: 'save_alias', target: args[0], alias: args.slice(1).join(' ') }];
                }
                return null;
            }
            case 'setpin':
                return [{ tool: 'pin_control', action: 'set', pin: args[0] || '' }];
            case 'pin':
                return [{ tool: 'pin_control', action: args[0] ? 'unlock' : 'status', pin: args[0] || '' }];
            case 'lockpin':
                return [{ tool: 'pin_control', action: 'lock' }];
            case 'brand': {
                const field = (args[0] || 'status').toLowerCase();
                const value = args.slice(1).join(' ').trim();
                return [{ tool: 'branding_control', field, value }];
            }
            case 'dcmd': {
                const sub = (args[0] || 'list').toLowerCase();
                if (sub === 'list') return [{ tool: 'dynamic_command_control', action: 'list' }];
                if (['del', 'delete', 'rm', 'remove'].includes(sub) && args[1]) {
                    return [{ tool: 'dynamic_command_control', action: 'delete', name: args[1] }];
                }
                if (['on', 'off'].includes(sub) && args[1]) {
                    return [{ tool: 'dynamic_command_control', action: 'toggle', name: args[1], enabled: sub === 'on' }];
                }
                if (['add', 'ai'].includes(sub) && args[1]) {
                    const payload = args.slice(1).join(' ');
                    const [cmdPart, ...bodyParts] = payload.split('|');
                    return [{
                        tool: 'dynamic_command_control',
                        action: 'create',
                        name: cmdPart.trim(),
                        type: sub === 'ai' ? 'ai' : 'text',
                        reply: sub === 'ai' ? '' : bodyParts.join('|').trim(),
                        aiPrompt: sub === 'ai' ? bodyParts.join('|').trim() : ''
                    }];
                }
                return [{ tool: 'dynamic_command_control', action: 'list' }];
            }
            case 'trigger': {
                const sub = (args[0] || 'list').toLowerCase();
                if (sub === 'list') return [{ tool: 'auto_trigger_control', action: 'list' }];
                if (['del', 'delete', 'rm', 'remove'].includes(sub) && args[1]) {
                    return [{ tool: 'auto_trigger_control', action: 'delete', idOrKeyword: args.slice(1).join(' ') }];
                }
                if (sub === 'add' && args.length >= 2) {
                    const [kwPart, ...repParts] = args.slice(1).join(' ').split('|');
                    return [{
                        tool: 'auto_trigger_control',
                        action: 'create',
                        keyword: kwPart.trim(),
                        reply: repParts.join('|').trim()
                    }];
                }
                return [{ tool: 'auto_trigger_control', action: 'list' }];
            }
            case 'firewall':
            case 'fw':
                return [{ tool: 'firewall_control', action: args[0] === 'reset' && args[1] ? 'reset' : 'status', target: args[1] || '' }];
            case 'styleinfo':
                return [{ tool: 'style_learner_control', action: 'report' }];
            case 'stylereset':
                return [{ tool: 'style_learner_control', action: 'reset', scope: args[0] || 'all' }];
            case 'orule': {
                const sub = (args[0] || 'list').toLowerCase();
                if (sub === 'list') return [{ tool: 'system_rules_control', action: 'list' }];
                if (['del', 'delete', 'rm'].includes(sub) && args[1]) {
                    return [{ tool: 'system_rules_control', action: 'remove', id: args[1] }];
                }
                if (sub === 'add' && args[1]) {
                    return [{ tool: 'system_rules_control', action: 'add', rule: args.slice(1).join(' ') }];
                }
                return [{ tool: 'system_rules_control', action: 'list' }];
            }
            case 'mayahelp':
            case 'ownerhelp':
                return [{ tool: 'owner_help' }];
            default:
                return null;
        }
    }

    // =========================================================================
    // ৫. জিরো-লেটেন্সি ফাস্ট-পাথ (০ms — API কোটা ও RAM সাশ্রয়ী + ক্যানোনিকাল বাংলা)
    // =========================================================================

    tryFastNaturalParse(text = '') {
        const raw = normalizeBn(text).trim();
        if (!raw || raw.length > 180) return null;

        if (/(?:কয়টা|কতগুলো|কোন\s*কোন|কার\s*কার).*(?:ইনবক্স|চ্যাট|গ্রুপ).*(?:ভয়েস|ভয়েস|বট|মায়া|মায়া).*(?:অফ|বন্ধ|পজ)/i.test(raw) ||
            /(?:ভয়েস|ভয়েস|বট|মায়া|মায়া).*(?:অফ|বন্ধ|পজ).*(?:কয়টা|কতগুলো|লিস্ট|তালিকা|দেখাও)/i.test(raw) ||
            /ইনবক্সের\s*অবস্থা\s*(?:কি|কী)/i.test(raw)) {
            const hasVoice = /ভয়েস|ভয়েস|voice/i.test(raw);
            const hasBot = /বট|মায়া|মায়া|bot|maya|রিপ্লাই|ইনবক্স/i.test(raw);
            return [{ tool: 'inbox_status', filter: hasVoice && hasBot ? 'all' : hasVoice ? 'voice' : 'bot' }];
        }

        if (/^(?:সেশন|টেম্প|ক্যাশ|ফাইল|সার্ভার|জঞ্জাল|সব\s*ক্যাশ)\s*(?:ডিপ\s*)?(?:ক্লিন|পরিষ্কার|সাফ)\s*(?:করো|কর|করে\s*দাও|দাও)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'deep_clean' }];
        }

        if (/^(?:সার্ভার|বটের|সিস্টেম|মায়ার|মায়ার)\s*(?:হেলথ|স্ট্যাটাস|র‍্যাম|র্যাম|রিপোর্ট|অবস্থা)\s*(?:দেখাও|বলো|বল|চেক\s*করো)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'system_health' }];
        }

        if (/^(?:সব\s*)?(?:এপিআই|api)\s*(?:রিলোড|রিফ্রেশ|রিসেট|স্ক্যান)\s*(?:করো|কর|করে\s*দাও|দাও)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'ai_control', action: 'reload_keys' }];
        }

        if (/^(?:ফায়ারওয়াল|সিকিউরিটি|প্রাইভেসি)\s*(?:স্ট্যাটাস|রিপোর্ট)?\s*(?:দেখাও|বলো|বল|চেক)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'firewall_control', action: 'status' }];
        }

        if (/^(?:স্টাইল|লার্নিং|ট্রেনিং|ডিএনএ|dna)\s*(?:রিপোর্ট|স্ট্যাটাস)?\s*(?:দেখাও|বলো|বল)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'style_learner_control', action: 'report' }];
        }

        if (/^(?:ডায়নামিক\s*)?কমান্ড\s*(?:লিস্ট|তালিকা)\s*(?:দেখাও|বলো|বল)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'dynamic_command_control', action: 'list' }];
        }

        if (/^(?:অটো\s*)?ট্রিগার\s*(?:লিস্ট|তালিকা)\s*(?:দেখাও|বলো|বল)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'auto_trigger_control', action: 'list' }];
        }

        if (/^(?:ব্র্যান্ডিং|বটের\s*তথ্য|আইডেন্টিটি)\s*(?:দেখাও|বলো|বল)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'branding_control', field: 'status' }];
        }

        if (/^(?:মাস্টার\s*)?পিন\s*লক\s*(?:করো|কর|করে\s*দাও)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'pin_control', action: 'lock' }];
        }

        if (/(?:সব|সকল)\s*(?:বন্ধ|অফ|পজ)\s*(?:ইনবক্সে?|চ্যাটে?).*(?:বট|মায়া|মায়া)\s*(?:অন|চালু|রিজিউম)\s*(?:করো|কর|করে\s*দাও)/i.test(raw)) {
            return [{ tool: 'bulk_inbox_control', scope: 'bot', mode: 'on' }];
        }

        const gVoice = raw.match(/^(?:গ্লোবাল\s*)?(?:ভয়েস|ভয়েস|voice)\s*(?:গ্লোবালি\s*)?(অটো|অন|অফ|চালু|বন্ধ|auto|on|off)\s*(?:করো|কর|করে\s*দাও|রাখো)?[!?.।\s]*$/i);
        if (gVoice) {
            const mode = normalizeVoiceMode(gVoice[1]);
            if (mode) return [{ tool: 'voice_control', scope: 'global', mode }];
        }

        const remMatch = toEnglishDigits(raw).match(/^(\d+)\s*(মিনিট|ঘণ্টা|ঘন্টা|min|h|hr)\s*(?:পর|পরে)\s*(?:মনে\s*করিয়ে|মনে\s*করিয়ে|রিমাইন্ডার|remind)\s*(?:দাও|দিও|করো|করে\s*দিও)?[:\s-]*(.+)$/i);
        if (remMatch && remMatch[3].trim()) {
            const num = parseInt(remMatch[1], 10);
            const isHr = /^(ঘ|h)/i.test(remMatch[2]);
            return [{ tool: 'schedule_reminder', delayMinutes: clampMinutes(isHr ? num * 60 : num, 10, 1, 43200), message: remMatch[3].trim() }];
        }

        if (/^(?:আজকের\s*)?(?:লিড|কাস্টমার)\s*(?:লিস্ট|তালিকা|রিপোর্ট)?\s*(?:দেখাও|বলো|বল)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'leads_control', action: 'list', filter: /আজকের/.test(raw) ? 'today' : 'recent' }];
        }

        if (/^(?:পেন্ডিং|শিডিউল|রিমাইন্ডার)\s*(?:টাস্ক|মেসেজ)?\s*(?:লিস্ট|তালিকা)?\s*(?:দেখাও|বলো|বল)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'tasks_control', action: 'list' }];
        }

        if (/^(?:ওনার\s*কমান্ড|কমান্ড\s*লিস্ট|তুমি\s*কী\s*কী\s*কন্ট্রোল\s*করতে\s*পারো)[!?.।\s]*$/i.test(raw)) {
            return [{ tool: 'owner_help' }];
        }

        return null;
    }

    // =========================================================================
    // ৬. AI মাল্টি-অ্যাকশন JSON প্ল্যানার (২৩টি টুল + ডায়াগনস্টিক সেফটি গার্ড)
    // =========================================================================

    async planWithAI(text = '', ctx = {}) {
        if (!aiOrchestrator?.generateJSON) return null;

        const brand = getLiveBrand();
        const plannerSystem = `You are the Owner Command Planner for "${brand.botName} • ${brand.assistantName} v${brand.version}" WhatsApp Bot.
The authenticated OWNER gave a voice or text instruction in Bangla, Banglish, or English.
If it is JUST casual chatting, OR a troubleshooting/debugging question asking WHY something happened ("কেন রিপ্লাই দিচ্ছো না", "এটা চেক করো কেন বট অন হয়ে যাচ্ছে"), return: {"isOwnerCommand": false, "actions": []}
NEVER turn off or toggle a chat/contact when the owner is only asking to investigate or explain a bug!
Otherwise return ONLY valid JSON: {"isOwnerCommand": true, "actions": [ ...1 to 4 tool objects... ]}

Tools:
1. {"tool":"inbox_status","filter":"all"|"bot"|"voice"|"lang"}
2. {"tool":"chat_bot_control","mode":"on"|"off"|"pause"|"resume","target":"<contact or group name/phone/'current'>","minutes":30}
3. {"tool":"bulk_inbox_control","scope":"bot"|"voice","mode":"on"|"off"|"auto"}
4. {"tool":"global_bot_control","enabled":true|false}
5. {"tool":"voice_control","scope":"global"|"chat"|"voice_name"|"list_voices","mode":"on"|"off"|"auto","target":"<name/phone/'current'>","voiceName":"Aoede"|"Kore"|"Zephyr"|"Leda"}
6. {"tool":"lang_control","scope":"global"|"chat","mode":"auto"|"bn"|"banglish"|"en","target":"<name/phone/'current'>"}
7. {"tool":"style_control","scope":"global"|"chat","style":"auto"|"apni"|"tumi"|"tui","target":"<name/phone/'current'>"}
8. {"tool":"send_message","target":"<contact or group name or phone>","message":"<clean message>","sendAsVoice":false,"delayMinutes":0}
9. {"tool":"schedule_reminder","message":"<reminder text>","delayMinutes":10}
10. {"tool":"deep_clean"} | {"tool":"system_health"}
11. {"tool":"ai_control","action":"set_provider"|"discover"|"reload_keys","provider":"auto"|"gemini"|"groq"|"openrouter","modelName":""}
12. {"tool":"leads_control","action":"list"|"mark_done","filter":"recent"|"today"|"new","leadId":""}
13. {"tool":"knowledge_control","action":"list"|"add"|"remove","category":"services"|"pricing"|"apps"|"general","title":"","content":"","url":"","idOrTitle":""}
14. {"tool":"memory_control","action":"view"|"forget","target":"<name/phone/'current'>"}
15. {"tool":"save_alias","target":"<phone or name>","alias":"<nickname>"}
16. {"tool":"tasks_control","action":"list"|"cancel","taskId":""}
17. {"tool":"dynamic_owner_control","action":"grant"|"revoke"|"list"|"lockdown"|"unlockdown","target":"<name or phone>","durationMinutes":0}
18. {"tool":"dynamic_command_control","action":"create"|"delete"|"toggle"|"list","name":".cmd","type":"text"|"ai"|"macro","reply":"","aiPrompt":"","macroActions":[],"scope":"all"|"private"|"group","ownerOnly":false,"enabled":true}
19. {"tool":"auto_trigger_control","action":"create"|"delete"|"list","keyword":"","reply":"","scope":"private"|"group"|"all","idOrKeyword":""}
20. {"tool":"branding_control","field":"status"|"bot"|"assistant"|"owner"|"site"|"pack"|"author","value":""}
21. {"tool":"pin_control","action":"set"|"unlock"|"lock"|"status","pin":""}
22. {"tool":"firewall_control","action":"status"|"reset","target":""}
23. {"tool":"style_learner_control","action":"report"|"reset","scope":"all"} | {"tool":"system_rules_control","action":"add"|"remove"|"list","rule":"","id":""}

Rules:
- Strip Bangla case suffixes from names ("রিফাতের"->"রিফাত", "হুমায়রাকে"->"হুমায়রা").
- Preserve "group" / "গ্রুপ" in target if the owner refers to a group (e.g. "Bypass Chat Group").
- For send_message, write only the message to deliver.
- Support chained instructions in order.`;

        const userPrompt = [
            `Chat: ${ctx.chatId === ctx.ownerJid ? 'Owner Self Chat' : ctx.chatId}`,
            ctx.quotedJid ? `Replied-to: ${ctx.quotedJid}` : '',
            `Instruction: "${normalizeBn(text).slice(0, 500)}"`
        ].filter(Boolean).join('\n');

        const res = await aiOrchestrator.generateJSON({
            systemPrompt: plannerSystem,
            userText: userPrompt,
            temperature: 0.05,
            maxTokens: 600,
            timeoutMs: 11000
        });

        if (!res?.ok || !res.data || res.data.isOwnerCommand !== true) return null;
        const actions = Array.isArray(res.data.actions) ? res.data.actions : [];
        return actions.slice(0, this.config.maxActionsPerCommand);
    }

    // =========================================================================
    // ৭. অ্যাকশন এক্সিকিউটর (মাস্টার PIN গেট + গ্রুপ ওনার-লক সিঙ্ক + ফুল কন্ট্রোল)
    // =========================================================================

    checkPinGate(ctx, actionName, pinProvided = '') {
        if (privacyFirewall?.checkSensitiveActionGate) {
            return privacyFirewall.checkSensitiveActionGate({
                isSuperOwner: ctx.isSuperOwner,
                actorId: ctx.actorJid,
                actionName,
                pinProvided
            });
        }
        return ctx.isSuperOwner
            ? { allowed: true }
            : { allowed: false, message: '🔐 এই গুরুত্বপূর্ণ পরিবর্তনটি শুধু মূল *Super Owner* করতে পারবেন।' };
    }

    async executeSingleAction(action, ctx, remainingActions = []) {
        const tool = String(action?.tool || '').trim();
        const brand = getLiveBrand();

        switch (tool) {
            case 'deep_clean': {
                if (!systemOptimizer?.deepClean) return { ok: false, message: '⚠️ SystemOptimizer লোড করা নেই।' };
                const report = systemOptimizer.deepClean('manual');
                try { if (typeof global.gc === 'function') global.gc(); } catch {}
                return { ok: true, message: systemOptimizer.formatCleanReport(report) };
            }

            case 'system_health': {
                const extra = [];
                if (aiOrchestrator?.formatAIHealthLines) extra.push(...aiOrchestrator.formatAIHealthLines());
                if (voiceEngine?.getVoiceStats) {
                    const vs = voiceEngine.getVoiceStats();
                    extra.push(`🎙️ *ভয়েস:* মোড \`${vs.globalMode}\` (${vs.voiceName}) | অফ: *${vs.disabledChatsCount}টি* | TTS: *${vs.avgTtsMs}ms*`);
                }
                if (memoryEngine?.getMemoryStats) {
                    const ms = memoryEngine.getMemoryStats();
                    extra.push(`🧠 *মেমোরি:* ${ms.totalProfiles} প্রোফাইল | অফ: *${ms.disabledInboxes}টি* | পজ: *${ms.pausedInboxes}টি*`);
                }
                if (chatQueue?.getQueueStats) {
                    const qs = chatQueue.getQueueStats();
                    extra.push(`🚦 *কিউ:* কোয়ালেস সেভড: *${qs.totalSavedCalls}* | স্প্যাম ব্লক: *${qs.totalRateLimited}*`);
                }
                if (knowledgeEngine?.getKnowledgeStats) {
                    const ks = knowledgeEngine.getKnowledgeStats();
                    extra.push(`📚 *নলেজ/লিড:* ${ks.knowledgeEntries} এন্ট্রি | নতুন লিড: *${ks.newLeads}টি*`);
                }
                if (privacyFirewall?.getFirewallStats) {
                    const fsStat = privacyFirewall.getFirewallStats();
                    extra.push(`🛡️ *ফায়ারওয়াল:* ব্লক *${fsStat.inboundBlocked}* | DLP মাস্ক *${fsStat.outboundRedactions}* | PIN: ${fsStat.masterPinConfigured ? '🔒' : '⚪'}`);
                }
                if (dynamicCommands?.getDynamicCommandsStats) {
                    const ds = dynamicCommands.getDynamicCommandsStats();
                    extra.push(`⚡ *নো-কোড:* ${ds.totalCommands} কমান্ড | ${ds.totalTriggers} ট্রিগার`);
                }
                if (styleLearner?.getStyleLearnerStats) {
                    const sl = styleLearner.getStyleLearnerStats();
                    extra.push(`🧬 *RLHF স্টাইল:* ${sl.correctionsLearned} কারেকশন | ${sl.contactsLearned} কন্টাক্ট`);
                }
                const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
                const pendingTasks = this.tasks.filter((t) => t.status === 'pending').length;
                extra.push(`⚙️ *এজেন্ট:* RAM \`${rssMb} MB\` | পেন্ডিং টাস্ক: *${pendingTasks}টি*`);

                const msg = systemOptimizer?.formatHealthReport
                    ? systemOptimizer.formatHealthReport(extra)
                    : extra.join('\n');
                return { ok: true, message: msg };
            }

            case 'inbox_status': {
                const filter = String(action.filter || 'all').toLowerCase();
                const lines = [`📊 *${brand.botName} • ইনবক্স কন্ট্রোল রিপোর্ট*`, '──────────────────'];

                if (filter === 'all' || filter === 'bot') {
                    const st = memoryEngine?.listInboxStatuses
                        ? memoryEngine.listInboxStatuses()
                        : { globalBotEnabled: true, disabledChats: [], pausedChats: [], totalKnownChats: 0 };

                    // ডুপ্লিকেট ও নিজের বট নম্বর ফিল্টার করা হচ্ছে
                    const cleanDisabled = this._dedupeCandidates(
                        (st.disabledChats || []).map((c) => ({ chatId: c.chatId, name: c.name, phone: c.phone, score: 100 }))
                    );
                    const cleanPaused = (st.pausedChats || []).filter((c) => !isOwnBotTarget(c.chatId, c.phone));

                    lines.push(`🤖 *গ্লোবাল বট:* ${st.globalBotEnabled ? '🟢 চালু' : '🔴 বন্ধ'} (মোট চ্যাট: ${st.totalKnownChats})`);
                    lines.push(`• বট বন্ধ: *${cleanDisabled.length}টি* ইনবক্সে`);
                    cleanDisabled.slice(0, 10).forEach((c, i) => lines.push(`   ${i + 1}. ${c.name} (\`${c.phone || c.chatId}\`)`));
                    lines.push(`• সাময়িক পজ: *${cleanPaused.length}টি* ইনবক্সে`);
                    cleanPaused.slice(0, 8).forEach((c, i) => lines.push(`   ${i + 1}. ${c.name} — *${c.remainingMin} মি.* বাকি`));
                }

                if (filter === 'all' || filter === 'voice') {
                    const vMode = voiceEngine?.getVoiceStats?.().globalMode || 'auto';
                    const vOff = voiceEngine?.listChatVoiceSettings ? voiceEngine.listChatVoiceSettings('off') : [];
                    const vOn = voiceEngine?.listChatVoiceSettings ? voiceEngine.listChatVoiceSettings('on') : [];

                    if (lines.length > 2) lines.push('──────────────────');
                    lines.push(`🎙️ *গ্লোবাল ভয়েস:* \`${vMode}\` | অফ: *${vOff.length}টি* | অলওয়েজ-অন: *${vOn.length}টি*`);
                    vOff.slice(0, 10).forEach((c, i) => {
                        const p = memoryEngine?.getProfile?.(c.chatId);
                        const name = memoryEngine?.getDisplayName?.(p) || c.chatId.split('@')[0];
                        lines.push(`   ${i + 1}. ${name} (\`${p?.phone || c.chatId}\`)`);
                    });
                }

                if (filter === 'all' || filter === 'lang') {
                    const locked = langGuard?.listLockedChats ? langGuard.listLockedChats() : [];
                    const ls = langGuard?.getLangStats ? langGuard.getLangStats() : { globalMode: 'auto', globalStyle: 'auto' };

                    if (lines.length > 2) lines.push('──────────────────');
                    lines.push(`🌐 *ভাষা/স্টাইল:* গ্লোবাল \`${ls.globalMode}\`/\`${ls.globalStyle}\` | লকড: *${locked.length}টি*`);
                    locked.slice(0, 8).forEach((c, i) => {
                        const p = memoryEngine?.getProfile?.(c.chatId);
                        const name = memoryEngine?.getDisplayName?.(p) || c.chatId.split('@')[0];
                        lines.push(`   ${i + 1}. ${name} -> \`${c.mode}\` / \`${c.style}\``);
                    });
                }

                return { ok: true, message: lines.join('\n') };
            }

            case 'chat_bot_control': {
                const resolved = action.resolvedTarget
                    ? { status: 'ok', target: action.resolvedTarget }
                    : this.resolveActionTarget(action.target, ctx, { allowGroups: true });

                if (resolved.status === 'not_found') {
                    return { ok: false, message: `❌ "${resolved.query}" নামে কোনো কন্টাক্ট বা গ্রুপ খুঁজে পাওয়া যায়নি। নম্বর, শেষ ৪ ডিজিট অথবা গ্রুপের ভেতর থেকে \`.cb on/off\` দাও।` };
                }
                if (resolved.status === 'ambiguous') {
                    return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);
                }

                const { chatId, name } = resolved.target;
                const isGroupTarget = String(chatId).endsWith('@g.us');
                const mode = String(action.mode || 'on').toLowerCase();
                const placeLabel = isGroupTarget ? 'গ্রুপে' : 'ইনবক্সে';

                if (mode === 'off') {
                    memoryEngine?.setChatBotEnabled?.(chatId, false, 'owner_agent');
                    if (isGroupTarget && userGroupLib?.setChatbot) {
                        await userGroupLib.setChatbot(chatId, false, { byOwner: true, updatedBy: ctx.actorJid });
                    }
                    return {
                        ok: true,
                        message: `🔴 *${name}* ${placeLabel} ${brand.assistantName} বন্ধ করা হয়েছে${isGroupTarget ? ' (🔒 Owner Locked)' : ''}।`
                    };
                }
                if (mode === 'pause') {
                    const mins = clampMinutes(action.minutes, 30, 1, 1440);
                    memoryEngine?.pauseChat?.(chatId, mins, 'owner_agent');
                    return { ok: true, message: `⏸️ *${name}* ${placeLabel} ${brand.assistantName} *${mins} মিনিটের* জন্য পজ করা হয়েছে।` };
                }

                memoryEngine?.resumeChat?.(chatId);
                if (isGroupTarget && userGroupLib?.setChatbot) {
                    await userGroupLib.setChatbot(chatId, true, { byOwner: true, updatedBy: ctx.actorJid });
                }
                return { ok: true, message: `🟢 *${name}* ${placeLabel} ${brand.assistantName} চালু করা হয়েছে।` };
            }

            case 'bulk_inbox_control': {
                const scope = String(action.scope || 'bot').toLowerCase();
                const mode = String(action.mode || 'on').toLowerCase();

                if (scope === 'voice' && voiceEngine?.listChatVoiceSettings) {
                    const normMode = normalizeVoiceMode(mode) || 'auto';
                    const list = voiceEngine.listChatVoiceSettings();
                    let count = 0;
                    for (const item of list) {
                        if (voiceEngine.setChatVoiceMode(item.chatId, normMode)) count++;
                    }
                    voiceEngine.setGlobalVoiceMode?.(normMode);
                    return { ok: true, message: `🎙️ গ্লোবাল ও *${count}টি* কাস্টম ইনবক্সের ভয়েস মোড \`${normMode}\` করা হয়েছে।` };
                }

                if (!memoryEngine?.listInboxStatuses) return { ok: false, message: '⚠️ MemoryEngine লোড করা নেই।' };

                if (mode === 'off') {
                    memoryEngine.setGlobalBotEnabled?.(false);
                    return { ok: true, message: `🔴 সব ইনবক্সের জন্য ${brand.assistantName} গ্লোবালি *বন্ধ* করা হয়েছে (শুধু ওনার কমান্ড চালু থাকবে)।` };
                }

                memoryEngine.setGlobalBotEnabled?.(true);
                const st = memoryEngine.listInboxStatuses();
                const targets = [...st.disabledChats, ...st.pausedChats];
                let count = 0;
                for (const c of targets) {
                    memoryEngine.resumeChat(c.chatId);
                    count++;
                }
                return {
                    ok: true,
                    message: count
                        ? `🟢 বন্ধ/পজ থাকা সবগুলো (*${count}টি*) ইনবক্সে ${brand.assistantName} আবার চালু করা হয়েছে।`
                        : `🟢 সব ইনবক্সেই ${brand.assistantName} ইতিমধ্যে চালু আছে।`
                };
            }

            case 'global_bot_control': {
                const enabled = Boolean(action.enabled);
                memoryEngine?.setGlobalBotEnabled?.(enabled);
                return {
                    ok: true,
                    message: enabled
                        ? `🟢 পুরো সিস্টেমে ${brand.assistantName} গ্লোবালি *চালু* করা হয়েছে।`
                        : `🔴 পুরো সিস্টেমে ${brand.assistantName} গ্লোবালি *বন্ধ* করা হয়েছে (শুধু ওনার কমান্ড চালু থাকবে)।`
                };
            }

            case 'voice_control': {
                if (!voiceEngine) return { ok: false, message: '⚠️ VoiceEngine লোড করা নেই।' };
                const scope = String(action.scope || 'chat').toLowerCase();

                if (scope === 'list_voices') {
                    const voices = voiceEngine.getAvailableVoices ? voiceEngine.getAvailableVoices() : ['Aoede', 'Kore', 'Leda', 'Zephyr'];
                    const cur = voiceEngine.getVoiceStats?.().voiceName || 'Aoede';
                    return {
                        ok: true,
                        message: `🎙️ *উপলব্ধ নারী কণ্ঠসমূহ:* ${voices.map((v) => `\`${v}\``).join(', ')}\n• বর্তমান কণ্ঠ: *${cur}*\n• বদলাতে: \`.voice name Kore\``
                    };
                }

                if (scope === 'voice_name' && action.voiceName) {
                    const ok = voiceEngine.setGlobalVoiceName(action.voiceName);
                    return ok
                        ? { ok: true, message: `🎙️ ${brand.assistantName}-র কণ্ঠ পরিবর্তন করে *${action.voiceName}* সেট করা হয়েছে।` }
                        : { ok: false, message: '❌ সঠিক ভয়েসের নাম দিন (যেমন: `Aoede`, `Kore`, `Leda`, `Zephyr`)।' };
                }

                const normMode = normalizeVoiceMode(action.mode);
                if (!normMode) return { ok: false, message: '❌ ভয়েস মোড হতে হবে: `auto`, `on`, অথবা `off`।' };

                if (scope === 'global') {
                    voiceEngine.setGlobalVoiceMode(normMode);
                    return { ok: true, message: `🎙️ গ্লোবাল ভয়েস মোড এখন \`${normMode}\` করা হয়েছে।` };
                }

                const resolved = action.resolvedTarget
                    ? { status: 'ok', target: action.resolvedTarget }
                    : this.resolveActionTarget(action.target, ctx, { allowGroups: true });

                if (resolved.status === 'not_found') return { ok: false, message: `❌ "${resolved.query}" নামে কোনো ইনবক্স বা গ্রুপ পাওয়া যায়নি।` };
                if (resolved.status === 'ambiguous') return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);

                voiceEngine.setChatVoiceMode(resolved.target.chatId, normMode);
                return { ok: true, message: `🎙️ *${resolved.target.name}*-এ ভয়েস মোড \`${normMode}\` সেট করা হয়েছে।` };
            }

            case 'lang_control': {
                if (!langGuard) return { ok: false, message: '⚠️ LangGuard লোড করা নেই।' };
                const normLang = normalizeLangMode(action.mode);
                if (!normLang) return { ok: false, message: '❌ সঠিক ভাষা: `auto`, `bn`, `banglish`, অথবা `en`।' };

                if (String(action.scope || 'chat').toLowerCase() === 'global') {
                    langGuard.setGlobalLanguage(normLang);
                    return { ok: true, message: `🌐 গ্লোবাল রিপ্লাই ভাষা এখন \`${normLang}\` সেট করা হয়েছে।` };
                }

                const resolved = action.resolvedTarget
                    ? { status: 'ok', target: action.resolvedTarget }
                    : this.resolveActionTarget(action.target, ctx, { allowGroups: true });

                if (resolved.status === 'not_found') return { ok: false, message: `❌ "${resolved.query}" নামে কোনো ইনবক্স বা গ্রুপ পাওয়া যায়নি।` };
                if (resolved.status === 'ambiguous') return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);

                langGuard.setChatLanguageLock(resolved.target.chatId, normLang);
                return { ok: true, message: `🌐 *${resolved.target.name}*-এ ভাষা \`${normLang}\` সেট করা হয়েছে।` };
            }

            case 'style_control': {
                if (!langGuard) return { ok: false, message: '⚠️ LangGuard লোড করা নেই।' };
                const normStyle = normalizeStyleMode(action.style);
                if (!normStyle) return { ok: false, message: '❌ সঠিক স্টাইল: `auto`, `apni`, `tumi`, অথবা `tui`।' };

                if (String(action.scope || 'chat').toLowerCase() === 'global') {
                    langGuard.setGlobalStyle(normStyle);
                    return { ok: true, message: `💬 গ্লোবাল সম্বোধন স্টাইল এখন \`${normStyle}\` সেট করা হয়েছে।` };
                }

                const resolved = action.resolvedTarget
                    ? { status: 'ok', target: action.resolvedTarget }
                    : this.resolveActionTarget(action.target, ctx, { allowGroups: true });

                if (resolved.status === 'not_found') return { ok: false, message: `❌ "${resolved.query}" নামে কোনো ইনবক্স বা গ্রুপ পাওয়া যায়নি।` };
                if (resolved.status === 'ambiguous') return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);

                langGuard.setChatStyleLock(resolved.target.chatId, normStyle);
                return { ok: true, message: `💬 *${resolved.target.name}*-এর সাথে সম্বোধন স্টাইল \`${normStyle}\` সেট করা হয়েছে।` };
            }

            case 'send_message': {
                const msgText = normalizeBn(action.message || '').trim();
                if (!msgText) return { ok: false, message: '❌ কী মেসেজ পাঠাতে হবে তা স্পষ্ট করে বলো।' };

                const resolved = action.resolvedTarget
                    ? { status: 'ok', target: action.resolvedTarget }
                    : this.resolveActionTarget(action.target, ctx, { allowGroups: true });

                if (resolved.status === 'not_found') {
                    return { ok: false, message: `❌ "${resolved.query}"-কে কন্টাক্ট বা গ্রুপ লিস্টে পাওয়া যায়নি। ফোন নম্বরটা দিলে এখনই পাঠিয়ে দিচ্ছি।` };
                }
                if (resolved.status === 'ambiguous') {
                    return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);
                }

                const { chatId, name } = resolved.target;
                const delayMins = clampMinutes(action.delayMinutes, 0, 0, 43200);
                const sendAsVoice = Boolean(action.sendAsVoice);

                if (delayMins > 0) {
                    const runAt = Date.now() + delayMins * 60 * 1000;
                    const task = {
                        id: `TK-${Date.now().toString(36).toUpperCase().slice(-5)}`,
                        kind: 'message',
                        targetJid: chatId,
                        targetName: name,
                        ownerJid: ctx.actorJid || ctx.ownerJid || ctx.chatId,
                        message: msgText,
                        sendAsVoice,
                        runAt,
                        status: 'pending',
                        retries: 0,
                        createdAt: Date.now()
                    };
                    this.tasks.push(task);
                    this.metrics.tasksScheduled++;
                    this.saveTasks();
                    return {
                        ok: true,
                        message: `⏰ শিডিউল সেট (\`${task.id}\`): *${delayMins} মিনিট পর* (${formatDhakaClock(runAt)}) *${name}*-কে ${sendAsVoice ? 'ভয়েস' : 'মেসেজ'} যাবে।\n_"${msgText}"_`
                    };
                }

                try {
                    if (sendAsVoice && voiceEngine?.synthesizeVoice) {
                        const core = getMayaCoreLazy();
                        const targetRole = core?.getContactRole ? core.getContactRole(chatId, chatId) : 'auto';
                        const tts = await withTimeout(
                            voiceEngine.synthesizeVoice(msgText, { chatId, role: targetRole }),
                            this.config.taskSendTimeoutMs,
                            'tts_timeout'
                        ).catch(() => null);

                        if (tts?.ok && tts.buffer) {
                            await this.sendRaw(ctx.sock, ctx.safeSendFn, chatId, { audio: tts.buffer, mimetype: tts.mimetype, ptt: true });
                            this.metrics.messagesSentForOwner++;
                            return { ok: true, message: `🎙️ *${name}*-কে ভয়েস মেসেজ পাঠানো হয়েছে।\n_"${msgText}"_` };
                        }
                    }

                    await this.sendRaw(ctx.sock, ctx.safeSendFn, chatId, { text: msgText });
                    this.metrics.messagesSentForOwner++;
                    return { ok: true, message: `✅ *${name}*-কে মেসেজ পাঠানো হয়েছে।\n_"${msgText}"_` };
                } catch (err) {
                    return { ok: false, message: `❌ *${name}*-কে মেসেজ পাঠানো যায়নি (${err?.message || 'error'})।` };
                }
            }

            case 'schedule_reminder': {
                const msgText = normalizeBn(action.message || '').trim();
                const delayMins = clampMinutes(action.delayMinutes, 10, 1, 43200);
                if (!msgText) return { ok: false, message: '❌ কী মনে করিয়ে দিতে হবে তা বলো (যেমন: `.remind 15 কল দেব`)।' };

                const runAt = Date.now() + delayMins * 60 * 1000;
                const rawTarget = ctx.chatId || ctx.actorJid || ctx.ownerJid;
                const targetJid = memoryEngine?.normalizeChatId ? memoryEngine.normalizeChatId(rawTarget) : rawTarget;

                const task = {
                    id: `RM-${Date.now().toString(36).toUpperCase().slice(-5)}`,
                    kind: 'reminder',
                    targetJid,
                    targetName: 'রিমাইন্ডার',
                    ownerJid: targetJid,
                    message: msgText,
                    sendAsVoice: false,
                    runAt,
                    status: 'pending',
                    retries: 0,
                    createdAt: Date.now()
                };
                this.tasks.push(task);
                this.metrics.tasksScheduled++;
                this.saveTasks();
                return {
                    ok: true,
                    message: `⏰ রিমাইন্ডার সেট (\`${task.id}\`): *${delayMins} মিনিট পর* (${formatDhakaClock(runAt)}) মনে করিয়ে দেব — _"${msgText}"_`
                };
            }

            case 'ai_control': {
                if (action.action === 'reload_keys') {
                    const core = getMayaCoreLazy();
                    if (core?.resetAllApiHealth) core.resetAllApiHealth();
                    else {
                        try { settings?.reloadEnv?.(); } catch {}
                        try { aiOrchestrator?.resetAIHealth?.(); } catch {}
                        try { voiceEngine?.refreshVoiceKeys?.(); voiceEngine?.resetVoiceCooldowns?.(); } catch {}
                    }
                    const poolCount = core?.getActiveProviderPool ? core.getActiveProviderPool().length : 0;
                    return {
                        ok: true,
                        message: `🔄 সব API কী রিলোড, কুলডাউন রিসেট ও লাইভ মডেল ডিসকভারি চালু হয়েছে! (সক্রিয় কী স্লট: *${poolCount}টি*)`
                    };
                }
                if (!aiOrchestrator) return { ok: false, message: '⚠️ AIOrchestrator লোড করা নেই।' };
                if (action.action === 'discover') {
                    await aiOrchestrator.discoverModels(true);
                    return { ok: true, message: '🔍 সব AI প্রোভাইডারের লাইভ মডেল তালিকা রিফ্রেশ হয়েছে।' };
                }
                const ok = aiOrchestrator.setPrimaryProvider(action.provider);
                if (!ok) return { ok: false, message: '❌ সঠিক প্রোভাইডার: `auto`, `gemini`, `groq`, অথবা `openrouter`।' };
                if (action.modelName && action.provider !== 'auto') {
                    aiOrchestrator.setPreferredModel(action.provider, action.modelName);
                }
                return {
                    ok: true,
                    message: `🧠 প্রাইমারি AI প্রোভাইডার এখন *${action.provider}*${action.modelName ? ` (${action.modelName})` : ''} সেট হয়েছে।`
                };
            }

            case 'leads_control': {
                if (!knowledgeEngine) return { ok: false, message: '⚠️ KnowledgeEngine লোড করা নেই।' };
                if (action.action === 'mark_done' && action.leadId) {
                    const ok = knowledgeEngine.updateLeadStatus(action.leadId, 'done');
                    return ok
                        ? { ok: true, message: `✅ লিড \`${action.leadId}\` সম্পন্ন (Done) মার্ক হয়েছে।` }
                        : { ok: false, message: `❌ \`${action.leadId}\` আইডির কোনো লিড পাওয়া যায়নি।` };
                }
                return { ok: true, message: knowledgeEngine.formatLeadsReport({ filter: action.filter || 'recent' }) };
            }

            case 'knowledge_control': {
                if (!knowledgeEngine) return { ok: false, message: '⚠️ KnowledgeEngine লোড করা নেই।' };
                const act = String(action.action || 'list').toLowerCase();
                if (act === 'add') {
                    const res = knowledgeEngine.addKnowledgeEntry({
                        category: action.category || 'general',
                        title: action.title || '',
                        content: action.content || '',
                        url: action.url || ''
                    });
                    return res.ok
                        ? { ok: true, message: `📚 নলেজ বেসে সেভ হয়েছে: *${res.entry.title}* (\`${res.entry.id}\`)` }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                if (act === 'remove') {
                    const res = knowledgeEngine.removeKnowledgeEntry(action.idOrTitle || '');
                    return res.ok
                        ? { ok: true, message: `🗑️ নলেজ বেস থেকে মুছে ফেলা হয়েছে: *${res.removed.title}*` }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                return { ok: true, message: knowledgeEngine.formatKnowledgeList() };
            }

            case 'memory_control': {
                if (!memoryEngine) return { ok: false, message: '⚠️ MemoryEngine লোড করা নেই।' };
                const resolved = action.resolvedTarget
                    ? { status: 'ok', target: action.resolvedTarget }
                    : this.resolveActionTarget(action.target, ctx, { allowGroups: true });

                if (resolved.status === 'not_found') return { ok: false, message: `❌ "${resolved.query}" নামে কোনো প্রোফাইল পাওয়া যায়নি।` };
                if (resolved.status === 'ambiguous') return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);

                if (action.action === 'forget') {
                    memoryEngine.forgetChat(resolved.target.chatId, { keepBotSettings: true });
                    return { ok: true, message: `🧹 *${resolved.target.name}*-এর চ্যাট মেমোরি ও সামারি রিসেট হয়েছে।` };
                }
                return { ok: true, message: memoryEngine.formatMemoryCard(resolved.target.chatId) };
            }

            case 'save_alias': {
                const resolved = action.resolvedTarget
                    ? { status: 'ok', target: action.resolvedTarget }
                    : this.resolveActionTarget(action.target, ctx, { allowGroups: false });

                if (resolved.status === 'not_found') return { ok: false, message: `❌ "${resolved.query}"-কে পাওয়া যায়নি।` };
                if (resolved.status === 'ambiguous') return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);

                const alias = normalizeBn(action.alias || '').trim();
                if (!alias) return { ok: false, message: '❌ কোন নামে সেভ করব তা বলো।' };
                memoryEngine?.addContactAlias?.(resolved.target.chatId, alias);
                return { ok: true, message: `🏷️ *${resolved.target.name}*-এর ডাকনাম *"${alias}"* সেভ করা হয়েছে।` };
            }

            case 'tasks_control': {
                if (action.action === 'cancel' && action.taskId) {
                    const id = String(action.taskId).trim().toUpperCase();
                    const found = this.tasks.find((t) => t.id === id && t.status === 'pending');
                    if (!found) return { ok: false, message: `❌ \`${id}\` আইডির কোনো পেন্ডিং টাস্ক নেই।` };
                    found.status = 'cancelled';
                    this.saveTasks();
                    return { ok: true, message: `🚫 শিডিউল টাস্ক \`${id}\` বাতিল করা হয়েছে।` };
                }

                const pending = this.tasks.filter((t) => t.status === 'pending');
                if (!pending.length) {
                    return { ok: true, message: '⏰ এই মুহূর্তে কোনো পেন্ডিং শিডিউল্ড মেসেজ বা রিমাইন্ডার নেই।' };
                }
                const lines = [`⏰ *পেন্ডিং শিডিউল তালিকা (${pending.length}টি)*`, '──────────────────'];
                pending.slice(0, 10).forEach((t, i) => {
                    const icon = t.kind === 'reminder' ? '🔔' : '📨';
                    lines.push(`${i + 1}. ${icon} \`${t.id}\` -> *${t.targetName}* (${formatDhakaClock(t.runAt)})`);
                    lines.push(`   _"${t.message.slice(0, 60)}"_`);
                });
                lines.push('\n_বাতিল করতে:_ `.tasks cancel <ID>`');
                return { ok: true, message: lines.join('\n') };
            }

            case 'dynamic_owner_control': {
                const act = String(action.action || 'list').toLowerCase();
                const mainApi = getMainDynamicOwnerApi();

                if (act === 'list') {
                    if (mainApi?.formatDynamicOwnersList) {
                        return { ok: true, message: mainApi.formatDynamicOwnersList() };
                    }
                    const nums = settings?.getAllOwnerNumbers ? settings.getAllOwnerNumbers() : [];
                    return { ok: true, message: `👑 *ওনার লিস্ট (${nums.length}জন):*\n${nums.map((n, i) => `${i + 1}. \`+${n}\``).join('\n')}` };
                }

                const gateAction = act === 'grant' ? 'grant_owner' : act === 'revoke' ? 'revoke_owner' : 'lockdown';
                const gate = this.checkPinGate(ctx, gateAction);
                if (!gate.allowed) return { ok: false, message: gate.message };

                if (act === 'lockdown' || act === 'unlockdown') {
                    if (mainApi?.setLockdown) {
                        mainApi.setLockdown(act === 'lockdown');
                        return {
                            ok: true,
                            message: act === 'lockdown'
                                ? '🚨 *লকডাউন চালু!* এখন শুধু মূল Super Owner ছাড়া কেউ অ্যাডমিন/কো-ওনার কমান্ড চালাতে পারবে না।'
                                : '🔓 *লকডাউন খোলা হয়েছে!* অনুমোদিত কো-ওনার অ্যাক্সেস পুনরায় সক্রিয়।'
                        };
                    }
                    return { ok: true, message: 'ℹ️ লকডাউন কন্ট্রোলের জন্য `.lockdown` বা `.unlockdown` লিখুন।' };
                }

                if (!mainApi) return { ok: false, message: '⚠️ Dynamic Owner মডিউল লোড নেই। সরাসরি `.addowner` / `.delowner` ব্যবহার করুন।' };

                if (act === 'grant' || act === 'revoke') {
                    const resolved = action.resolvedTarget
                        ? { status: 'ok', target: action.resolvedTarget }
                        : this.resolveActionTarget(action.target, ctx, { allowGroups: false });

                    if (resolved.status === 'not_found') {
                        return { ok: false, message: `❌ "${resolved.query}"-কে চিনতে পারিনি। সঠিক নম্বর বা সেভ করা নাম বলো।` };
                    }
                    if (resolved.status === 'ambiguous') {
                        return this.requestDisambiguation(action, resolved.matches, ctx, remainingActions, action.target);
                    }

                    const phone = normalizePhone(resolved.target.phone || resolved.target.chatId);
                    if (isHardBlockedTarget(resolved.target.chatId, phone)) {
                        return { ok: false, message: `🚫 \`+${phone}\` সিকিউরিটি ব্লকলিস্টে আছে—অ্যাক্সেস দেওয়া যাবে না।` };
                    }

                    if (act === 'grant') {
                        const mins = clampMinutes(action.durationMinutes, 0, 0, 525600);
                        const res = mainApi.grantDynamicOwner?.({
                            phone,
                            lid: resolved.target.chatId?.endsWith('@lid') ? resolved.target.chatId : '',
                            name: resolved.target.name || '',
                            durationMs: mins > 0 ? mins * 60 * 1000 : null
                        });
                        if (!res?.ok) return { ok: false, message: `❌ ${res?.error || 'ব্যর্থ হয়েছে।'}` };
                        return {
                            ok: true,
                            message: `✅ *${resolved.target.name || `+${phone}`}*-কে ফুল ওনার অ্যাক্সেস দেওয়া হয়েছে${mins > 0 ? ` (${mins} মিনিটের জন্য)` : ' (স্থায়ী)'}।${gate.advisory ? `\n\n${gate.advisory}` : ''}`
                        };
                    } else {
                        const res = mainApi.revokeDynamicOwner?.(phone);
                        if (!res?.ok) return { ok: false, message: `❌ ${res?.error || 'ব্যর্থ হয়েছে।'}` };
                        return { ok: true, message: `🚫 *${resolved.target.name || `+${phone}`}*-এর সব ওনার অ্যাক্সেস বাতিল করা হয়েছে।` };
                    }
                }
                return { ok: true, message: 'ℹ️ ওনার লিস্ট বা লকডাউনের জন্য `.ownerlist` / `.lockdown` / `.unlockdown` ব্যবহার করুন।' };
            }

            case 'dynamic_command_control': {
                if (!dynamicCommands) return { ok: false, message: '⚠️ DynamicCommands মডিউল লোড নেই।' };
                const act = String(action.action || 'list').toLowerCase();
                if (act === 'create') {
                    const res = dynamicCommands.createOrUpdateDynamicCommand(action);
                    return res.ok
                        ? { ok: true, message: `⚡ ডায়নামিক কমান্ড ${res.updated ? 'আপডেট' : 'তৈরি'} হয়েছে: \`${res.command.name}\` [${res.command.type.toUpperCase()}]` }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                if (act === 'delete') {
                    const res = dynamicCommands.deleteDynamicCommand(action.name);
                    return res.ok
                        ? { ok: true, message: `🗑️ কমান্ড \`${res.deleted}\` ডিলিট করা হয়েছে।` }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                if (act === 'toggle') {
                    const res = dynamicCommands.toggleDynamicCommand(action.name, action.enabled !== false);
                    return res.ok
                        ? { ok: true, message: `${res.command.enabled ? '🟢 চালু' : '⚪ বন্ধ'}: \`${res.command.name}\`` }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                return { ok: true, message: dynamicCommands.formatDynamicCommandsList() };
            }

            case 'auto_trigger_control': {
                if (!dynamicCommands) return { ok: false, message: '⚠️ DynamicCommands মডিউল লোড নেই।' };
                const act = String(action.action || 'list').toLowerCase();
                if (act === 'create') {
                    const res = dynamicCommands.createAutoTrigger(action);
                    return res.ok
                        ? { ok: true, message: `🤖 অটো-ট্রিগার সেট (\`${res.trigger.id}\`): *"${res.trigger.keyword}"*` }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                if (act === 'delete') {
                    const res = dynamicCommands.deleteAutoTrigger(action.idOrKeyword);
                    return res.ok
                        ? { ok: true, message: `🗑️ ট্রিগার \`${res.removed.id}\` মুছে ফেলা হয়েছে।` }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                return { ok: true, message: dynamicCommands.formatAutoTriggersList() };
            }

            case 'branding_control': {
                if (!systemControl?.getBotBranding) return { ok: false, message: '⚠️ Branding মডিউল লোড নেই।' };
                const field = String(action.field || 'status').toLowerCase();
                const val = normalizeBn(action.value || '').trim();

                if (field === 'status' || !val) {
                    const b = systemControl.getBotBranding();
                    return {
                        ok: true,
                        message: [
                            `✨ *${b.botName} • লাইভ ব্র্যান্ডিং সেটিংস*`,
                            '──────────────────',
                            `• বটের নাম: *${b.botName}*`,
                            `• অ্যাসিস্ট্যান্ট: *${b.assistantName}*`,
                            `• ওনারের নাম: *${b.ownerName}*`,
                            `• ওয়েবসাইট: ${b.ownerWebsite}`,
                            `• স্টিকার প্যাক: \`${b.packname}\``,
                            '──────────────────',
                            '_বদলাতে:_ `.brand bot/assistant/owner/site/pack <নতুন_মান>`'
                        ].join('\n')
                    };
                }

                const gate = this.checkPinGate(ctx, 'change_branding');
                if (!gate.allowed) return { ok: false, message: gate.message };

                const map = {
                    bot: 'botName', botname: 'botName',
                    assistant: 'assistantName', maya: 'assistantName',
                    owner: 'ownerName', ownername: 'ownerName',
                    site: 'ownerWebsite', website: 'ownerWebsite', link: 'ownerWebsite',
                    pack: 'packname', packname: 'packname',
                    author: 'author'
                };
                const key = map[field];
                if (!key) return { ok: false, message: '❌ সঠিক ফিল্ড: `bot`, `assistant`, `owner`, `site`, `pack`, `author`।' };

                const res = systemControl.setBotBranding({ [key]: val });
                if (!res.changed.length) return { ok: false, message: '❌ সঠিক মান দিন (লিংকের ক্ষেত্রে `https://` দিয়ে শুরু করুন)।' };
                return {
                    ok: true,
                    message: `✅ লাইভ আপডেট হয়েছে: *${res.changed.join(', ')}* -> \`${val}\`${gate.advisory ? `\n\n${gate.advisory}` : ''}`
                };
            }

            case 'pin_control': {
                if (!ctx.isSuperOwner) return { ok: false, message: '🔐 মাস্টার PIN শুধু মূল *Super Owner* ব্যবহার করতে পারবেন।' };
                if (!systemControl?.setMasterPin) return { ok: false, message: '⚠️ PIN ভল্ট মডিউল লোড নেই।' };

                const act = String(action.action || 'status').toLowerCase();
                if (act === 'lock') {
                    systemControl.lockPinSession(ctx.actorJid);
                    return { ok: true, message: '🔒 মাস্টার PIN সেশন লক করা হয়েছে।' };
                }
                if (act === 'unlock') {
                    const res = systemControl.verifyMasterPin(action.pin, ctx.actorJid);
                    return res.ok
                        ? { ok: true, message: '🔓 মাস্টার PIN ভেরিফায়েড! আগামী *১০ মিনিটের* জন্য বড় সিস্টেম পরিবর্তন আনলক হয়েছে।' }
                        : { ok: false, message: res.error };
                }
                if (act === 'set') {
                    if (systemControl.hasMasterPin() && !systemControl.isPinSessionUnlocked(ctx.actorJid)) {
                        return { ok: false, message: '🔐 নতুন PIN সেট করার আগে বর্তমান PIN আনলক করো: `.pin <বর্তমান_পিন>`' };
                    }
                    const res = systemControl.setMasterPin(action.pin);
                    return res.ok
                        ? { ok: true, message: '🔒 এনক্রিপ্টেড মাস্টার PIN সেট করা হয়েছে! এখন বড় পরিবর্তনের আগে `.pin <পিন>` লাগবে।' }
                        : { ok: false, message: `❌ ${res.error}` };
                }
                const st = systemControl.getMasterPinStatus(ctx.actorJid);
                return {
                    ok: true,
                    message: st.configured
                        ? `🔐 *মাস্টার PIN স্ট্যাটাস:* সক্রিয় | সেশন: ${st.unlocked ? `🔓 আনলক (${st.remainingMin} মি. বাকি)` : '🔒 লকড'}`
                        : '⚪ মাস্টার PIN এখনো সেট করা হয়নি। সেট করতে লিখুন: `.setpin <৪-৮ অক্ষরের পিন>`'
                };
            }

            case 'firewall_control': {
                if (!privacyFirewall) return { ok: false, message: '⚠️ PrivacyFirewall লোড নেই।' };
                if (action.action === 'reset' && action.target) {
                    privacyFirewall.resetThreatForUser(action.target);
                    return { ok: true, message: `✅ \`${action.target}\`-এর থ্রেট রেকর্ড রিসেট হয়েছে।` };
                }
                return { ok: true, message: privacyFirewall.formatFirewallReport() };
            }

            case 'style_learner_control': {
                if (!styleLearner) return { ok: false, message: '⚠️ StyleLearner লোড নেই।' };
                if (action.action === 'reset') {
                    const gate = this.checkPinGate(ctx, 'reset_style_all');
                    if (!gate.allowed) return { ok: false, message: gate.message };
                    styleLearner.resetStyleData(action.scope || 'all');
                    return { ok: true, message: `🧹 স্টাইল লার্নিং ডেটা (\`${action.scope || 'all'}\`) রিসেট করা হয়েছে।` };
                }
                return { ok: true, message: styleLearner.formatStyleReport() };
            }

            case 'system_rules_control': {
                if (!systemControl?.getOwnerRules) return { ok: false, message: '⚠️ SystemControl লোড নেই।' };
                const act = String(action.action || 'list').toLowerCase();
                if (act === 'add' && action.rule) {
                    const saved = systemControl.addOwnerRule(action.rule);
                    return saved
                        ? { ok: true, message: `🧠 স্থায়ী নিয়ম যুক্ত (\`${saved.id}\`): _"${saved.rule}"_` }
                        : { ok: false, message: '❌ নিয়মটি খালি হতে পারবে না।' };
                }
                if (act === 'remove' && action.id) {
                    const ok = systemControl.removeOwnerRule(action.id);
                    return ok
                        ? { ok: true, message: `🗑️ নিয়ম \`${action.id}\` মুছে ফেলা হয়েছে।` }
                        : { ok: false, message: `❌ \`${action.id}\` নিয়ম খুঁজে পাওয়া যায়নি।` };
                }
                const rules = systemControl.getOwnerRules();
                return {
                    ok: true,
                    message: rules.length
                        ? `🧠 *স্থায়ী নিয়মসমূহ (${rules.length}টি):*\n` + rules.map((r, i) => `${i + 1}. \`${r.id}\` — ${r.rule}`).join('\n')
                        : '📭 কোনো স্থায়ী নিয়ম সেভ করা নেই।'
                };
            }

            case 'owner_help': {
                return {
                    ok: true,
                    message: [
                        `⚡ *${brand.botName} • ${brand.assistantName} v${brand.version} আল্ট্রা ওনার কন্ট্রোল*`,
                        '──────────────────',
                        'ভয়েস নোট বা সাধারণ বাংলায় বলো:',
                        '• _"হুমায়রাকে বলো আমি ৫ মিনিটে আসছি"_ (বাংলা↔ইংরেজি ফোনেটিক ম্যাচ)',
                        '• _"Bypass Chat Group-এ মায়া অন/অফ করো"_',
                        '• _"`.bkash` নামে কমান্ড বানাও, কেউ দিলে আমার বিকাশ নম্বর বলবে"_',
                        '• _"কয়টা ইনবক্সে বট আর ভয়েস অফ আছে দেখাও"_',
                        '• _"১৫ মিনিট পর মনে করিয়ে দাও সার্ভার চেক করব"_',
                        '• _"সেশন ক্লিন করো"_ / _"ফায়ারওয়াল স্ট্যাটাস দেখাও"_',
                        '──────────────────',
                        '📌 কোর: `.health` `.clean` `.inboxes` `.voice` `.lang` `.pause` `.resume` `.remind` `.tasks` `.leads` `.kb` `.ai reload`',
                        '🔐 প্রো: `.setpin` `.pin` `.lockpin` `.brand` `.dcmd` `.trigger` `.firewall` `.styleinfo` `.orule` `.ownerlist` `.takeover`'
                    ].join('\n')
                };
            }

            default:
                return { ok: false, message: '' };
        }
    }

    requestDisambiguation(action, matches, ctx, remainingActions = [], originalQuery = '') {
        if (this.pendingChoices.size >= this.config.maxPendingChoices) {
            this.pendingChoices.delete(this.pendingChoices.keys().next().value);
        }
        this.pendingChoices.set(ctx.chatId, {
            action,
            remainingActions,
            originalQuery,
            matches,
            expiresAt: Date.now() + this.config.disambiguationTtlMs
        });

        const lines = [
            '🤔 একই নামে একাধিক কন্টাক্ট/গ্রুপ পাওয়া গেছে — কাকে বোঝাচ্ছো? শুধু নম্বরটা বলো (যেমন: *১* বা *২*, অথবা *বাতিল*):',
            '──────────────────'
        ];
        matches.forEach((m, i) => {
            const tag = m.isGroup ? '👥 গ্রুপ' : (m.phone ? `+${m.phone}` : m.chatId);
            lines.push(`${i + 1}. *${m.name}* (\`${tag}\`)`);
        });
        return { ok: false, needsChoice: true, message: lines.join('\n') };
    }

    // =========================================================================
    // ৮. মাস্টার এন্ট্রি পয়েন্ট ও main.js ডট-কমান্ড ব্রিজ
    // =========================================================================

    async handleOwnerCommand({
        sock = null,
        safeSendFn = null,
        chatId = '',
        senderId = '',
        ownerJid = '',
        text = '',
        quotedJid = '',
        isOwner = false,
        isSuperOwner = false,
        isVoiceInput = false,
        forceTryAI = false
    } = {}) {
        if (!isOwner) return { handled: false };

        const rawText = normalizeBn(text).trim();
        if (!rawText) return { handled: false };

        const activeSock = sock || this.activeSockRef;
        const verifiedSuperOwner = Boolean(isSuperOwner || checkIsSuperOwner(senderId, chatId, activeSock));

        const ctx = {
            sock: activeSock,
            safeSendFn: safeSendFn || this.activeSafeSendRef,
            chatId,
            senderId,
            actorJid: senderId || chatId,
            ownerJid: ownerJid || senderId || chatId,
            quotedJid,
            text: rawText,
            isVoiceInput,
            isSuperOwner: verifiedSuperOwner
        };

        // ধাপ ১: পেন্ডিং কনফার্মেশন ("১" বা "২")
        const pendingRes = await this.handlePendingDisambiguation(ctx);
        if (pendingRes?.handled) {
            this.metrics.commandsHandled++;
            return { ...pendingRes, shouldReplyVoice: false };
        }

        // ধাপ ২: ডট কমান্ড
        let actions = this.parseDotCommand(rawText);
        let source = 'dot';

        // ধাপ ৩: ০ms ফাস্ট-পাথ
        if (!actions) {
            actions = this.tryFastNaturalParse(rawText);
            source = 'fast_path';
        }

        // ধাপ ৪: AI মাল্টি-অ্যাকশন প্ল্যানার
        if (!actions && (forceTryAI || isVoiceInput)) {
            actions = await this.planWithAI(rawText, ctx);
            source = 'ai_planner';
        }

        if (!actions || !actions.length) return { handled: false };

        if (source === 'dot') this.metrics.dotCommands++;
        else if (source === 'fast_path') this.metrics.fastPathCommands++;
        else this.metrics.aiPlannedCommands++;

        const replies = [];
        let executed = 0;

        for (let i = 0; i < actions.length; i++) {
            const res = await this.executeSingleAction(actions[i], ctx, actions.slice(i + 1));
            if (res?.message) replies.push(res.message);
            if (res?.ok) executed++;
            if (res?.needsChoice) break;
        }

        if (!replies.length) return { handled: false };

        this.metrics.commandsHandled++;
        const combinedReply = replies.join('\n\n');

        return {
            handled: true,
            source,
            actionsExecuted: executed,
            reply: combinedReply,
            shouldReplyVoice: Boolean(isVoiceInput && combinedReply.length <= 220 && !combinedReply.includes('──'))
        };
    }

    // main.js থেকে সরাসরি ডট-কমান্ড (.inboxes, .pause, .remind, .send, .tasks ইত্যাদি) চালানোর ব্রিজ
    async handleOwnerDotCommand(sock, chatId, message, baseCmd = '', cmdArgs = '', safeSendFn = null) {
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        const quotedJid = message?.message?.extendedTextMessage?.contextInfo?.participant || '';
        const fullText = `${baseCmd} ${cmdArgs || ''}`.trim();

        const res = await this.handleOwnerCommand({
            sock,
            safeSendFn,
            chatId,
            senderId,
            ownerJid: typeof settings?.getOwnerJid === 'function' ? settings.getOwnerJid() : senderId,
            text: fullText,
            quotedJid,
            isOwner: true,
            isSuperOwner: checkIsSuperOwner(senderId, chatId, sock),
            isVoiceInput: false,
            forceTryAI: false
        });

        if (res?.handled && res.reply) {
            await this.sendRaw(sock, safeSendFn, chatId, { text: res.reply }).catch(() => {});
            return true;
        }
        return false;
    }

    getStats() {
        return {
            pendingScheduledTasks: this.tasks.filter((t) => t.status === 'pending').length,
            pendingDisambiguations: this.pendingChoices.size,
            ...this.metrics
        };
    }
}

const ownerAgent = new OwnerAgent();

module.exports = {
    OwnerAgent,
    ownerAgent,
    handleOwnerCommand: (opts) => ownerAgent.handleOwnerCommand(opts),
    handleOwnerDotCommand: (sock, chatId, msg, baseCmd, cmdArgs, safeSendFn) =>
        ownerAgent.handleOwnerDotCommand(sock, chatId, msg, baseCmd, cmdArgs, safeSendFn),
    startOwnerScheduler: (sock, safeSendFn) => ownerAgent.startScheduler(sock, safeSendFn),
    stopOwnerScheduler: () => ownerAgent.stopScheduler(),
    getOwnerAgentStats: () => ownerAgent.getStats(),
    toPhoneticKey,
    scoreNameMatch
};
