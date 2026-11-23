/**
 * PRIME MONIR • Maya v2.0 ULTRA — 4-Layer Zero-Trust Privacy Firewall, Output DLP & Capability Shield
 * Features:
 *  - Layer 1: Zero-Latency Input Firewall (Prompt Injection, Roleplay Jailbreak, Cross-Chat Snooping, Impersonation)
 *  - Layer 2: Outbound DLP Scanner (Auto-masks API keys, Tokens, Server Paths, System Prompts, Creds & Secrets)
 *  - Layer 3: Cross-Chat Context Isolation + Encrypted Master PIN Gate for High-Privilege Actions
 *  - Layer 4: Smart Capability Shield (Eliminates robotic "আমি পারি না" replies with intelligent alternatives)
 *  - Threat Scoring, Repeat-Intrusion Owner Alert Throttling & 256MB RAM Bounded Maps
 */

let settings = null;
try { settings = require('../settings'); } catch {}

let systemControl = null;
try { systemControl = require('./systemControl'); } catch {}

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

const DEFAULT_CONFIG = {
    maxThreatRecords: 150,
    maxAlertCooldowns: 80,
    threatWindowMs: 30 * 60 * 1000,
    ownerAlertThreshold: 2,              // ৩০ মিনিটে ২+ বার অনুপ্রবেশের চেষ্টা হলে ওনারকে অ্যালার্ট
    ownerAlertCooldownMs: 20 * 60 * 1000,
    enableOutputDlp: true,
    enableCapabilityShield: true
};

// ==================================================
// ১. ইনপুট থ্রেট ডিটেকশন প্যাটার্ন (ReDoS-সেফ, লিনিয়ার টাইম)
// ==================================================
const INJECTION_RULES = [
    {
        code: 'PROMPT_INJECTION',
        severity: 3,
        rx: /(?:ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+instructions?|disregard\s+your\s+rules|override\s+system|act\s+as\s+(?:dan|jailbreak|developer\s+mode|unrestricted|root\s+admin)|bypass\s+(?:safety|security|firewall)|আগের\s*সব\s*(?:নিয়ম|নির্দেশনা|রুল)\s*(?:ভুলে\s*যাও|বাদ\s*দাও|অমান্য\s*করো)|সিস্টেম\s*রুল\s*বাইপাস)/i
    },
    {
        code: 'SECRET_EXFIL',
        severity: 3,
        rx: /(?:(?:reveal|show|dump|print|give|send|extract)\s+(?:me\s+)?(?:your\s+)?(?:system\s+prompt|hidden\s+instructions?|api\s*keys?|env\s*file|\.env|source\s*code|master\s*pin|creds\.json|session\s*files?|database)|(?:সিস্টেম\s*প্রম্পট|এপিআই\s*কি|api\s*key|মাস্টার\s*পিন|গোপন\s*(?:কোড|পাসওয়ার্ড|পিন|তথ্য|ফাইল)|\.env|সোর্স\s*কোড)\s*(?:দাও|দেখাও|বলো|পাঠাও|শেয়ার\s*করো|বের\s*করো))/i
    },
    {
        code: 'CROSS_CHAT_SNOOP',
        severity: 3,
        rx: /(?:(?:অন্য(?:দের|ের)?|অমুকের|বাকিদের|ওনারের|মনিরের|সব\s*ইউজার(?:দের|ের)?|কাস্টমার(?:দের|ের)?|মেয়েদের|গার্লফ্রেন্ডের)\s*(?:চ্যাট|মেসেজ|ইনবক্স|হিস্ট্রি|মেমোরি|কথাবার্তা|লগ|লিডস?|নম্বর\s*লিস্ট|ব্যক্তিগত\s*তথ্য)\s*(?:দেখাও|দাও|বলো|পাঠাও|শেয়ার\s*করো|পড়ে\s*শোনাও)|(?:show|read|tell|send|share)\s+(?:me\s+)?(?:other\s+users?|owner'?s?|monir'?s?|everyone'?s?|another\s+person'?s?)\s*(?:chats?|messages?|inbox|memory|history|contacts?|logs?))/i
    },
    {
        code: 'ROLEPLAY_BYPASS',
        severity: 2,
        rx: /(?:(?:ধরো|মনে\s*করো|কল্পনা\s*করো|pretend|suppose|imagine)\s+(?:তুমি|আমি|you\s+are|i\s+am)\s+(?:মনির|প্রাইম\s*মনির|তোমার\s*মালিক|ওনার|সুপার\s*ওনার|ডেভেলপার|owner|super\s*owner|admin|developer)\b.*(?:পিন|পাসওয়ার্ড|অ্যাক্সেস|চ্যাট|তথ্য|প্রম্পট|কমান্ড|key|access|secret|prompt))/i
    },
    {
        code: 'OWNER_IMPERSONATION',
        severity: 2,
        rx: /(?:আমি\s*(?:মনির|প্রাইম\s*মনির|তোমার\s*বস|মালিক|আসল\s*ওনার)\s*(?:বলছি|কথা\s*বলছি|নতুন\s*নম্বর\s*থেকে).*(?:অ্যাক্সেস\s*দাও|ওনার\s*বানাও|সব\s*তথ্য\s*দাও|পিন\s*বদলাও|লকডাউন\s*খোল|মেসেজ\s*পাঠাও)|i\s+am\s+(?:monir|your\s+owner|boss)\s+from\s+(?:new|another)\s+number)/i
    }
];

