/**
 * PRIME MONIR • Maya v2.0 ULTRA — Local Mini-RAG Knowledge Base & Smart Lead Handoff CRM
 * Tuned for 256MB RAM (Pre-Indexed Fast Retriever, Collision-Free CRM File, Bounded Maps)
 * Fixed: Canonical Bangla Normalizer (য়/ড়/ঢ় Composition Preserved) + Live Zero-Code Branding Sync
 * 100% Backward-Compatible Exports
 */

const fs = require('fs');
const path = require('path');

let settings = null;
try { settings = require('../settings'); } catch {}

let systemControl = null;
try { systemControl = require('./systemControl'); } catch {}

let memoryEngine = null;
let toPhoneticKey = null;
try {
    ({ memoryEngine, toPhoneticKey } = require('./memoryEngine'));
} catch {}

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

const kbCfg = settings?.maya?.knowledge || {};

const DEFAULT_CONFIG = {
    knowledgeFile: './data/knowledge.json',
    leadsFile: './data/leads_crm.json',         // mayaCore-এর leads.json-এর সাথে ফাইল কনফ্লিক্ট মুক্ত
    legacyLeadsFile: './data/leads.json',
    maxRetrievedChunks: Math.min(Number(kbCfg.maxRetrievedChunks || 3), 5),
    maxKnowledgeEntries: 120,                   // ২৫৬MB RAM বাউন্ডেড নলেজ লিমিট
    maxLeadsStored: 120,                        // ২৫৬MB RAM বাউন্ডেড CRM লিমিট
    maxAlertCooldowns: 150,
    leadAlertCooldownMs: Number(kbCfg.leadAlertCooldownMs || 30 * 60 * 1000),
    handoffPauseMinutes: Number(kbCfg.handoffPauseMinutes || 25),
    ownerNotifyEnabled: kbCfg.ownerNotifyEnabled !== false
};

// Tier B Handoff: সরাসরি ওনারকে চাওয়া, পেমেন্ট কনফার্ম বা ক্ষোভ শনাক্তকরণ (ক্যানোনিকাল বাংলায়)
const DIRECT_OWNER_ASK_RE = /(?:ওনার(?:ের|কে)?\\s*(?:সাথে\\s*(?:সরাসরি\\s*|একটু\\s*)?কথা|সরাসরি\\s*কথা|দাও|ডাকো)|মানুষের\\s*সাথে\\s*(?:সরাসরি\\s*)?কথা|বট\\s*না\\s*আসল\\s*মানুষ|কল\\s*করতে\\s*চাই|talk\\s*to\\s*(?:owner|human|real\\s*person))/i;\nconst PAYMENT_READY_RE = /(?:বিকাশ|নগদ|রকেট|bkash|nagad|rocket).*(?:নম্বর|নাম্বার|দাও|পাঠালাম|পাঠিয়েছি|সেন্ড\s*করেছি|পেমেন্ট|টাকা\s*দিয়েছি|trx|ট্রানজেকশন)|(?:টাকা\s*পাঠিয়েছি|পেমেন্ট\s*করেছি|অর্ডার\s*করব|কাজ\s*কনফার্ম)/i;
const ANGRY_ESCALATION_RE = /(?:ফালতু\s*বট|বিরক্তিকর|বাজে\s*সার্ভিস|চিটার|প্রতারক|টাকা\s*মেরে|রিফান্ড|refund|scam|fake\s*bot|ভুলভাল\s*বলছিস|মাথা\s*নষ্ট)/i;

// প্রথমবার ফাইল না থাকলে স্বয়ংক্রিয়ভাবে সিড হওয়া ডিফল্ট নলেজ বেস
const DEFAULT_KNOWLEDGE_SEED = [];

