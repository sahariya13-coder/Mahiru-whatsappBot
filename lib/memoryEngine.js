/**
 * Mahiru Shiina • Mahiru v2.0 ULTRA — 3-Tier Atomic Memory, Media Isolation & Smart Contact Directory
 * Tuned for 256MB RAM (Bounded Profiles & Sessions, Compact Atomic I/O, O(1) Phone Index, Zero-Leak Summarizer)
 * 100% Backward-Compatible Exports + Full main.js / ownerAgent.js Parity
 */

const fs = require('fs');
const path = require('path');

let settings = null;
try { settings = require('../settings'); } catch {}

let langGuard = null;
try { ({ langGuard } = require('./langGuard')); } catch {}

let aiOrchestrator = null;
try { ({ aiOrchestrator } = require('./aiOrchestrator')); } catch {}

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

const memCfg = settings?.maya?.memory || {};

const DEFAULT_CONFIG = {
    profilesFile: './data/memory_profiles.json',
    sessionsFile: './data/memory_sessions.json',
    maxTurnsStoredPerChat: Math.min(Number(memCfg.maxTurnsStoredPerChat || 14), 20),
    defaultPromptTurns: Math.min(Number(memCfg.defaultPromptTurns || 6), 12),
    summarizeThreshold: Math.min(Number(memCfg.summarizeThreshold || 12), 18),
    summarizeBatchSize: 6,
    maxSummaryChars: 480,
    maxTurnChars: 420,
    maxProfilesLimit: Math.min(Number(memCfg.maxProfilesLimit || 450), 800),
    maxSessionsLimit: 140,               // ২৫৬MB RAM: সক্রিয় চ্যাট সেশন হার্ড-ক্যাপ
    saveDebounceMs: 4500,                // ৪.৫ সেকেন্ডে ব্যাচ করে কম্প্যাক্ট অ্যাটমিক রাইট
    hotSessionTtlMs: 4 * 60 * 60 * 1000, // ৪ ঘণ্টা নিষ্ক্রিয় থাকলে টার্ন ট্রিম
    coldSessionDropMs: 24 * 60 * 60 * 1000, // ২৪ ঘণ্টা নিষ্ক্রিয় সেশন র‍্যাম থেকে ছাঁটাই
    ramSummaryGuardMb: 195               // RAM ১৯৫MB ছাড়ালে ব্যাকগ্রাউন্ড AI সামারি স্থগিত
};

const BN_DIGIT_MAP = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

// স্মার্টফোন মডেল অটো-ডিটেকশন (জিরো AI কস্ট)
const DEVICE_MODEL_RE = /\b((?:tecno|infinix|samsung|galaxy|xiaomi|redmi|poco|oppo|realme|vivo|iqoo|oneplus|nothing|pixel|iphone|itel|symphony|walton|nokia|motorola|moto|huawei|honor|asus|rog)\s+[a-z0-9][a-z0-9+\-\s]{1,24})/i;

// ইউজারের নিজের নাম বলা শনাক্তকরণ
const SELF_NAME_BN_RE = /(?:আমার\s*নাম|আমাকে\s*সবাই|আমি\s*হলাম)\s+([\u0980-\u09FFa-zA-Z]{2,20}(?:\s+[\u0980-\u09FFa-zA-Z]{2,15})?)/;
const SELF_NAME_LATIN_RE = /\b(?:amar\s+nam|my\s+name\s+is|call\s+me)\s+([a-zA-Z]{2,20}(?:\s+[a-zA-Z]{2,15})?)/i;

// বাংলা বিভক্তি ছাঁটাই (কন্টাক্ট সার্চের জন্য)
const BN_CASE_SUFFIX_RE = /(?:ভাইয়ের|ভাইয়ের|ভাইকে|ভাইরে|আপুর|আপুকে|দেরকে|গুলোর|য়ের|য়ের|এর|কে|রে|রা|র|টা|টি)$/;

// ফলব্যাক মিনি বাংলা-টু-ল্যাটিন ম্যাপ (langGuard না থাকলেও ফাজি সার্চ সচল রাখবে)
const MINI_BN_MAP = {
    'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', 'ং': 'ng', 'ঁ': '', '্': '',
    'ক': 'k', 'খ': 'k', 'গ': 'g', 'ঘ': 'g', 'ঙ': 'ng', 'চ': 'c', 'ছ': 'c', 'জ': 'j', 'ঝ': 'j', 'ট': 't', 'ঠ': 't',
    'ড': 'd', 'ঢ': 'd', 'ণ': 'n', 'ত': 't', 'থ': 't', 'দ': 'd', 'ধ': 'd', 'ন': 'n', 'প': 'p', 'ফ': 'f', 'ব': 'b',
    'ভ': 'v', 'ম': 'm', 'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 's', 'ষ': 's', 'স': 's', 'হ': 'h', 'ড়': 'r', 'ঢ়': 'r', 'য়': 'y'
};