// ==================================================
// ২. আউটপুট DLP (Data Loss Prevention) সিক্রেট প্যাটার্ন
// ==================================================
const DLP_PATTERNS = [
    { name: 'GEMINI_KEY', rx: /\bAIza[0-9A-Za-z\-_]{25,45}\b/g, mask: '[REDACTED_KEY]' },
    { name: 'GROQ_KEY', rx: /\bgsk_[0-9A-Za-z]{20,70}\b/g, mask: '[REDACTED_KEY]' },
    { name: 'OPENROUTER_KEY', rx: /\bsk-or-v1-[0-9a-fA-F]{24,80}\b/g, mask: '[REDACTED_KEY]' },
    { name: 'OPENAI_KEY', rx: /\bsk-(?:proj-)?[0-9A-Za-z\-_]{24,80}\b/g, mask: '[REDACTED_KEY]' },
    { name: 'GITHUB_TOKEN', rx: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{24,60}\b/g, mask: '[REDACTED_TOKEN]' },
    { name: 'TELEGRAM_TOKEN', rx: /\b\d{8,11}:[A-Za-z0-9_-]{30,45}\b/g, mask: '[REDACTED_TOKEN]' },
    { name: 'JWT_TOKEN', rx: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g, mask: '[REDACTED_TOKEN]' },
    { name: 'ENV_SECRET_ASSIGN', rx: /\b(?:GEMINI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|SUPABASE_SERVICE_KEY|BACKUP_TG_BOT_TOKEN|MASTER_PIN)[A-Z0-9_]*\s*=\s*\S+/gi, mask: '[REDACTED_ENV]' },
    { name: 'SERVER_PATH', rx: /(?:\/home\/container|\/root\/|\/var\/www|\/etc\/|C:\\Users\\[^\s\\]+)[^\s"'`<>]*/gi, mask: '[SERVER_PATH]' },
    { name: 'INTERNAL_PROMPT_TAG', rx: /\[(?:MANDATORY\s+(?:LANGUAGE|BANGLISH|BANGLA|ENGLISH)\s+LOCK|VERIFIED\s+[^\]]+KNOWLEDGE|DEEP\s+STYLE\s+DNA|USER\s+MEMORY\s+PROFILE|LINK\s+RULE)[^\]]*\]/gi, mask: '' },
    { name: 'INTERNAL_VAULT_FILE', rx: /\b(?:creds\.json(?:\.bak)?|maya_system_control\.json|dynamic_owners\.json|\.mahiru-backup)\b/gi, mask: '[PROTECTED_FILE]' },
    { name: 'PIN_HASH_LEAK', rx: /"(?:salt|hash)"\s*:\s*"[0-9a-fA-F]{32,128}"/g, mask: '[PROTECTED_CREDENTIAL]' }
];