// বাংলা ক্যানোনিকাল নরম্যালাইজার (NFC-তে ভেঙে যাওয়া য়/ড়/ঢ় অক্ষত রাখে)
function normalizeBn(str = '') {
    return String(str || '')
        .normalize('NFC')
        .replace(/\u09AF\u09BC/g, 'য়')
        .replace(/\u09A1\u09BC/g, 'ড়')
        .replace(/\u09A2\u09BC/g, 'ঢ়');
}

function getLiveBranding() {
    try {
        if (typeof systemControl?.getBotBranding === 'function') {
            const b = systemControl.getBotBranding();
            return {
                botName: b.botName || settings?.botName || 'Mahiru Shiina',
                assistantName: b.assistantName || settings?.assistantName || 'Mahiru',
                ownerName: b.ownerName || settings?.botOwner || 'MSK',
                website: (b.ownerWebsite || settings?.ownerWebsite || '').replace(/\/+$/, '')
            };
        }
    } catch {}
    return {
        botName: settings?.botName || 'Mahiru Shiina',
        assistantName: settings?.assistantName || 'Mahiru',
        ownerName: settings?.botOwner || 'MSK',
        website: (settings?.ownerWebsite || '').replace(/\/+$/, '')
    };
}

function resolveDynamicUrl(url = '') {
    const clean = String(url || '').trim();
    if (!clean) return '';
    const liveSite = getLiveBranding().website;
    if (clean.includes('{WEBSITE}')) {
        return clean.replace(/\{WEBSITE\}/g, liveSite);
    }
    if (liveSite && liveSite !== 'https://prime-web.netlify.app' && clean.startsWith('https://prime-web.netlify.app')) {
        return clean.replace('https://prime-web.netlify.app', liveSite);
    }
    return clean;
}

function getDhakaStartOfTodayMs() {
    const dhakaOffsetMs = 6 * 60 * 60 * 1000;
    const nowDhaka = new Date(Date.now() + dhakaOffsetMs);
    nowDhaka.setUTCHours(0, 0, 0, 0);
    return nowDhaka.getTime() - dhakaOffsetMs;
}