function getRssMb() {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function toEnglishDigits(str = '') {
    return String(str || '').replace(/[০-৯]/g, (d) => BN_DIGIT_MAP[d] || d);
}

function normalizePhoneDigits(raw = '') {
    const s = String(raw || '').trim();
    if (!s || s.endsWith('@g.us') || s.endsWith('@broadcast') || s.includes('@lid')) return '';
    let digits = toEnglishDigits(s).split('@')[0].split(':')[0].replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && digits.startsWith('01')) digits = `88${digits}`;
    else if (digits.length === 10 && /^1[3-9]/.test(digits)) digits = `880${digits}`;
    else if (digits.startsWith('00880')) digits = digits.slice(2);
    return (digits.length >= 10 && digits.length <= 15) ? digits : '';
}

function atomicWriteJson(filePath, data) {
    let tmp = '';
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
        // কম্প্যাক্ট JSON: ২৫৬MB RAM-এ স্ট্রিং হিপ ও ডিস্ক I/O ~৪৫% কমায়
        fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
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
        return (parsed && typeof parsed === 'object') ? parsed : fallback;
    } catch {
        return fallback;
    }
}

/**
 * JID নরম্যালাইজার (@s.whatsapp.net, @g.us, @lid ও বাংলা অঙ্ক নিরাপদে হ্যান্ডেল করে)
 */
function normalizeChatId(input = '') {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) {
        const [userPart, domain] = raw.split('@');
        const cleanDomain = domain.toLowerCase().trim();
        const cleanUser = toEnglishDigits(userPart.split(':')[0].trim());
        if (!cleanUser) return '';
        if (cleanDomain === 's.whatsapp.net') {
            const normPhone = normalizePhoneDigits(cleanUser);
            return `${normPhone || cleanUser}@s.whatsapp.net`;
        }
        return `${cleanUser}@${cleanDomain}`;
    }
    const normPhone = normalizePhoneDigits(raw);
    if (normPhone) return `${normPhone}@s.whatsapp.net`;
    const digits = toEnglishDigits(raw).replace(/\D/g, '');
    return digits ? `${digits}@s.whatsapp.net` : '';
}

function extractPhoneDigits(chatId = '') {
    // @lid কখনোই ফোন নম্বর হিসেবে সেভ হবে না
    return normalizePhoneDigits(chatId);
}

/**
 * বাংলা/বাংলিশ ফোনেটিক নরম্যালাইজেশন (ফাজি কন্টাক্ট ম্যাচিং)
 */