// ==================================================
// ৩. রোবটিক "আমি পারি না" ডিটেক্টর (স্মার্ট ক্যাপাবিলিটি শিল্ড)
// ==================================================
const ROBOTIC_CANNOT_RX = /^(?:দুঃখিত,?\s*)?(?:আমি\s*(?:এটা|এটি|তা|ওটা|এই\s*কাজ(?:টি|টা)?)\s*(?:করতে\s*)?(?:পারি\s*না|পারব\s*না|পারবো\s*না|সম্ভব\s*নয়)|একজন\s*(?:এআই|AI|ভাষা\s*মডেল)\s*হিসেবে\s*আমি\s*.*?পারি\s*না|as\s+an\s+ai(?:\s+language\s+model)?,?\s*i\s+(?:cannot|can't)\b)/i;

// সংবেদনশীল অ্যাকশন যার জন্য (PIN সেট থাকলে) মাস্টার PIN সেশন আনলক থাকতে হবে
const SENSITIVE_PIN_ACTIONS = new Set([
    'grant_owner',
    'revoke_owner',
    'lockdown',
    'restore_backup',
    'change_branding',
    'change_owner_number',
    'delete_all_data',
    'reset_style_all',
    'change_pin'
]);

function normalizeBn(str = '') {
    return String(str || '').normalize('NFC');
}

function getLiveOwnerLabel() {
    try {
        const b = systemControl?.getBotBranding?.();
        if (b?.ownerName) return b.ownerName;
    } catch {}
    return 'প্রাইম মনির';
}

class PrivacyFirewall {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        this.threatTracker = new Map(); // senderKey -> { score, count, lastCode, lastAt }
        this.alertCooldowns = new Map(); // senderKey -> ts

        this.metrics = {
            inboundChecked: 0,
            inboundBlocked: 0,
            outboundAudited: 0,
            outboundRedactions: 0,
            capabilityRewrites: 0,
            pinGatesChecked: 0,
            pinGatesDenied: 0,
            ownerAlertsTriggered: 0
        };

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('privacyFirewall', () => this.sweepMaps());
        }

        global.privacyFirewall = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    sweepMaps() {
        const now = Date.now();
        for (const [k, rec] of this.threatTracker.entries()) {
            if (now - (rec.lastAt || 0) > this.config.threatWindowMs) {
                this.threatTracker.delete(k);
            }
        }
        while (this.threatTracker.size > this.config.maxThreatRecords) {
            this.threatTracker.delete(this.threatTracker.keys().next().value);
        }

        for (const [k, ts] of this.alertCooldowns.entries()) {
            if (now - ts > this.config.ownerAlertCooldownMs) {
                this.alertCooldowns.delete(k);
            }
        }
        while (this.alertCooldowns.size > this.config.maxAlertCooldowns) {
            this.alertCooldowns.delete(this.alertCooldowns.keys().next().value);
        }
    }

    // =========================================================================
    // লেয়ার ১: ইনপুট জিরো-ট্রাস্ট ফায়ারওয়াল
    // =========================================================================

    inspectInboundMessage({
        text = '',
        senderKey = '',
        isSuperOwner = false,
        isOwner = false
    } = {}) {
        this.metrics.inboundChecked++;

        // মূল সুপার-ওনার সবসময় বিশ্বস্ত
        if (isSuperOwner) {
            return { allowed: true, blocked: false, threatCode: '', shouldAlertOwner: false };
        }

        const clean = normalizeBn(text).trim();
        if (!clean || clean.length < 4) {
            return { allowed: true, blocked: false, threatCode: '', shouldAlertOwner: false };
        }

        let matchedRule = null;
        for (const rule of INJECTION_RULES) {
            // অনুমোদিত কো-ওনারের ক্ষেত্রে সিক্রেট এক্সফিল ও প্রম্পট ইনজেকশন তখনও ব্লক থাকবে
            if (isOwner && rule.code === 'OWNER_IMPERSONATION') continue;
            if (rule.rx.test(clean)) {
                matchedRule = rule;
                break;
            }
        }

        if (!matchedRule) {
            return { allowed: true, blocked: false, threatCode: '', shouldAlertOwner: false };
        }

        this.metrics.inboundBlocked++;
        const now = Date.now();
        const key = String(senderKey || 'unknown');

        let rec = this.threatTracker.get(key);
        if (!rec || (now - rec.lastAt) > this.config.threatWindowMs) {
            if (this.threatTracker.size >= this.config.maxThreatRecords) {
                this.threatTracker.delete(this.threatTracker.keys().next().value);
            }
            rec = { score: 0, count: 0, lastCode: '', lastAt: now };
        } else {
            this.threatTracker.delete(key); // LRU refresh
        }

        rec.score += matchedRule.severity;
        rec.count += 1;
        rec.lastCode = matchedRule.code;
        rec.lastAt = now;
        this.threatTracker.set(key, rec);

        // একাধিকবার বা গুরুতর অনুপ্রবেশ চেষ্টায় ওনারকে অ্যালার্ট ফ্ল্যাগ
        const lastAlert = this.alertCooldowns.get(key) || 0;
        const shouldAlertOwner =
            rec.count >= this.config.ownerAlertThreshold &&
            (now - lastAlert) >= this.config.ownerAlertCooldownMs;

        if (shouldAlertOwner) {
            this.alertCooldowns.set(key, now);
            this.metrics.ownerAlertsTriggered++;
        }

        const ownerName = getLiveOwnerLabel();
        const politeReplyMap = {
            PROMPT_INJECTION: '🔒 নিরাপত্তার কারণে সিস্টেমের অভ্যন্তরীণ নিয়ম পরিবর্তন বা প্রকাশ করা সম্ভব নয়। অন্য কোনো কাজে সাহায্য লাগলে স্বাভাবিকভাবে বলুন!',
            SECRET_EXFIL: `🔒 গোপন কনফিগারেশন, API কী বা সিকিউরিটি ফাইল শেয়ার করা সম্পূর্ণ নিষিদ্ধ। সাধারণ কোনো প্রশ্ন বা সার্ভিসের বিষয়ে জানাতে পারি।`,
            CROSS_CHAT_SNOOP: '🔒 প্রাইভেসি পলিসির কারণে অন্য কোনো ব্যক্তির চ্যাট, নম্বর বা ব্যক্তিগত তথ্য শেয়ার করা সম্ভব নয়।',
            ROLEPLAY_BYPASS: `🔒 নিরাপত্তার স্বার্থে রোলপ্লে বা ছদ্মবেশে কোনো অ্যাডমিন অ্যাক্সেস বা গোপন তথ্য দেওয়া যাবে না।`,
            OWNER_IMPERSONATION: `🔒 নতুন কোনো নম্বর থেকে সরাসরি ওনার অ্যাক্সেস দেওয়া হয় না। ${ownerName} নিজে অনুমোদিত অ্যাকাউন্ট থেকে অ্যাড করলে তবেই অ্যাক্সেস চালু হয়।`
        };

        return {
            allowed: false,
            blocked: true,
            threatCode: matchedRule.code,
            severity: matchedRule.severity,
            attemptsInWindow: rec.count,
            shouldAlertOwner,
            safeReply: politeReplyMap[matchedRule.code] || '🔒 নিরাপত্তার কারণে এই অনুরোধটি গ্রহণ করা সম্ভব নয়।'
        };
    }

    // =========================================================================
    // লেয়ার ২: আউটপুট DLP (Data Loss Prevention) সিক্রেট ব্লকার
    // ==================================================

    auditOutboundText(text = '', {
        isSuperOwner = false,
        allowServerPaths = false,
        targetChatPhone = ''
    } = {}) {
        const raw = String(text || '');
        if (!raw || !this.config.enableOutputDlp) {
            return { text: raw, redacted: false, findings: [] };
        }

        this.metrics.outboundAudited++;

        let out = raw;
        const findings = [];

        // সুপার-ওনারের ক্ষেত্রেও API কী ও টোকেন লিক আটকাবে (নিজের চ্যাটে অসাবধানে স্ক্রিনশট/শেয়ার রোধে)
        for (const rule of DLP_PATTERNS) {
            if (isSuperOwner && allowServerPaths && (rule.name === 'SERVER_PATH' || rule.name === 'INTERNAL_VAULT_FILE')) {
                continue;
            }
            if (rule.rx.test(out)) {
                findings.push(rule.name);
                out = out.replace(rule.rx, rule.mask);
            }
            rule.rx.lastIndex = 0; // গ্লোবাল regex স্টেট রিসেট
        }

        // নন-সুপার-ওনারের কাছে অন্য কারো প্রাইভেট ফোন নম্বর হুবহু লিক হচ্ছে কিনা হালকা গার্ড
        if (!isSuperOwner && targetChatPhone) {
            const cleanTarget = String(targetChatPhone).replace(/\D/g, '').slice(-10);
            const superOwners = new Set(
                (Array.isArray(settings?.superOwnerNumbers) ? settings.superOwnerNumbers : [])
                    .map((n) => String(n).replace(/\D/g, '').slice(-10))
                    .filter(Boolean)
            );
            // শুধু "[অন্য ইউজার: +8801...]" ধরনের মেমোরি লিক প্যাটার্ন ধরবে (স্বাভাবিক দরকারি নম্বর নয়)
            out = out.replace(/\[(?:ইউজার|ক্লায়েন্ট|কন্টাক্ট|চ্যাট)\s*[:#]\s*\+?88?(01[3-9]\d{8})\]/gi, (full, num) => {
                const tail = num.slice(-10);
                if (tail === cleanTarget || superOwners.has(tail)) return full;
                findings.push('CROSS_CHAT_PHONE');
                return '[গোপনীয় কন্টাক্ট]';
            });
        }

        if (findings.length > 0) {
            this.metrics.outboundRedactions += findings.length;
            out = out.replace(/\n{3,}/g, '\n\n').trim();
        }

        return {
            text: out,
            redacted: findings.length > 0,
            findings
        };
    }

    // =========================================================================
    // লেয়ার ৩: ক্রস-চ্যাট কনটেক্সট আইসোলেশন ও এনক্রিপ্টেড মাস্টার PIN গেট
    // =========================================================================

    /**
     * সিস্টেম প্রম্পটে ঢোকানোর আগে কোনো কনটেক্সট ব্লকে গোপন সিক্রেট থাকলে ছেঁটে ফেলে
     */
    sanitizeContextForChat(contextText = '') {
        if (!contextText) return '';
        let safe = String(contextText);
        for (const rule of DLP_PATTERNS) {
            if (rule.name === 'INTERNAL_PROMPT_TAG') continue;
            safe = safe.replace(rule.rx, rule.mask);
            rule.rx.lastIndex = 0;
        }
        return safe;
    }

    /**
     * বড় ও স্পর্শকাতর পরিবর্তনের আগে এনক্রিপ্টেড মাস্টার PIN যাচাই গেট
     * - PIN সেট না থাকলে Super Owner-কে ব্লক করবে না (শুধু সেট করার পরামর্শ দেবে)
     * - PIN সেট থাকলে ১০ মিনিটের আনলক সেশন অথবা ইনলাইন পিন দিয়ে যাচাই করবে
     */
    checkSensitiveActionGate({
        isSuperOwner = false,
        actorId = 'super_owner',
        actionName = '',
        pinProvided = ''
    } = {}) {
        this.metrics.pinGatesChecked++;

        if (!isSuperOwner) {
            this.metrics.pinGatesDenied++;
            return {
                allowed: false,
                reason: 'super_owner_only',
                message: '🔐 এই গুরুত্বপূর্ণ পরিবর্তনটি শুধু মূল *Super Owner* করতে পারবেন।'
            };
        }

        const needsPin = SENSITIVE_PIN_ACTIONS.has(String(actionName || '').trim().toLowerCase());
        if (!needsPin) return { allowed: true };

        const pinConfigured = Boolean(systemControl?.hasMasterPin?.());
        if (!pinConfigured) {
            return {
                allowed: true,
                advisory: '💡 নিরাপত্তার জন্য একটি মাস্টার PIN সেট করে রাখতে পারো: `.setpin <৪-৮ অক্ষরের পিন>`'
            };
        }

        // ইতিমধ্যেই ১০ মিনিটের আনলক সেশন চালু থাকলে
        if (systemControl?.isPinSessionUnlocked?.(actorId)) {
            return { allowed: true };
        }

        // কমান্ডের সাথে ইনলাইন পিন দিলে এখনই ভেরিফাই করা
        if (pinProvided && systemControl?.verifyMasterPin) {
            const vRes = systemControl.verifyMasterPin(pinProvided, actorId);
            if (vRes.ok) return { allowed: true, justUnlocked: true };
            this.metrics.pinGatesDenied++;
            return { allowed: false, reason: 'invalid_pin', message: vRes.error };
        }

        this.metrics.pinGatesDenied++;
        return {
            allowed: false,
            reason: 'pin_required',
            message: '🔐 এটি একটি বড় সিস্টেম পরিবর্তন। চালিয়ে যেতে আগে মাস্টার PIN আনলক করো: `.pin <তোমার_পিন>` (আনলক করলে ১০ মিনিট সক্রিয় থাকবে)।'
        };
    }

    // =========================================================================
    // লেয়ার ৪: স্মার্ট ক্যাপাবিলিটি শিল্ড (রোবটিক "আমি পারি না" নির্মূল)
    // =========================================================================

    rewriteRoboticRefusal(replyText = '', { userText = '', style = 'apni', isOwner = false } = {}) {
        if (!this.config.enableCapabilityShield || !replyText) return replyText;
        const clean = normalizeBn(replyText).trim();

        // নিরাপত্তা বা পলিসি রিফিউজাল বদলাবে না
        if (/🔒|নিরাপত্তা|প্রাইভেসি|হ্যাকিং|অননুমোদিত|প্যানেল/i.test(clean)) return replyText;

        if (!ROBOTIC_CANNOT_RX.test(clean)) return replyText;

        this.metrics.capabilityRewrites++;
        const ownerName = getLiveOwnerLabel();

        if (isOwner) {
            return 'বস, এটা সরাসরি অটো-রানে না থাকলে বলো কীভাবে করতে চাও—আমি রুল, ডায়নামিক কমান্ড বা শিডিউল বানিয়ে এখনই সেটআপ করে দিচ্ছি! ⚡';
        }

        const you = style === 'tui' ? 'তুই' : style === 'tumi' ? 'তুমি' : 'আপনি';
        const tell = style === 'tui' ? 'বল' : style === 'tumi' ? 'বলো' : 'বলুন';

        if (/(কাজ|অর্ডার|সার্ভিস|রুট|বট|ওয়েবসাইট|অ্যাপ|পেমেন্ট|কল)/i.test(userText)) {
            return `এই বিষয়টি সঠিকভাবে সমাধানের জন্য ${you} বিস্তারিত একটু ${tell}—আমি নোট করে *${ownerName}*-কে জানিয়ে দিচ্ছি, উনি নিজেই খুব দ্রুত ব্যবস্থা করে দেবেন।`;
        }

        return `এটা সরাসরি এখান থেকে করা না গেলেও আমি সহজ বিকল্প উপায়টা বলে দিতে পারি! ঠিক কী করতে চাচ্ছেন, একটু বিস্তারিত ${tell}।`;
    }

    // =========================================================================
    // টেলিমেট্রি ও সিকিউরিটি রিপোর্ট
    // =========================================================================

    resetThreatForUser(senderKey = '') {
        if (!senderKey) return false;
        this.threatTracker.delete(String(senderKey));
        this.alertCooldowns.delete(String(senderKey));
        return true;
    }

    getStats() {
        return {
            trackedThreats: this.threatTracker.size,
            masterPinConfigured: Boolean(systemControl?.hasMasterPin?.()),
            outputDlpEnabled: this.config.enableOutputDlp,
            capabilityShieldEnabled: this.config.enableCapabilityShield,
            ...this.metrics
        };
    }

    formatFirewallReport() {
        const s = this.getStats();
        return [
            '🛡️ *MAHIRU • জিরো-ট্রাস্ট প্রাইভেসি ফায়ারওয়াল*',
            '──────────────────',
            `• ইনপুট চেক: *${s.inboundChecked}* | ব্লকড থ্রেট: *${s.inboundBlocked}*`,
            `• আউটপুট DLP স্ক্যান: *${s.outboundAudited}* | সিক্রেট মাস্ক: *${s.outboundRedactions}*`,
            `• ক্যাপাবিলিটি শিল্ড ফিক্স: *${s.capabilityRewrites}*`,
            `• মাস্টার PIN ভল্ট: ${s.masterPinConfigured ? '🔒 সক্রিয়' : '⚪ সেট করা হয়নি (`.setpin`)'}`,
            `• PIN গেট ব্লক: *${s.pinGatesDenied}* | সক্রিয় থ্রেট ট্র্যাকার: *${s.trackedThreats}*`
        ].join('\n');
    }
}

const privacyFirewall = new PrivacyFirewall();

module.exports = {
    PrivacyFirewall,
    privacyFirewall,
    inspectInboundMessage: (opts) => privacyFirewall.inspectInboundMessage(opts),
    auditOutboundText: (text, opts) => privacyFirewall.auditOutboundText(text, opts),
    sanitizeContextForChat: (text) => privacyFirewall.sanitizeContextForChat(text),
    checkSensitiveActionGate: (opts) => privacyFirewall.checkSensitiveActionGate(opts),
    rewriteRoboticRefusal: (reply, opts) => privacyFirewall.rewriteRoboticRefusal(reply, opts),
    resetThreatForUser: (key) => privacyFirewall.resetThreatForUser(key),
    getFirewallStats: () => privacyFirewall.getStats(),
    formatFirewallReport: () => privacyFirewall.formatFirewallReport()
};