function atomicWriteJson(filePath, data, compact = false) {
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

function tokenizeMixed(text = '') {
    const raw = normalizeBn(text).toLowerCase();
    const matches = raw.match(/[\u0980-\u09FFa-z0-9]+/g) || [];
    return [...new Set(matches.filter((w) => w.length >= 2))];
}

function fallbackPhonetic(text = '') {
    const clean = normalizeBn(text);
    if (typeof toPhoneticKey === 'function') return toPhoneticKey(clean);
    return clean.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugifyId(title = '') {
    const base = fallbackPhonetic(title).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 28);
    return `${base || 'kb'}_${Date.now().toString(36).slice(-4)}`;
}

function extractSafePhone(chatId = '', profile = null) {
    if (profile?.phone && !String(profile.phone).includes('@lid')) {
        const p = String(profile.phone).replace(/\D/g, '');
        if (p.length >= 10 && p.length <= 15) return p;
    }
    const raw = String(chatId || '');
    if (!raw || raw.includes('@lid') || raw.endsWith('@g.us')) return '';
    if (typeof settings?.normalizePhone === 'function') {
        return settings.normalizePhone(raw);
    }
    const d = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
    return (d.length >= 10 && d.length <= 15) ? d : '';
}

class KnowledgeAndLeadEngine {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };
        this.entries = [];
        this.searchIndex = [];
        this.leads = [];
        this.alertCooldowns = new Map();

        this.metrics = {
            retrievals: 0,
            hits: 0,
            kbMutations: 0,
            leadsRecorded: 0,
            alertsSent: 0,
            handoffPauses: 0
        };

        this.loadKnowledge();
        this.loadLeads();

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('knowledgeEngine', () => this.sweepAlertCooldowns());
        }

        global.knowledgeEngine = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    setOwnerNotifyEnabled(enabled) {
        this.config.ownerNotifyEnabled = Boolean(enabled);
        return this.config.ownerNotifyEnabled;
    }

    // =========================================================================
    // পার্ট ১: প্রি-ইনডেক্সড লোকাল মিনি-RAG নলেজ বেস (অটো-সিড + লাইভ CRUD)
    // =========================================================================

    rebuildSearchIndex() {
        this.searchIndex = this.entries.map((entry) => {
            const titleLower = normalizeBn(entry.title || '').toLowerCase();
            const contentLower = normalizeBn(entry.content || '').toLowerCase();
            const tagsLower = (Array.isArray(entry.tags) ? entry.tags : [])
                .map((t) => normalizeBn(t).toLowerCase().trim())
                .filter(Boolean);
            const tagPhonetics = tagsLower.map((t) => fallbackPhonetic(t)).filter(Boolean);
            const entryPhonetic = fallbackPhonetic(`${entry.title || ''} ${tagsLower.join(' ')}`);

            return {
                entry,
                titleLower,
                contentLower,
                tagsLower,
                tagPhonetics,
                entryPhonetic
            };
        });
    }

    loadKnowledge() {
        const loaded = safeReadJson(this.config.knowledgeFile, null);
        if (Array.isArray(loaded) && loaded.length > 0) {
            this.entries = loaded.slice(0, this.config.maxKnowledgeEntries);
            this.rebuildSearchIndex();
            return;
        }
        this.entries = DEFAULT_KNOWLEDGE_SEED.map((item) => ({
            ...item,
            updatedAt: Date.now()
        }));
        this.rebuildSearchIndex();
        atomicWriteJson(this.config.knowledgeFile, this.entries, false);
    }

    saveKnowledge() {
        if (this.entries.length > this.config.maxKnowledgeEntries) {
            this.entries = this.entries.slice(-this.config.maxKnowledgeEntries);
        }
        this.rebuildSearchIndex();
        return atomicWriteJson(this.config.knowledgeFile, this.entries, false);
    }

    addEntry({ id = '', category = 'general', title = '', tags = [], content = '', url = '' } = {}) {
        const cleanContent = normalizeBn(content).trim().slice(0, 900);
        const cleanTitle = normalizeBn(title).trim().slice(0, 80) || cleanContent.slice(0, 40);
        if (!cleanContent) return { ok: false, error: 'নলেজের বিষয়বস্তু খালি হতে পারবে না।' };

        const cleanTags = Array.isArray(tags)
            ? tags.map((t) => normalizeBn(t).trim().toLowerCase()).filter(Boolean)
            : normalizeBn(tags).split(/[,\n]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);

        const autoTags = tokenizeMixed(cleanTitle).slice(0, 5);
        const mergedTags = [...new Set([...cleanTags, ...autoTags])].slice(0, 18);

        const entryId = String(id || '').trim() || slugifyId(cleanTitle);
        const existingIdx = this.entries.findIndex((e) => e.id === entryId);

        const record = {
            id: entryId,
            category: String(category || 'general').trim().toLowerCase().slice(0, 24),
            title: cleanTitle,
            tags: mergedTags,
            content: cleanContent,
            url: String(url || '').trim().slice(0, 240),
            active: true,
            updatedAt: Date.now()
        };

        if (existingIdx >= 0) {
            this.entries[existingIdx] = record;
        } else {
            this.entries.push(record);
        }

        this.metrics.kbMutations++;
        this.saveKnowledge();
        return { ok: true, entry: record, updated: existingIdx >= 0 };
    }

    updateEntry(idOrTitle, patch = {}) {
        const idx = this.findEntryIndex(idOrTitle);
        if (idx < 0) return { ok: false, error: 'এই নামে বা আইডিতে কোনো নলেজ এন্ট্রি পাওয়া যায়নি।' };

        const current = this.entries[idx];
        const next = {
            ...current,
            ...(patch.category ? { category: String(patch.category).trim().toLowerCase().slice(0, 24) } : {}),
            ...(patch.title ? { title: normalizeBn(patch.title).trim().slice(0, 80) } : {}),
            ...(patch.content ? { content: normalizeBn(patch.content).trim().slice(0, 900) } : {}),
            ...(patch.url !== undefined ? { url: String(patch.url || '').trim().slice(0, 240) } : {}),
            ...(patch.active !== undefined ? { active: Boolean(patch.active) } : {}),
            updatedAt: Date.now()
        };

        if (patch.tags !== undefined) {
            next.tags = (Array.isArray(patch.tags)
                ? patch.tags.map((t) => normalizeBn(t).trim().toLowerCase())
                : normalizeBn(patch.tags).split(/[,\n]+/).map((t) => t.trim().toLowerCase())
            ).filter(Boolean).slice(0, 18);
        }

        this.entries[idx] = next;
        this.metrics.kbMutations++;
        this.saveKnowledge();
        return { ok: true, entry: next };
    }

    removeEntry(idOrTitle) {
        const idx = this.findEntryIndex(idOrTitle);
        if (idx < 0) return { ok: false, error: 'মুছে ফেলার মতো কোনো নলেজ এন্ট্রি পাওয়া যায়নি।' };

        const [removed] = this.entries.splice(idx, 1);
        this.metrics.kbMutations++;
        this.saveKnowledge();
        return { ok: true, removed };
    }

    getEntry(idOrTitle) {
        const idx = this.findEntryIndex(idOrTitle);
        return idx >= 0 ? this.entries[idx] : null;
    }

    findEntryIndex(idOrTitle = '') {
        const q = normalizeBn(idOrTitle).trim().toLowerCase();
        if (!q) return -1;

        let idx = this.entries.findIndex((e) => e.id.toLowerCase() === q);
        if (idx >= 0) return idx;

        idx = this.searchIndex.findIndex((item) => item.titleLower.includes(q));
        if (idx >= 0) return idx;

        const qPh = fallbackPhonetic(q);
        if (qPh) {
            idx = this.searchIndex.findIndex((item) => item.entryPhonetic.includes(qPh));
        }
        return idx;
    }

    listEntries(category = null) {
        const list = this.entries.filter((e) => e.active !== false);
        if (!category) return list;
        const cat = String(category).trim().toLowerCase();
        return list.filter((e) => e.category === cat);
    }

    formatKnowledgeList() {
        const active = this.listEntries();
        if (!active.length) return '📚 নলেজ বেসে এখনো কোনো তথ্য সংরক্ষিত নেই।';

        const brand = getLiveBranding();
        const lines = [
            `📚 *${brand.botName} • নলেজ বেস (${active.length}টি এন্ট্রি)*`,
            '──────────────────'
        ];
        active.forEach((e, i) => {
            lines.push(`${i + 1}. *${e.title}* [\`${e.id}\` | ${e.category}]`);
        });
        lines.push('──────────────────');
        lines.push('💡 ভয়েসে বা মেসেজে বলো: *"নলেজে অ্যাড করো [তথ্য]"* অথবা *"নলেজ থেকে [আইডি] মুছে দাও"*।');
        return lines.join('\n');
    }

    retrieve(query = '', { categories = [], maxChunks = this.config.maxRetrievedChunks } = {}) {
        this.metrics.retrievals++;
        const rawQuery = normalizeBn(query).trim();
        const queryLower = rawQuery.toLowerCase();
        const catSet = new Set((Array.isArray(categories) ? categories : []).map((c) => String(c || '').toLowerCase()));

        const qTokens = tokenizeMixed(rawQuery);
        const qPhonetic = fallbackPhonetic(rawQuery);
        const qPhoneticTokens = qPhonetic.split(/\s+/).filter((t) => t.length >= 2);

        const scored = [];

        for (const idxItem of this.searchIndex) {
            const { entry, titleLower, contentLower, tagsLower, tagPhonetics, entryPhonetic } = idxItem;
            if (entry.active === false) continue;

            let score = 0;

            if (catSet.has(entry.category)) score += 6;

            for (let i = 0; i < tagsLower.length; i++) {
                if (queryLower.includes(tagsLower[i])) {
                    score += 5;
                } else if (tagPhonetics[i] && qPhonetic && qPhonetic.includes(tagPhonetics[i])) {
                    score += 4.5;
                }
            }

            for (const tok of qTokens) {
                if (titleLower.includes(tok)) score += 3;
                else if (contentLower.includes(tok)) score += 1.5;
            }

            if (qPhoneticTokens.length > 0 && entryPhonetic) {
                for (const pt of qPhoneticTokens) {
                    if (entryPhonetic.includes(pt)) score += 2;
                }
            }

            if (score >= 4) {
                scored.push({ entry, score });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, maxChunks).map((s) => s.entry);
        if (top.length > 0) this.metrics.hits++;
        return top;
    }

    buildKnowledgePromptBlock(query = '', { categories = [], allowSiteLink = false, maxChunks = 3 } = {}) {
        const chunks = this.retrieve(query, { categories, maxChunks });
        if (!chunks.length) return '';

        const brand = getLiveBranding();
        const lines = [
            `[VERIFIED ${brand.botName} KNOWLEDGE — USE ONLY THESE FACTS, NEVER INVENT FAKE APPS OR PRICES]`
        ];

        for (const c of chunks) {
            let line = `• ${c.title}: ${c.content}`;
            const resolvedUrl = resolveDynamicUrl(c.url);
            if (allowSiteLink && resolvedUrl) {
                line += ` (অফিশিয়াল লিংক: ${resolvedUrl})`;
            }
            lines.push(line);
        }

        if (!allowSiteLink) {
            lines.push('• [LINK RULE]: এই উত্তরে কোনো ওয়েবসাইট লিংক দেবে না।');
        }

        return lines.join('\n');
    }

    // =========================================================================
    // পার্ট ২: কলিশন-ফ্রি স্মার্ট লিড CRM ও হিউম্যান হ্যান্ডঅফ (./data/leads_crm.json)
    // =========================================================================

    loadLeads() {
        const loaded = safeReadJson(this.config.leadsFile, null);
        if (Array.isArray(loaded)) {
            this.leads = loaded.slice(-this.config.maxLeadsStored);
            return;
        }

        const legacy = safeReadJson(this.config.legacyLeadsFile, []);
        if (Array.isArray(legacy) && legacy.length) {
            const migrated = legacy
                .filter((x) => x && typeof x.id === 'string' && x.id.startsWith('LD-'))
                .slice(-this.config.maxLeadsStored);
            if (migrated.length) {
                this.leads = migrated;
                this.saveLeads();
                return;
            }
        }
        this.leads = [];
    }

    saveLeads() {
        if (this.leads.length > this.config.maxLeadsStored) {
            this.leads = this.leads.slice(-this.config.maxLeadsStored);
        }
        return atomicWriteJson(this.config.leadsFile, this.leads, true);
    }

    evaluateLeadAndHandoff({
        chatId = '',
        userText = '',
        intentResult = null,
        isOwner = false,
        isGroup = false
    } = {}) {
        const ownerBypass = isOwner || Boolean(settings?.isOwnerJid?.(chatId));
        if (ownerBypass || isGroup || !chatId) {
            return { triggered: false, level: 'none', shouldPauseBot: false, reason: 'ignored' };
        }

        const text = normalizeBn(userText).trim();
        if (!text) {
            return { triggered: false, level: 'none', shouldPauseBot: false, reason: 'empty' };
        }

        const brand = getLiveBranding();
        const ownerLabel = brand.ownerName || settings?.botOwner || 'MSK';

        if (PAYMENT_READY_RE.test(text)) {
            return {
                triggered: true,
                level: 'urgent_handoff',
                category: 'payment_confirm',
                urgency: '🔴 জরুরি (পেমেন্ট/অর্ডার)',
                shouldPauseBot: true,
                customerNotice: `আমি ${ownerLabel}-কে এখনই তোমার মেসেজটা জানিয়ে দিচ্ছি। উনি নিজেই একটু পর রিপ্লাই দিয়ে পেমেন্ট ও কাজের বিষয়টা কনফার্ম করে দেবেন।`
            };
        }

        if (DIRECT_OWNER_ASK_RE.test(text)) {
            return {
                triggered: true,
                level: 'urgent_handoff',
                category: 'owner_requested',
                urgency: '🟠 সরাসরি ওনারকে চেয়েছে',
                shouldPauseBot: true,
                customerNotice: `অবশ্যই! আমি ${ownerLabel}-কে এখনই অ্যালার্ট পাঠিয়ে দিয়েছি এবং এই চ্যাটে আপাতত চুপ থাকছি—উনি নিজেই এসে তোমার সাথে কথা বলবেন।`
            };
        }

        if (ANGRY_ESCALATION_RE.test(text)) {
            return {
                triggered: true,
                level: 'urgent_handoff',
                category: 'escalation',
                urgency: '🔴 কাস্টমার অসন্তুষ্ট/অভিযোগ',
                shouldPauseBot: true,
                customerNotice: `অসুবিধার জন্য আন্তরিকভাবে দুঃখিত। আমি বিষয়টা সরাসরি ${ownerLabel}-কে জানিয়ে দিয়েছি, উনি নিজেই খুব দ্রুত সমাধান করে দেবেন।`
            };
        }

        if (intentResult?.isLead || intentResult?.intent === 'SERVICE_LEAD') {
            return {
                triggered: true,
                level: 'service_lead',
                category: 'service_inquiry',
                urgency: '🟢 নতুন সার্ভিস লিড',
                shouldPauseBot: false,
                customerNotice: ''
            };
        }

        return { triggered: false, level: 'none', shouldPauseBot: false, reason: 'normal_chat' };
    }

    async processLeadOrHandoff({
        sock = null,
        safeSendFn = null,
        ownerJid = '',
        chatId = '',
        senderName = '',
        userText = '',
        intentResult = null,
        isOwner = false,
        isGroup = false
    } = {}) {
        const evalRes = this.evaluateLeadAndHandoff({ chatId, userText, intentResult, isOwner, isGroup });
        if (!evalRes.triggered) return evalRes;

        const now = Date.now();
        const brand = getLiveBranding();
        const profile = memoryEngine?.getProfile ? memoryEngine.getProfile(chatId) : null;
        const displayName = senderName || profile?.savedName || profile?.pushName || chatId.split('@')[0];
        const phone = extractSafePhone(chatId, profile);
        const contactDisplay = phone ? `+${phone}` : chatId;
        const deviceModel = profile?.deviceModel || 'এখনো জানা যায়নি';

        if (memoryEngine?.markAsCustomer) {
            memoryEngine.markAsCustomer(chatId, `${evalRes.category}: ${String(userText).slice(0, 60)}`);
        }

        let pausedMinutes = 0;
        if (evalRes.shouldPauseBot && memoryEngine?.pauseChat) {
            const pRes = memoryEngine.pauseChat(chatId, this.config.handoffPauseMinutes, evalRes.category);
            pausedMinutes = pRes?.minutes || this.config.handoffPauseMinutes;
            this.metrics.handoffPauses++;
        }

        const lastAlertAt = this.alertCooldowns.get(chatId) || 0;
        const cooldownMs = evalRes.level === 'urgent_handoff'
            ? Math.min(10 * 60 * 1000, this.config.leadAlertCooldownMs)
            : this.config.leadAlertCooldownMs;

        const shouldAlertNow = (now - lastAlertAt) >= cooldownMs;

        let leadRecord = null;
        if (shouldAlertNow) {
            leadRecord = {
                id: `LD-${Date.now().toString(36).toUpperCase().slice(-5)}`,
                chatId,
                name: displayName,
                phone,
                deviceModel,
                level: evalRes.level,
                category: evalRes.category,
                urgency: evalRes.urgency,
                message: normalizeBn(userText).trim().slice(0, 260),
                status: 'new',
                pausedMinutes,
                createdAt: now
            };
            this.leads.push(leadRecord);
            this.metrics.leadsRecorded++;
            this.saveLeads();

            if (this.alertCooldowns.size >= this.config.maxAlertCooldowns) {
                this.sweepAlertCooldowns();
                if (this.alertCooldowns.size >= this.config.maxAlertCooldowns) {
                    this.alertCooldowns.delete(this.alertCooldowns.keys().next().value);
                }
            }
            this.alertCooldowns.set(chatId, now);
        }

        let alertedOwner = false;
        if (shouldAlertNow && this.config.ownerNotifyEnabled && ownerJid && (sock || safeSendFn)) {
            const targetOwnerJid = ownerJid.includes('@') ? ownerJid : `${String(ownerJid).replace(/\D/g, '')}@s.whatsapp.net`;
            const alertText = [
                `🔔 *${brand.botName} • স্মার্ট লিড ও হ্যান্ডঅফ অ্যালার্ট*`,
                '──────────────────',
                `• ধরন: ${evalRes.urgency}`,
                `• লিড আইডি: \`${leadRecord?.id || 'N/A'}\``,
                `• কাস্টমার: *${displayName}*`,
                `• কন্টাক্ট: \`${contactDisplay}\``,
                `• ফোন মডেল: *${deviceModel}*`,
                `• মেসেজ: _"${normalizeBn(userText).trim().slice(0, 220)}"_`,
                '──────────────────',
                pausedMinutes > 0
                    ? `⏸️ এই চ্যাটে ${brand.assistantName} *${pausedMinutes} মিনিটের* জন্য অটো-পজ হয়েছে।`
                    : `🤖 ${brand.assistantName} চ্যাট চালিয়ে যাচ্ছে (মডেল ও বিস্তারিত জেনে নিচ্ছে)।`,
                `💡 ভয়েসে বলো: _"${displayName}-কে মেসেজ দাও ..."_ অথবা _"${displayName}-এর চ্যাটে বট অন করো"_`
            ].join('\n');

            try {
                if (typeof safeSendFn === 'function') {
                    await safeSendFn(sock, targetOwnerJid, { text: alertText });
                } else if (sock && typeof sock.sendMessage === 'function') {
                    await sock.sendMessage(targetOwnerJid, { text: alertText });
                }
                alertedOwner = true;
                this.metrics.alertsSent++;
            } catch {}
        }

        return {
            ...evalRes,
            lead: leadRecord,
            pausedMinutes,
            alertedOwner
        };
    }

    listLeads({ filter = 'recent', limit = 10 } = {}) {
        const now = Date.now();
        const dhakaMidnightMs = getDhakaStartOfTodayMs();

        let items = [...this.leads].reverse();
        if (filter === 'today') {
            items = items.filter((l) => (l.createdAt || 0) >= dhakaMidnightMs);
        } else if (filter === 'new') {
            items = items.filter((l) => l.status === 'new');
        } else if (filter === '24h') {
            items = items.filter((l) => (now - (l.createdAt || 0)) <= 24 * 60 * 60 * 1000);
        }
        return items.slice(0, limit);
    }

    getLeadById(leadId = '') {
        const cleanId = String(leadId || '').trim().toUpperCase();
        return this.leads.find((l) => l.id === cleanId) || null;
    }

    updateLeadStatus(leadId, status = 'done') {
        const cleanId = String(leadId || '').trim().toUpperCase();
        const valid = new Set(['new', 'contacted', 'done', 'ignored']);
        if (!valid.has(status)) return false;

        const lead = this.leads.find((l) => l.id === cleanId);
        if (!lead) return false;
        lead.status = status;
        lead.updatedAt = Date.now();
        this.saveLeads();
        return true;
    }

    clearLeads() {
        this.leads = [];
        this.alertCooldowns.clear();
        this.saveLeads();
        return true;
    }

    formatLeadsReport({ filter = 'recent', limit = 8 } = {}) {
        const list = this.listLeads({ filter, limit });
        if (!list.length) {
            return '📋 কোনো নতুন সার্ভিস লিড বা হ্যান্ডঅফ অ্যালার্ট পাওয়া যায়নি।';
        }

        const brand = getLiveBranding();
        const statusIcon = { new: '🆕', contacted: '💬', done: '✅', ignored: '⚪' };
        const lines = [
            `📋 *${brand.botName} • কাস্টমার লিড তালিকা (${list.length}টি)*`,
            '──────────────────'
        ];

        for (const l of list) {
            const icon = statusIcon[l.status] || '🆕';
            const contact = l.phone ? `+${l.phone}` : l.chatId;
            const snippet = String(l.message || '').slice(0, 55);
            lines.push(`${icon} *${l.name}* (\`${contact}\`) — \`${l.id}\``);
            lines.push(`   ${l.urgency} | মডেল: ${l.deviceModel}`);
            lines.push(`   _"${snippet}"_`);
        }

        return lines.join('\n');
    }

    sweepAlertCooldowns() {
        const now = Date.now();
        for (const [chatId, ts] of this.alertCooldowns.entries()) {
            if (now - ts > this.config.leadAlertCooldownMs) {
                this.alertCooldowns.delete(chatId);
            }
        }
    }

    getStats() {
        const newLeads = this.leads.filter((l) => l.status === 'new').length;
        return {
            knowledgeEntries: this.entries.filter((e) => e.active !== false).length,
            totalLeads: this.leads.length,
            newLeads,
            ownerNotifyEnabled: this.config.ownerNotifyEnabled,
            ...this.metrics
        };
    }
}