function toPhoneticKey(text = '') {
    let s = String(text || '').trim();
    if (!s) return '';

    if (/[\u0980-\u09FF]/.test(s)) {
        const words = s.split(/\s+/).map((w) => {
            const stripped = w.replace(BN_CASE_SUFFIX_RE, '');
            return stripped.length >= 2 ? stripped : w;
        });
        s = words.join(' ');
        if (langGuard && typeof langGuard.transliterateBanglaToBanglish === 'function') {
            s = langGuard.transliterateBanglaToBanglish(s);
        } else {
            s = s.replace(/[\u0980-\u09FF]/g, (ch) => MINI_BN_MAP[ch] ?? '');
        }
    }

    return toEnglishDigits(s)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/ph/g, 'f')
        .replace(/bh/g, 'v')
        .replace(/sh/g, 's')
        .replace(/ch/g, 'c')
        .replace(/kh/g, 'k')
        .replace(/gh/g, 'g')
        .replace(/th/g, 't')
        .replace(/dh/g, 'd')
        .replace(/ee|ii/g, 'i')
        .replace(/oo|uu/g, 'u')
        .replace(/ou/g, 'o')
        .replace(/z/g, 'j')
        .replace(/w/g, 'v')
        .replace(/(.)\1+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

// জিরো-GC 1D Levenshtein + Early Cutoff
function levenshtein(a = '', b = '', maxDist = 2) {
    if (a === b) return 0;
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

class MemoryEngine {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        this.profileStore = {
            globalBotEnabled: true,
            profiles: Object.create(null)
        };

        this.sessionStore = Object.create(null);

        // O(1) সেকেন্ডারি ইনডেক্স: phone -> chatId (ডিস্কে সেভ হয় না, RAM-এ খুব হালকা)
        this.phoneIndex = new Map();

        this.dirtyProfiles = false;
        this.dirtySessions = false;
        this.saveTimer = null;
        this.summarizingChats = new Set();

        this.metrics = {
            turnsRecorded: 0,
            summariesGenerated: 0,
            factsAutoLearned: 0,
            mediaIsolatedCalls: 0,
            contactResolutions: 0,
            diskFlushes: 0
        };

        this.load();

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('memoryEngine', () => this.evictColdSessions());
        }

        // ১০ মিনিট পরপর হালকা অটো-প্রুনিং
        this.pruneTimer = setInterval(() => this.evictColdSessions(), 10 * 60 * 1000);
        if (this.pruneTimer.unref) this.pruneTimer.unref();

        process.on('beforeExit', () => this.flush());
        global.memoryEngine = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        this.enforceLimits(false);
        return this;
    }

    rebuildPhoneIndex() {
        this.phoneIndex.clear();
        for (const [chatId, p] of Object.entries(this.profileStore.profiles)) {
            if (!p || p.isGroup) continue;
            // পুরোনো বাগের কারণে @lid নম্বর phone-এ ঢুকে থাকলে পরিষ্কার করো
            if (p.isLid && p.phone && chatId.startsWith(`${p.phone}@lid`)) {
                p.phone = '';
            }
            const norm = normalizePhoneDigits(p.phone || (!p.isLid ? chatId : ''));
            if (norm) {
                p.phone = norm;
                // @s.whatsapp.net প্রোফাইলকে অগ্রাধিকার দাও, নাহলে @lid রাখো
                const existing = this.phoneIndex.get(norm);
                if (!existing || chatId.endsWith('@s.whatsapp.net')) {
                    this.phoneIndex.set(norm, chatId);
                }
            }
        }
    }

    // --- লোড ও ডিবাউন্সড অ্যাটমিক সেভ ---
    load() {
        const loadedProfiles = safeReadJson(this.config.profilesFile, null);
        if (loadedProfiles && typeof loadedProfiles === 'object') {
            this.profileStore = {
                globalBotEnabled: loadedProfiles.globalBotEnabled !== false,
                profiles: loadedProfiles.profiles && typeof loadedProfiles.profiles === 'object'
                    ? loadedProfiles.profiles
                    : Object.create(null)
            };
        }

        const loadedSessions = safeReadJson(this.config.sessionsFile, {});
        if (loadedSessions && typeof loadedSessions === 'object') {
            this.sessionStore = loadedSessions;
        }

        this.rebuildPhoneIndex();
        // বুটেই ২৫৬MB RAM লিমিট এনফোর্স করা
        this.enforceLimits(false);
    }

    scheduleSave(profiles = false, sessions = false) {
        if (profiles) this.dirtyProfiles = true;
        if (sessions) this.dirtySessions = true;

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
        let wrote = false;
        if (this.dirtyProfiles) {
            this.enforceProfileLimit();
            if (atomicWriteJson(this.config.profilesFile, this.profileStore)) {
                this.dirtyProfiles = false;
                wrote = true;
            }
        }
        if (this.dirtySessions) {
            this.enforceSessionLimit();
            if (atomicWriteJson(this.config.sessionsFile, this.sessionStore)) {
                this.dirtySessions = false;
                wrote = true;
            }
        }
        if (wrote) this.metrics.diskFlushes++;
        return wrote;
    }

    enforceLimits(scheduleDisk = true) {
        const pDropped = this.enforceProfileLimit();
        const sDropped = this.enforceSessionLimit();
        if (scheduleDisk && (pDropped || sDropped)) {
            this.scheduleSave(pDropped > 0, sDropped > 0);
        }
    }

    enforceProfileLimit() {
        const entries = Object.entries(this.profileStore.profiles);
        if (entries.length <= this.config.maxProfilesLimit) return 0;

        // বন্ধ/পজ, VIP বা কাস্টমার প্রোফাইল সুরক্ষিত থাকবে
        const droppable = entries
            .filter(([, p]) => p && p.botEnabled !== false && !p.pausedUntil && !p.isVip && !p.isCustomer)
            .sort((a, b) => (a[1].lastSeenAt || 0) - (b[1].lastSeenAt || 0));

        const excess = entries.length - this.config.maxProfilesLimit;
        let removed = 0;
        for (let i = 0; i < Math.min(excess, droppable.length); i++) {
            const [chatId, prof] = droppable[i];
            delete this.profileStore.profiles[chatId];
            delete this.sessionStore[chatId];
            if (prof?.phone && this.phoneIndex.get(prof.phone) === chatId) {
                this.phoneIndex.delete(prof.phone);
            }
            removed++;
        }
        return removed;
    }

    enforceSessionLimit() {
        const entries = Object.entries(this.sessionStore);
        let changed = 0;
        const now = Date.now();

        for (const [chatId, session] of entries) {
            if (!session || !Array.isArray(session.turns) || !session.turns.length) {
                delete this.sessionStore[chatId];
                changed++;
                continue;
            }
            if ((now - (session.updatedAt || 0)) > this.config.coldSessionDropMs) {
                delete this.sessionStore[chatId];
                changed++;
                continue;
            }
            if (session.turns.length > this.config.maxTurnsStoredPerChat) {
                session.turns = session.turns.slice(-this.config.maxTurnsStoredPerChat);
                changed++;
            }
        }

        const remaining = Object.entries(this.sessionStore);
        if (remaining.length > this.config.maxSessionsLimit) {
            remaining.sort((a, b) => (a[1]?.updatedAt || 0) - (b[1]?.updatedAt || 0));
            const toDrop = remaining.length - this.config.maxSessionsLimit;
            for (let i = 0; i < toDrop; i++) {
                delete this.sessionStore[remaining[i][0]];
                changed++;
            }
        }
        return changed;
    }

    // --- প্রোফাইল ম্যানেজমেন্ট ও কন্টাক্ট ডিরেক্টরি ---
    resolveExistingChatId(chatIdInput) {
        const norm = normalizeChatId(chatIdInput);
        if (!norm) return '';
        if (this.profileStore.profiles[norm]) return norm;

        const phone = normalizePhoneDigits(norm);
        if (phone && this.phoneIndex.has(phone)) {
            const mapped = this.phoneIndex.get(phone);
            if (this.profileStore.profiles[mapped]) return mapped;
        }
        return norm;
    }

    ensureProfile(chatIdInput, meta = {}) {
        const chatId = this.resolveExistingChatId(chatIdInput);
        if (!chatId) return null;

        const now = Date.now();
        let profile = this.profileStore.profiles[chatId];
        let changed = false;

        if (!profile) {
            const isGroup = chatId.endsWith('@g.us');
            const isLid = chatId.endsWith('@lid');
            const phone = normalizePhoneDigits(meta.phone || (!isLid ? chatId : ''));

            profile = {
                chatId,
                isGroup,
                isLid,
                phone,
                pushName: '',
                savedName: '',
                groupSubject: '',
                aliases: [],
                deviceModel: '',
                notes: [],
                summary: '',
                isVip: false,
                isCustomer: false,
                botEnabled: true,
                disabledReason: '',
                pausedUntil: 0,
                pauseReason: '',
                totalMessages: 0,
                firstSeenAt: now,
                lastSeenAt: now
            };
            this.profileStore.profiles[chatId] = profile;
            if (phone && !isGroup) this.phoneIndex.set(phone, chatId);
            changed = true;
        }

        const cleanPush = String(meta.pushName || '').trim();
        if (cleanPush && cleanPush !== profile.pushName && cleanPush.length <= 60) {
            profile.pushName = cleanPush;
            changed = true;
        }

        const cleanSaved = String(meta.savedName || '').trim();
        if (cleanSaved && cleanSaved !== profile.savedName && cleanSaved.length <= 60) {
            profile.savedName = cleanSaved;
            changed = true;
        }

        const cleanGroup = String(meta.groupSubject || '').trim();
        if (cleanGroup && cleanGroup !== profile.groupSubject && cleanGroup.length <= 80) {
            profile.groupSubject = cleanGroup;
            changed = true;
        }

        if (meta.phone) {
            const normPhone = normalizePhoneDigits(meta.phone);
            if (normPhone && normPhone !== profile.phone) {
                profile.phone = normPhone;
                if (!profile.isGroup) this.phoneIndex.set(normPhone, chatId);
                changed = true;
            }
        }

        profile.lastSeenAt = now;
        if (changed) this.scheduleSave(true, false);
        return profile;
    }

    getProfile(chatIdInput) {
        const key = this.resolveExistingChatId(chatIdInput);
        return key ? (this.profileStore.profiles[key] || null) : null;
    }

    getAllProfiles() {
        return this.profileStore.profiles;
    }

    listProfiles() {
        return Object.values(this.profileStore.profiles);
    }

    getDisplayName(profile) {
        if (!profile) return 'অজানা';
        return profile.savedName || profile.groupSubject || profile.pushName || profile.aliases?.[0] || profile.phone || profile.chatId;
    }

    addAlias(chatIdInput, alias) {
        const profile = this.ensureProfile(chatIdInput);
        const clean = String(alias || '').trim();
        if (!profile || !clean) return false;
        if (!Array.isArray(profile.aliases)) profile.aliases = [];
        if (!profile.aliases.some((a) => a.toLowerCase() === clean.toLowerCase())) {
            profile.aliases.push(clean.slice(0, 40));
            if (profile.aliases.length > 5) profile.aliases.shift();
            this.scheduleSave(true, false);
        }
        return true;
    }

    addNote(chatIdInput, note) {
        const profile = this.ensureProfile(chatIdInput);
        const clean = String(note || '').trim();
        if (!profile || !clean) return false;
        if (!Array.isArray(profile.notes)) profile.notes = [];
        if (!profile.notes.includes(clean)) {
            profile.notes.push(clean.slice(0, 140));
            if (profile.notes.length > 6) profile.notes.shift();
            this.scheduleSave(true, false);
        }
        return true;
    }

    markAsCustomer(chatIdInput, note = '') {
        const profile = this.ensureProfile(chatIdInput);
        if (!profile) return false;
        profile.isCustomer = true;
        if (note) this.addNote(chatIdInput, note);
        this.scheduleSave(true, false);
        return true;
    }

    setVip(chatIdInput, isVip = true) {
        const profile = this.ensureProfile(chatIdInput);
        if (!profile) return false;
        profile.isVip = Boolean(isVip);
        this.scheduleSave(true, false);
        return true;
    }

    autoExtractFacts(profile, userText = '') {
        const text = String(userText || '').trim();
        if (!profile || !text || profile.isGroup) return;

        let learned = false;

        const devMatch = text.match(DEVICE_MODEL_RE);
        if (devMatch && devMatch[1]) {
            const model = devMatch[1].replace(/\s+/g, ' ').trim();
            if (model.length >= 4 && model.length <= 32 && model.toLowerCase() !== (profile.deviceModel || '').toLowerCase()) {
                profile.deviceModel = model;
                learned = true;
            }
        }

        if (!profile.savedName) {
            const bnName = text.match(SELF_NAME_BN_RE);
            const enName = !bnName ? text.match(SELF_NAME_LATIN_RE) : null;
            const candidate = (bnName?.[1] || enName?.[1] || '').trim();
            const badWords = new Set(['ভালো', 'খারাপ', 'কি', 'কী', 'বট', 'না', 'নাই', 'fine', 'good', 'ok', 'bot', 'here']);
            if (candidate && candidate.length >= 2 && !badWords.has(candidate.toLowerCase())) {
                profile.savedName = candidate;
                learned = true;
            }
        }

        if (learned) {
            this.metrics.factsAutoLearned++;
            this.scheduleSave(true, false);
        }
    }

    // =========================================================================
    // পার-ইনবক্স ও গ্লোবাল বট অন/অফ এবং টাইমড পজ সিস্টেম
    // =========================================================================

    setGlobalBotEnabled(enabled) {
        this.profileStore.globalBotEnabled = Boolean(enabled);
        this.scheduleSave(true, false);
        return this.profileStore.globalBotEnabled;
    }

    setChatBotEnabled(chatIdInput, enabled, reason = '') {
        const profile = this.ensureProfile(chatIdInput);
        if (!profile) return null;
        profile.botEnabled = Boolean(enabled);
        profile.disabledReason = enabled ? '' : String(reason || 'owner_disabled');
        if (enabled) {
            profile.pausedUntil = 0;
            profile.pauseReason = '';
        }
        this.scheduleSave(true, false);
        return profile;
    }

    pauseChat(chatIdInput, minutes = 30, reason = 'owner_pause') {
        const profile = this.ensureProfile(chatIdInput);
        if (!profile) return null;
        const mins = Math.max(1, Math.min(1440, Number(minutes) || 30));
        profile.pausedUntil = Date.now() + mins * 60 * 1000;
        profile.pauseReason = String(reason || 'owner_pause');
        this.scheduleSave(true, false);
        return { profile, minutes: mins, pausedUntil: profile.pausedUntil };
    }

    resumeChat(chatIdInput) {
        const profile = this.ensureProfile(chatIdInput);
        if (!profile) return null;
        profile.botEnabled = true;
        profile.disabledReason = '';
        profile.pausedUntil = 0;
        profile.pauseReason = '';
        this.scheduleSave(true, false);
        return profile;
    }

    isBotActiveInChat(chatIdInput) {
        if (!this.profileStore.globalBotEnabled) {
            return { active: false, reason: 'global_off' };
        }
        const profile = this.getProfile(chatIdInput);
        if (!profile) return { active: true, reason: 'default_on' };

        if (profile.botEnabled === false) {
            return { active: false, reason: profile.disabledReason || 'chat_off' };
        }

        if (profile.pausedUntil && profile.pausedUntil > 0) {
            if (profile.pausedUntil > Date.now()) {
                return {
                    active: false,
                    reason: profile.pauseReason || 'paused',
                    remainingMin: Math.ceil((profile.pausedUntil - Date.now()) / 60000)
                };
            }
            profile.pausedUntil = 0;
            profile.pauseReason = '';
            this.scheduleSave(true, false);
        }

        return { active: true, reason: 'active' };
    }

    listInboxStatuses() {
        const now = Date.now();
        const disabledChats = [];
        const pausedChats = [];
        let changed = false;

        for (const p of Object.values(this.profileStore.profiles)) {
            if (!p) continue;
            if (p.pausedUntil && p.pausedUntil <= now) {
                p.pausedUntil = 0;
                p.pauseReason = '';
                changed = true;
            }

            if (p.botEnabled === false) {
                disabledChats.push({
                    chatId: p.chatId,
                    name: this.getDisplayName(p),
                    phone: p.phone,
                    isGroup: Boolean(p.isGroup),
                    reason: p.disabledReason || 'off',
                    lastSeenAt: p.lastSeenAt
                });
            } else if (p.pausedUntil && p.pausedUntil > now) {
                pausedChats.push({
                    chatId: p.chatId,
                    name: this.getDisplayName(p),
                    phone: p.phone,
                    isGroup: Boolean(p.isGroup),
                    remainingMin: Math.ceil((p.pausedUntil - now) / 60000),
                    reason: p.pauseReason || 'paused',
                    lastSeenAt: p.lastSeenAt
                });
            }
        }

        if (changed) this.scheduleSave(true, false);

        return {
            globalBotEnabled: this.profileStore.globalBotEnabled,
            disabledChats,
            pausedChats,
            totalKnownChats: Object.keys(this.profileStore.profiles).length
        };
    }

    // =========================================================================
    // বাংলা-টু-ইংলিশ ফাজি কন্টাক্ট ও ইনবক্স রিজল্ভার (বাংলা অঙ্ক + ডুয়েল ইনডেক্স)
    // =========================================================================

    resolveContact(query = '', { onlyPrivate = false, onlyGroups = false, maxResults = 5 } = {}) {
        this.metrics.contactResolutions++;
        const raw = String(query || '').trim();
        if (!raw) return { found: false, ambiguous: false, best: null, matches: [] };

        const enRaw = toEnglishDigits(raw);
        const digitsOnly = enRaw.replace(/\D/g, '');

        // ১. সরাসরি পূর্ণ ফোন নম্বর বা JID (O(1) phoneIndex সাপোর্টসহ)
        if (enRaw.includes('@') || digitsOnly.length >= 10) {
            const existingKey = this.resolveExistingChatId(enRaw);
            const existing = this.profileStore.profiles[existingKey];
            if (existing) {
                const hit = { chatId: existing.chatId, name: this.getDisplayName(existing), phone: existing.phone, score: 1.0, profile: existing };
                return { found: true, ambiguous: false, best: hit, matches: [hit] };
            }
            const normPhone = normalizePhoneDigits(enRaw);
            if (normPhone) {
                const normJid = `${normPhone}@s.whatsapp.net`;
                const hit = { chatId: normJid, name: `+${normPhone}`, phone: normPhone, score: 0.98, isNewNumber: true };
                return { found: true, ambiguous: false, best: hit, matches: [hit] };
            }
        }

        const queryLower = raw.toLowerCase();
        const queryPhonetic = toPhoneticKey(raw);
        const queryTokens = queryPhonetic.split(/\s+/).filter((t) => t.length >= 2);
        const scored = [];

        for (const p of Object.values(this.profileStore.profiles)) {
            if (!p) continue;
            if (onlyPrivate && p.isGroup) continue;
            if (onlyGroups && !p.isGroup) continue;

            let bestScore = 0;

            if (digitsOnly.length >= 4 && p.phone && p.phone.endsWith(digitsOnly)) {
                bestScore = Math.max(bestScore, digitsOnly.length >= 6 ? 0.99 : 0.92);
            }

            const nameCandidates = [
                p.savedName,
                p.groupSubject,
                p.pushName,
                ...(Array.isArray(p.aliases) ? p.aliases : [])
            ].filter(Boolean);

            for (const cand of nameCandidates) {
                const cLower = cand.toLowerCase().trim();
                if (!cLower) continue;

                if (cLower === queryLower) {
                    bestScore = 1.0;
                    break;
                }

                const cPhonetic = toPhoneticKey(cand);
                if (!cPhonetic) continue;

                if (queryPhonetic && cPhonetic === queryPhonetic) {
                    bestScore = 1.0;
                    break;
                }

                if (queryPhonetic && queryPhonetic.length >= 2) {
                    const cWords = cPhonetic.split(/\s+/).filter(Boolean);
                    if (cWords.some((w) => w === queryPhonetic)) {
                        bestScore = Math.max(bestScore, 0.94);
                        continue;
                    }
                    if (cWords.some((w) => w.startsWith(queryPhonetic)) || cPhonetic.includes(queryPhonetic)) {
                        bestScore = Math.max(bestScore, 0.86);
                        continue;
                    }

                    if (queryTokens.length > 0) {
                        let tokenHits = 0;
                        for (const qt of queryTokens) {
                            if (cWords.some((cw) => cw === qt || cw.startsWith(qt) || (qt.length >= 4 && levenshtein(cw, qt, 1) <= 1))) {
                                tokenHits++;
                            }
                        }
                        if (tokenHits > 0) {
                            bestScore = Math.max(bestScore, 0.62 + (tokenHits / queryTokens.length) * 0.28);
                        }
                    }

                    for (const cw of cWords) {
                        if (cw.length >= 4 && queryPhonetic.length >= 4) {
                            const dist = levenshtein(cw, queryPhonetic, 2);
                            if (dist <= 2) {
                                const sim = 1 - dist / Math.max(cw.length, queryPhonetic.length);
                                if (sim >= 0.72) {
                                    bestScore = Math.max(bestScore, Number((sim * 0.88).toFixed(2)));
                                }
                            }
                        }
                    }
                }
            }

            if (bestScore >= 0.62) {
                const recencyBoost = (Date.now() - (p.lastSeenAt || 0)) < 24 * 60 * 60 * 1000 ? 0.02 : 0;
                scored.push({
                    chatId: p.chatId,
                    name: this.getDisplayName(p),
                    phone: p.phone,
                    isGroup: Boolean(p.isGroup),
                    score: Math.min(1.0, Number((bestScore + recencyBoost).toFixed(3))),
                    profile: p
                });
            }
        }

        scored.sort((a, b) => b.score - a.score || (b.profile.lastSeenAt || 0) - (a.profile.lastSeenAt || 0));
        const top = scored.slice(0, maxResults);

        if (!top.length) return { found: false, ambiguous: false, best: null, matches: [] };

        const ambiguous = top.length >= 2 && (top[0].score - top[1].score) < 0.08 && top[0].score < 0.99;
        return { found: true, ambiguous, best: top[0], matches: top };
    }

    // =========================================================================
    // ৩-স্তরের চ্যাট মেমোরি, মিডিয়া আইসোলেশন ও রেস-ফ্রি অটো-সামারাইজার
    // =========================================================================

    recordTurn(chatIdInput, { role = 'user', text = '', kind = 'text', senderName = '', meta = {} } = {}) {
        const chatId = this.resolveExistingChatId(chatIdInput);
        if (!chatId) return;

        const cleanText = String(text || '').trim().slice(0, this.config.maxTurnChars);
        if (!cleanText && kind === 'text') return;

        const profile = this.ensureProfile(chatId, meta);
        if (profile && role === 'user') {
            profile.totalMessages = (profile.totalMessages || 0) + 1;
            this.autoExtractFacts(profile, cleanText);
        }

        let session = this.sessionStore[chatId];
        if (!session || !Array.isArray(session.turns)) {
            session = { turns: [], updatedAt: Date.now() };
            this.sessionStore[chatId] = session;
        }

        const now = Date.now();
        session.turns.push({
            role: role === 'assistant' || role === 'model' ? 'assistant' : 'user',
            text: cleanText || `[${kind}]`,
            kind,
            senderName: String(senderName || '').slice(0, 32),
            ts: now
        });
        session.updatedAt = now;
        this.metrics.turnsRecorded++;

        if (session.turns.length >= this.config.summarizeThreshold) {
            this.triggerBackgroundSummary(chatId).catch(() => {});
        }

        if (session.turns.length > this.config.maxTurnsStoredPerChat) {
            session.turns = session.turns.slice(-this.config.maxTurnsStoredPerChat);
        }

        this.scheduleSave(true, true);
    }

    /**
     * রেস-ফ্রি ও RAM-গার্ডেড ব্যাকগ্রাউন্ড সামারাইজার (সর্বোচ্চ ১টি কনকারেন্ট জব)
     */
    async triggerBackgroundSummary(chatId) {
        if (!aiOrchestrator || this.summarizingChats.size >= 1 || this.summarizingChats.has(chatId)) return;
        if (getRssMb() >= this.config.ramSummaryGuardMb) return;

        const session = this.sessionStore[chatId];
        const profile = this.profileStore.profiles[chatId];
        if (!session || !profile || session.turns.length < this.config.summarizeThreshold) return;

        this.summarizingChats.add(chatId);
        try {
            const batch = session.turns.slice(0, this.config.summarizeBatchSize);
            const lastBatchTs = batch[batch.length - 1]?.ts || 0;
            if (!lastBatchTs) return;

            const transcript = batch
                .map((t) => `${t.role === 'user' ? 'User' : 'Mahiru'} (${t.kind}): ${t.text.slice(0, 200)}`)
                .join('\n');

            const prompt = [
                'নিচের হোয়াটসঅ্যাপ কথোপকথনের গুরুত্বপূর্ণ তথ্যগুলো (নাম, চাহিদা, সমস্যা, ফোনের মডেল, সিদ্ধান্ত) মাত্র ২-৩টি ছোট বাংলা বাক্যে সংক্ষেপে সারসংক্ষেপ করো।',
                profile.summary ? `আগের সামারি: ${profile.summary}` : '',
                `নতুন অংশ:\n${transcript}`,
                'শুধু আপডেটেড সংক্ষিপ্ত সামারিটি লেখো (সর্বোচ্চ ৩৫০ অক্ষর)।'
            ].filter(Boolean).join('\n\n');

            const res = await aiOrchestrator.generateReply({
                systemPrompt: 'You write ultra-concise factual memory summaries in Bangla. No greetings, no fluff.',
                userText: prompt,
                temperature: 0.2,
                maxTokens: 190,
                preferSpeed: true,
                timeoutMs: 9000
            });

            if (res?.ok && res.text) {
                profile.summary = res.text.trim().slice(0, this.config.maxSummaryChars);
                // টাইমস্ট্যাম্প ধরে শুধু সামারাইজড টার্নগুলোই বাদ দেওয়া (নতুন টার্ন কখনো হারাবে না!)
                const liveSession = this.sessionStore[chatId];
                if (liveSession && Array.isArray(liveSession.turns)) {
                    liveSession.turns = liveSession.turns.filter((t) => (t.ts || 0) > lastBatchTs);
                }
                this.metrics.summariesGenerated++;
                this.scheduleSave(true, true);
            }
        } catch {} finally {
            this.summarizingChats.delete(chatId);
        }
    }

    getPromptHistory(chatIdInput, { maxTurns = this.config.defaultPromptTurns, isolatePreviousMedia = false } = {}) {
        const chatId = this.resolveExistingChatId(chatIdInput);
        const session = chatId ? this.sessionStore[chatId] : null;
        if (!session || !Array.isArray(session.turns) || !session.turns.length) return [];

        let turns = session.turns;
        if (isolatePreviousMedia) {
            this.metrics.mediaIsolatedCalls++;
            const filtered = [];
            for (let i = 0; i < turns.length; i++) {
                const t = turns[i];
                const isVisualMedia = t.kind === 'image' || t.kind === 'video' || t.kind === 'document';
                if (isVisualMedia && t.role === 'user') {
                    if (turns[i + 1] && turns[i + 1].role === 'assistant') i++;
                    continue;
                }
                filtered.push(t);
            }
            turns = filtered;
        }

        return turns.slice(-maxTurns).map((t) => ({
            role: t.role,
            text: t.role === 'user' && t.senderName && chatId.endsWith('@g.us')
                ? `${t.senderName}: ${t.text}`
                : t.text
        }));
    }

    getProfileContextBlock(chatIdInput) {
        const p = this.getProfile(chatIdInput);
        if (!p) return '';

        const lines = [];
        const name = p.savedName || p.pushName;
        if (name) lines.push(`- নাম: ${name}`);
        if (p.deviceModel) lines.push(`- ফোনের মডেল: ${p.deviceModel}`);
        if (p.isCustomer) lines.push('- স্ট্যাটাস: সার্ভিস কাস্টমার');
        if (p.isVip) lines.push('- স্ট্যাটাস: VIP ইউজার');
        if (Array.isArray(p.notes) && p.notes.length) lines.push(`- বিশেষ নোট: ${p.notes.slice(-3).join(' | ')}`);
        if (p.summary) lines.push(`- আগের কথার সারসংক্ষেপ: ${p.summary}`);

        return lines.length ? `[USER MEMORY PROFILE]\n${lines.join('\n')}` : '';
    }

    formatMemoryCard(chatIdInput) {
        const p = this.getProfile(chatIdInput);
        const resolvedId = this.resolveExistingChatId(chatIdInput);
        const s = resolvedId ? this.sessionStore[resolvedId] : null;
        if (!p) return '🧠 এই চ্যাট সম্পর্কে এখনো কোনো মেমোরি সংরক্ষিত নেই।';

        const status = this.isBotActiveInChat(p.chatId);
        const statusText = status.active
            ? '🟢 চালু'
            : status.remainingMin
                ? `⏸️ পজ (${status.remainingMin} মিনিট বাকি)`
                : '🔴 বন্ধ';

        const lines = [
            `🧠 *মেমোরি প্রোফাইল: ${this.getDisplayName(p)}*`,
            '──────────────────',
            `• নম্বর/আইডি: \`${p.phone || p.chatId}\``,
            `• বট স্ট্যাটাস: ${statusText}`,
            `• মোট মেসেজ: *${p.totalMessages || 0}টি* | শর্ট-টার্ম টার্ন: *${s?.turns?.length || 0}টি*`
        ];
        if (p.deviceModel) lines.push(`• ফোনের মডেল: *${p.deviceModel}*`);
        if (p.notes?.length) lines.push(`• নোট: ${p.notes.join(' | ')}`);
        if (p.summary) lines.push(`• সারসংক্ষেপ: ${p.summary}`);

        return lines.join('\n');
    }

    forgetChat(chatIdInput, { keepBotSettings = true } = {}) {
        const chatId = this.resolveExistingChatId(chatIdInput);
        if (!chatId) return false;

        delete this.sessionStore[chatId];
        const p = this.profileStore.profiles[chatId];
        if (p) {
            if (keepBotSettings) {
                p.summary = '';
                p.notes = [];
                p.deviceModel = '';
            } else {
                if (p.phone && this.phoneIndex.get(p.phone) === chatId) this.phoneIndex.delete(p.phone);
                delete this.profileStore.profiles[chatId];
            }
        }
        this.scheduleSave(true, true);
        return true;
    }

    evictColdSessions() {
        const now = Date.now();
        let mutatedSessions = 0;

        for (const [chatId, session] of Object.entries(this.sessionStore)) {
            if (!session || !Array.isArray(session.turns)) {
                delete this.sessionStore[chatId];
                mutatedSessions++;
                continue;
            }
            const age = now - (session.updatedAt || 0);
            if (age > this.config.coldSessionDropMs) {
                delete this.sessionStore[chatId];
                mutatedSessions++;
            } else if (age > this.config.hotSessionTtlMs && session.turns.length > 4) {
                session.turns = session.turns.slice(-4);
                mutatedSessions++;
            }
        }

        mutatedSessions += this.enforceSessionLimit();
        const droppedProfiles = this.enforceProfileLimit();

        if (mutatedSessions > 0 || droppedProfiles > 0) {
            this.scheduleSave(droppedProfiles > 0, mutatedSessions > 0);
        }
    }

    getStats() {
        const status = this.listInboxStatuses();
        return {
            globalBotEnabled: status.globalBotEnabled,
            totalProfiles: status.totalKnownChats,
            activeSessions: Object.keys(this.sessionStore).length,
            disabledInboxes: status.disabledChats.length,
            pausedInboxes: status.pausedChats.length,
            ...this.metrics
        };
    }
}