const knowledgeEngine = new KnowledgeAndLeadEngine();

module.exports = {
    KnowledgeAndLeadEngine,
    knowledgeEngine,
    retrieveKnowledge: (q, opts) => knowledgeEngine.retrieve(q, opts),
    buildKnowledgePromptBlock: (q, opts) => knowledgeEngine.buildKnowledgePromptBlock(q, opts),
    addKnowledgeEntry: (data) => knowledgeEngine.addEntry(data),
    updateKnowledgeEntry: (id, patch) => knowledgeEngine.updateEntry(id, patch),
    removeKnowledgeEntry: (id) => knowledgeEngine.removeEntry(id),
    getKnowledgeEntry: (id) => knowledgeEngine.getEntry(id),
    listKnowledgeEntries: (cat) => knowledgeEngine.listEntries(cat),
    formatKnowledgeList: () => knowledgeEngine.formatKnowledgeList(),
    evaluateLeadAndHandoff: (opts) => knowledgeEngine.evaluateLeadAndHandoff(opts),
    processLeadOrHandoff: (opts) => knowledgeEngine.processLeadOrHandoff(opts),
    listLeads: (opts) => knowledgeEngine.listLeads(opts),
    getLeadById: (id) => knowledgeEngine.getLeadById(id),
    updateLeadStatus: (id, st) => knowledgeEngine.updateLeadStatus(id, st),
    clearLeads: () => knowledgeEngine.clearLeads(),
    setOwnerNotifyEnabled: (en) => knowledgeEngine.setOwnerNotifyEnabled(en),
    formatLeadsReport: (opts) => knowledgeEngine.formatLeadsReport(opts),
    getKnowledgeStats: () => knowledgeEngine.getStats()
};