const memoryEngine = new MemoryEngine();

module.exports = {
    MemoryEngine,
    memoryEngine,
    normalizeChatId,
    toPhoneticKey,
    ensureProfile: (id, meta) => memoryEngine.ensureProfile(id, meta),
    getProfile: (id) => memoryEngine.getProfile(id),
    getAllProfiles: () => memoryEngine.getAllProfiles(),
    listProfiles: () => memoryEngine.listProfiles(),
    getDisplayName: (p) => memoryEngine.getDisplayName(p),
    recordTurn: (id, turn) => memoryEngine.recordTurn(id, turn),
    getPromptHistory: (id, opts) => memoryEngine.getPromptHistory(id, opts),
    getProfileContextBlock: (id) => memoryEngine.getProfileContextBlock(id),
    setGlobalBotEnabled: (en) => memoryEngine.setGlobalBotEnabled(en),
    setChatBotEnabled: (id, en, reason) => memoryEngine.setChatBotEnabled(id, en, reason),
    pauseChat: (id, mins, reason) => memoryEngine.pauseChat(id, mins, reason),
    resumeChat: (id) => memoryEngine.resumeChat(id),
    isBotActiveInChat: (id) => memoryEngine.isBotActiveInChat(id),
    listInboxStatuses: () => memoryEngine.listInboxStatuses(),
    resolveContact: (q, opts) => memoryEngine.resolveContact(q, opts),
    addContactAlias: (id, alias) => memoryEngine.addAlias(id, alias),
    addContactNote: (id, note) => memoryEngine.addNote(id, note),
    markAsCustomer: (id, note) => memoryEngine.markAsCustomer(id, note),
    setVip: (id, flag) => memoryEngine.setVip(id, flag),
    formatMemoryCard: (id) => memoryEngine.formatMemoryCard(id),
    forgetChat: (id, opts) => memoryEngine.forgetChat(id, opts),
    evictColdSessions: () => memoryEngine.evictColdSessions(),
    flushMemory: () => memoryEngine.flush(),
    getMemoryStats: () => memoryEngine.getStats()
};
