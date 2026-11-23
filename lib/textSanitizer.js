/**
 * PRIME MONIR • Maya v3.0 ULTRA — Text Sanitizer, LaTeX Converter, Daily 1-Link Firewall & Pro TTS Phonetics
 * Fixes: Zero-Collision PUA Placeholders (@@URLTOKEN₀@@ Bug Fixed) + 🚅 Glitch Stripper + 1/Day Link Cap + Group Shield
 * Engineered for 256MB RAM (Hoisted Static Regexes + Cached Domain Regex + Bounded Daily Tracker)
 * 100% Backward-Compatible Exports
 */
const fs = require('fs');
const path = require('path');

const settings = (() => {
    try { return require('../settings'); } catch { return {}; }
})();

const systemControl = (() => {
    try { return require('./systemControl'); } catch { return null; }
})();

const userGroupLib = (() => {
    try { return require('./index'); } catch { return null; }
})();

const registerCleanupHook = (() => {
    try { return require('./systemOptimizer').registerCleanupHook; } catch { return null; }
})();

const LINK_COOLDOWN_FILE = path.join(process.cwd(), 'data', 'link_cooldown.json');

const DEFAULT_CONFIG = {
    siteDomainPattern: /https?:\/\/(?:www\.)?prime-(?:web|monir)\.netlify\.app\S*/gi,
    linkCooldownMs: 24 * 60 * 60 * 1000, // ২৪ ঘণ্টায় সর্বোচ্চ ১ বার
    dailyLimitPerChat: 1,
    allowInGroups: false,
    maxCooldownEntries: 150,
    maxWhatsAppChars: 3500,
    defaultTtsMaxChars: 280
};

const SUPERSCRIPT_MAP = Object.freeze({
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ'
});

const SUBSCRIPT_MAP = Object.freeze({
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'i': 'ᵢ', 'n': 'ₙ', 'o': 'ₒ', 'x': 'ₓ'
});

// মডিউল-লেভেলে হোয়েস্টেড LaTeX সিম্বল ম্যাপ (জিরো পার-মেসেজ অ্যারে অ্যালোকেশন)
const LATEX_SYMBOL_MAP = Object.freeze([
    [/\\times/g, '×'], [/\\cdot/g, '·'], [/\\div/g, '÷'], [/\\pm/g, '±'], [/\\mp/g, '∓'],
    [/\\leq?|\\le\b/g, '≤'], [/\\geq?|\\ge\b/g, '≥'], [/\\neq|\\ne\b/g, '≠'], [/\\approx/g, '≈'],
    [/\\equiv/g, '≡'], [/\\infty/g, '∞'], [/\\pi\b/g, 'π'], [/\\theta\b/g, 'θ'], [/\\alpha\b/g, 'α'],
    [/\\beta\b/g, 'β'], [/\\gamma\b/g, 'γ'], [/\\delta\b/g, 'δ'], [/\\Delta\b/g, 'Δ'],
    [/\\sigma\b/g, 'σ'], [/\\omega\b/g, 'ω'], [/\\Rightarrow|\\implies/g, '⇒'],
    [/\\rightarrow|\\to\b/g, '→'], [/\\leftarrow/g, '←'], [/\\therefore/g, '∴'],
    [/\\because/g, '∵'], [/\\angle/g, '∠'], [/\\triangle/g, '△'], [/\\degree|\^\\circ/g, '°'],
    [/\\sum\b/g, '∑'], [/\\int\b/g, '∫'], [/\\in\b/g, '∈'], [/\\subset\b/g, '⊂'],
    [/\\cup\b/g, '∪'], [/\\cap\b/g, '∩']
]);

// ১৫০+ বাংলাদেশি দৈনন্দিন ও টেক শব্দের নিখুঁত বাংলা উচ্চারণ ম্যাপ (দীর্ঘ ফ্রেজ আগে)
const TTS_PHONETIC_MAP = Object.freeze([
    [/\bPRIME MONIR\b/gi, 'প্রাইম মনির'],
    [/\bPrime Download Center\b/gi, 'প্রাইম ডাউনলোড সেন্টার'],
    [/\bPrime Tube\b/gi, 'প্রাইম টিউব'],
    [/\bPrime Tunnel\b/gi, 'প্রাইম টানেল'],
    [/\bPrime Tool\b/gi, 'প্রাইম টুল'],
    [/\bPrime Bot\b/gi, 'প্রাইম বট'],
    [/\bSuper Owner\b/gi, 'সুপার ওনার'],
    [/\bCo-?Owner\b/gi, 'কো ওনার'],
    [/\bMaster PIN\b/gi, 'মাস্টার পিন'],
    [/\bPlay Integrity\b/gi, 'প্লে ইন্টিগ্রিটি'],
    [/\bDeep Clean\b/gi, 'ডিপ ক্লিন'],
    [/\bFree Fire MAX\b/gi, 'ফ্রি ফায়ার ম্যাক্স'],
    [/\bFF MAX\b/gi, 'ফ্রি ফায়ার ম্যাক্স'],
    [/\bFree Fire\b/gi, 'ফ্রি ফায়ার'],
    [/\bPUBG Mobile\b/gi, 'পাবজি মোবাইল'],
    [/\bPUBG\b/gi, 'পাবজি'],
    [/\bKernelSU Next\b/gi, 'কার্নেল এস ইউ নেক্সট'],
    [/\bKernelSU\b/gi, 'কার্নেল এস ইউ'],
    [/\bCustom ROM\b/gi, 'কাস্টম রম'],
    [/\bDark Tunnel\b/gi, 'ডার্ক টানেল'],
    [/\bBootloader\b/gi, 'বুটলোডার'],
    [/\bHard Brick\b/gi, 'হার্ড ব্রিক'],
    [/\bSoft Brick\b/gi, 'সফট ব্রিক'],
    [/\bDead Boot\b/gi, 'ডেড বুট'],
    [/\bOrangeFox\b/gi, 'অরেঞ্জ ফক্স'],
    [/\bGood Morning\b/gi, 'গুড মর্নিং'],
    [/\bGood Night\b/gi, 'গুড নাইট'],
    [/\bWelcome back\b/gi, 'ওয়েলকাম ব্যাক'],
    [/\bThank you\b/gi, 'ধন্যবাদ'],
    [/\bBad MAC\b/gi, 'ব্যাড ম্যাক'],
    [/\bWhatsApp\b/gi, 'হোয়াটসঅ্যাপ'],
    [/\bTelegram\b/gi, 'টেলিগ্রাম'],
    [/\bFacebook\b/gi, 'ফেসবুক'],
    [/\bYouTube\b/gi, 'ইউটিউব'],
    [/\bInstagram\b/gi, 'ইনস্টাগ্রাম'],
    [/\bTikTok\b/gi, 'টিকটক'],
    [/\bDiscord\b/gi, 'ডিসকর্ড'],
    [/\bOpenRouter\b/gi, 'ওপেন রাউটার'],
    [/\bGemini\b/gi, 'জেমিনি'],
    [/\bGroq\b/gi, 'গ্রোক'],
    [/\bGoogle\b/gi, 'গুগল'],
    [/\bGitHub\b/gi, 'গিটহাব'],
    [/\bNetlify\b/gi, 'নেটলিফাই'],
    [/\bVercel\b/gi, 'ভার্সেল'],
    [/\bFirebase\b/gi, 'ফায়ারবেস'],
    [/\bSupabase\b/gi, 'সুপাবেস'],
    [/\bAndroid\b/gi, 'অ্যান্ড্রয়েড'],
    [/\biPhone\b/gi, 'আইফোন'],
    [/\bWindows\b/gi, 'উইন্ডোজ'],
    [/\bLinux\b/gi, 'লিনাক্স'],
    [/\bTermux\b/gi, 'টারমাক্স'],
    [/\bMagisk\b/gi, 'ম্যাজিস্ক'],
    [/\bAPatch\b/gi, 'এ প্যাচ'],
    [/\bZygisk\b/gi, 'জাইজিস্ক'],
    [/\bShamiko\b/gi, 'শামিকো'],
    [/\bHyperOS\b/gi, 'হাইপার ওএস'],
    [/\bColorOS\b/gi, 'কালার ওএস'],
    [/\bOneUI\b/gi, 'ওয়ান ইউ আই'],
    [/\bMIUI\b/gi, 'মি ইউ আই'],
    [/\bSamsung\b/gi, 'স্যামসাং'],
    [/\bXiaomi\b/gi, 'শাওমি'],
    [/\bRedmi\b/gi, 'রেডমি'],
    [/\bPoco\b/gi, 'পোকো'],
    [/\bInfinix\b/gi, 'ইনফিনিক্স'],
    [/\bTecno\b/gi, 'টেকনো'],
    [/\bOppo\b/gi, 'অপো'],
    [/\bRealme\b/gi, 'রিয়েলমি'],
    [/\bVivo\b/gi, 'ভিভো'],
    [/\bOnePlus\b/gi, 'ওয়ান প্লাস'],
    [/\bPixel\b/gi, 'পিক্সেল'],
    [/\bMediaTek\b/gi, 'মিডিয়াটেক'],
    [/\bSnapdragon\b/gi, 'স্ন্যাপড্রাগন'],
    [/\bQualcomm\b/gi, 'কোয়ালকম'],
    [/\bTWRP\b/gi, 'টি ডব্লিউ আর পি'],
    [/\bADB\b/gi, 'এ ডি বি'],
    [/\bFastboot\b/gi, 'ফাস্টবুট'],
    [/\bBootloop\b/gi, 'বুটলুপ'],
    [/\bFirmware\b/gi, 'ফার্মওয়্যার'],
    [/\bRecovery\b/gi, 'রিকভারি'],
    [/\bUnbrick\b/gi, 'আনব্রিক'],
    [/\bUnroot\b/gi, 'আনরুট'],
    [/\bRoot(?:ed|ing)?\b/gi, 'রুট'],
    [/\bFlash(?:ing)?\b/gi, 'ফ্ল্যাশ'],
    [/\bUnlock(?:ed|ing)?\b/gi, 'আনলক'],
    [/\bLockdown\b/gi, 'লকডাউন'],
    [/\bDownload\b/gi, 'ডাউনলোড'],
    [/\bUpload\b/gi, 'আপলোড'],
    [/\bWebsite\b/gi, 'ওয়েবসাইট'],
    [/\bScreenshot\b/gi, 'স্ক্রিনশট'],
    [/\bSettings?\b/gi, 'সেটিংস'],
    [/\bNotification\b/gi, 'নোটিফিকেশন'],
    [/\bUpdate(?:d)?\b/gi, 'আপডেট'],
    [/\bRestart\b/gi, 'রিস্টার্ট'],
    [/\bBackup\b/gi, 'ব্যাকআপ'],
    [/\bRestore\b/gi, 'রিস্টোর'],
    [/\bServer\b/gi, 'সার্ভার'],
    [/\bSession\b/gi, 'সেশন'],
    [/\bStorage\b/gi, 'স্টোরেজ'],
    [/\bMemory\b/gi, 'মেমোরি'],
    [/\bProfile\b/gi, 'প্রোফাইল'],
    [/\bCache\b/gi, 'ক্যাশ'],
    [/\bOnline\b/gi, 'অনলাইন'],
    [/\bOffline\b/gi, 'অফলাইন'],
    [/\bSystem\b/gi, 'সিস্টেম'],
    [/\bStatus\b/gi, 'স্ট্যাটাস'],
    [/\bHealth\b/gi, 'হেলথ'],
    [/\bSecurity\b/gi, 'সিকিউরিটি'],
    [/\bPrivacy\b/gi, 'প্রাইভেসি'],
    [/\bFirewall\b/gi, 'ফায়ারওয়াল'],
    [/\bAccess\b/gi, 'অ্যাক্সেস'],
    [/\bCommand\b/gi, 'কমান্ড'],
    [/\bFeature\b/gi, 'ফিচার'],
    [/\bMacro\b/gi, 'ম্যাক্রো'],
    [/\bTrigger\b/gi, 'ট্রিগার'],
    [/\bSchedule(?:d)?\b/gi, 'শিডিউল'],
    [/\bReminder\b/gi, 'রিমাইন্ডার'],
    [/\bError\b/gi, 'এরর'],
    [/\bProblem\b/gi, 'সমস্যা'],
    [/\bSupport\b/gi, 'সাপোর্ট'],
    [/\bService\b/gi, 'সার্ভিস'],
    [/\bDetails\b/gi, 'বিস্তারিত'],
    [/\bPayment\b/gi, 'পেমেন্ট'],
    [/\bCharge\b/gi, 'চার্জ'],
    [/\bBudget\b/gi, 'বাজেট'],
    [/\bOrder\b/gi, 'অর্ডার'],
    [/\bClient\b/gi, 'ক্লায়েন্ট'],
    [/\bCustomer\b/gi, 'কাস্টমার'],
    [/\bProject\b/gi, 'প্রজেক্ট'],
    [/\bModel\b/gi, 'মডেল'],
    [/\bProcessor\b/gi, 'প্রসেসর'],
    [/\bBattery\b/gi, 'ব্যাটারি'],
    [/\bDisplay\b/gi, 'ডিসপ্লে'],
    [/\bCamera\b/gi, 'ক্যামেরা'],
    [/\bInternet\b/gi, 'ইন্টারনেট'],
    [/\bNetwork\b/gi, 'নেটওয়ার্ক'],
    [/\bRouter\b/gi, 'রাউটার'],
    [/\bWi-?Fi\b/gi, 'ওয়াইফাই'],
    [/\bConfig\b/gi, 'কনফিগ'],
    [/\bPanel\b/gi, 'প্যানেল'],
    [/\bHack(?:ing)?\b/gi, 'হ্যাক'],
    [/\bLink\b/gi, 'লিংক'],
    [/\bVoice\b/gi, 'ভয়েস'],
    [/\bMessage\b/gi, 'মেসেজ'],
    [/\bReply\b/gi, 'রিপ্লাই'],
    [/\bInbox\b/gi, 'ইনবক্স'],
    [/\bGroup\b/gi, 'গ্রুপ'],
    [/\bAdmin\b/gi, 'অ্যাডমিন'],
    [/\bOwner\b/gi, 'ওনার'],
    [/\bVideo\b/gi, 'ভিডিও'],
    [/\bAudio\b/gi, 'অডিও'],
    [/\bPhoto\b/gi, 'ছবি'],
    [/\bImage\b/gi, 'ছবি'],
    [/\bFile\b/gi, 'ফাইল'],
    [/\bFolder\b/gi, 'ফোল্ডার'],
    [/\bCode\b/gi, 'কোড'],
    [/\bPhone\b/gi, 'ফোন'],
    [/\bMobile\b/gi, 'মোবাইল'],
    [/\bDevice\b/gi, 'ডিভাইস'],
    [/\bChat\b/gi, 'চ্যাট'],
    [/\bCall\b/gi, 'কল'],
    [/\bBlock\b/gi, 'ব্লক'],
    [/\bUnblock\b/gi, 'আনব্লক'],
    [/\bPause(?:d)?\b/gi, 'পজ'],
    [/\bResume\b/gi, 'রিজিউম'],
    [/\bAuto\b/gi, 'অটো'],
    [/\bCheck\b/gi, 'চেক'],
    [/\bConfirm\b/gi, 'কনফার্ম'],
    [/\bReady\b/gi, 'রেডি'],
    [/\bActive\b/gi, 'অ্যাক্টিভ'],
    [/\bBusy\b/gi, 'ব্যস্ত'],
    [/\bApp\b/gi, 'অ্যাপ'],
    [/\bAPK\b/gi, 'এ পি কে'],
    [/\bPDF\b/gi, 'পি ডি এফ'],
    [/\bVPN\b/gi, 'ভি পি এন'],
    [/\bOTG\b/gi, 'ও টি জি'],
    [/\bUSB\b/gi, 'ইউ এস বি'],
    [/\bSIM\b/gi, 'সিম'],
    [/\bPIN\b/g, 'পিন'],
    [/\bAPI\b/g, 'এ পি আই'],
    [/\bRAM\b/gi, 'র‍্যাম'],
    [/\bCPU\b/gi, 'সি পি ইউ'],
    [/\bMB\b/g, 'এম বি'],
    [/\bGB\b/g, 'জি বি'],
    [/\bKB\b/g, 'কে বি'],
    [/\bVIP\b/gi, 'ভি আই পি'],
    [/\bAI\b/g, 'এ আই'],
    [/\bPC\b/g, 'পি সি'],
    [/\b5G\b/gi, 'ফাইভ জি'],
    [/\b4G\b/gi, 'ফোর জি'],
    [/\bBot\b/gi, 'বট'],
    [/\bPro\b/gi, 'প্রো'],
    [/\bFree\b/gi, 'ফ্রি'],
    [/\bPaid\b/gi, 'পেইড'],
    [/\bPrice\b/gi, 'দাম'],
    [/\bbKash\b/gi, 'বিকাশ'],
    [/\bNagad\b/gi, 'নগদ'],
    [/\bRocket\b/gi, 'রকেট'],
    [/\bMaya\b/gi, 'মায়া'],
    [/\bOkay\b|\bOK+\b/gi, 'ওকে'],
    [/\bSorry\b/gi, 'সরি'],
    [/\bThanks?\b|\bTnx\b|\bThx\b/gi, 'ধন্যবাদ'],
    [/\bWelcome\b/gi, 'স্বাগতম'],
    [/\bPlease\b|\bPlz\b/gi, 'দয়া করে'],
    [/\bBro\b/gi, 'ব্রো'],
    [/\bBoss\b/gi, 'বস'],
    [/\bHi+\b/gi, 'হাই'],
    [/\bHello+\b/gi, 'হ্যালো'],
    [/\bBye+\b/gi, 'বাই'],
    [/\bYes\b/gi, 'হ্যাঁ'],
    [/\bNo\b/gi, 'না']
]);

const REFUSAL_REGEX = /(দুঃখিত|দিতে পারব না|সরবরাহ করতে পারি না|অননুমোদিত|হ্যাকিং.*পারি না|অবৈধ|সম্ভব না|সাপোর্ট করি না|cannot provide|can't provide|not allowed)/i;
const EXPLICIT_LINK_ASK_REGEX = /(link|লিংক|লিঙ্ক|website|ওয়েবসাইট|সাইট|download|ডাউনলোড|proof|প্রুফ|প্রমাণ|কাজের নমুনা|portfolio|পোর্টফোলিও|app|অ্যাপ|apk|rom|firmware|root file|টুলস|কোথা থেকে নামাব|কোথায় পাব|ডাউনলোড করব|সাইটের ঠিকানা)/i;
const LINK_ALLOWED_INTENTS = new Set(['DOWNLOAD', 'PROOF', 'WEBSITE', 'SERVICE_QUOTE']);

// অকারণ গ্লিচ ট্রেন ইমোজি ফিল্টার (ইউজার ট্রেন নিয়ে কথা না বললে)
const GLITCH_TRAIN_EMOJI_RE = /[🚅🚄🚆🚇🚈🚉🚊🚝🚞🚋]+/gu;
const TRAIN_TOPIC_RE = /(ট্রেন|রেল|স্টেশন|টিকিট|train|rail|station|metro)/i;

// বাংলা ক্যানোনিকাল নরম্যালাইজার (Unicode NFC-তে ভেঙে যাওয়া য়/ড়/ঢ় আবার একত্র করে)
function normalizeBn(str = '') {
    return String(str || '')
        .normalize('NFC')
        .replace(/\u09AF\u09BC/g, 'য়')
        .replace(/\u09A1\u09BC/g, 'ড়')
        .replace(/\u09A2\u09BC/g, 'ঢ়');
}

function escapeRegExp(str = '') {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDhakaDateKey(ts = Date.now()) {
    const d = new Date(ts + 6 * 60 * 60 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function atomicWriteJsonSafe(filePath, data) {
    let tmp = '';
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
        fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
        fs.renameSync(tmp, filePath);
    } catch {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
    }
}

class TextSanitizer {
    constructor(customConfig = {}) {
        const s = settings.maya?.sanitizer || {};
        this.config = {
            ...DEFAULT_CONFIG,
            ...(Number.isFinite(s.linkCooldownMs) ? { linkCooldownMs: s.linkCooldownMs } : {}),
            ...(Number.isFinite(s.portfolioLinkDailyLimitPerChat) ? { dailyLimitPerChat: s.portfolioLinkDailyLimitPerChat } : {}),
            ...(typeof s.portfolioLinkAllowInGroups === 'boolean' ? { allowInGroups: s.portfolioLinkAllowInGroups } : {}),
            ...(Number.isFinite(s.maxWhatsAppChars) ? { maxWhatsAppChars: s.maxWhatsAppChars } : {}),
            ...(Number.isFinite(s.defaultTtsMaxChars) ? { defaultTtsMaxChars: s.defaultTtsMaxChars } : {}),
            ...customConfig
        };

        // chatId -> { dateKey, count, ts } (দিনে সর্বোচ্চ ১ বার পোর্টফোলিও লিংক)
        this.linkCooldowns = new Map();
        this._saveTimer = null;
        this._cachedSiteRx = null;
        this._cachedSiteRxAt = 0;

        this.metrics = {
            sanitizedReplies: 0,
            latexCleaned: 0,
            linksStripped: 0,
            glitchEmojisStripped: 0,
            ttsPrepared: 0
        };

        this._loadCooldownsFromDisk();

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('textSanitizer', () => this.sweepCooldowns(true));
        }

        global.textSanitizer = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        this._cachedSiteRx = null;
        return this;
    }

    _loadCooldownsFromDisk() {
        try {
            if (!fs.existsSync(LINK_COOLDOWN_FILE)) return;
            const parsed = JSON.parse(fs.readFileSync(LINK_COOLDOWN_FILE, 'utf8'));
            if (!parsed || typeof parsed !== 'object') return;
            const today = getDhakaDateKey();
            for (const [k, v] of Object.entries(parsed)) {
                if (v && v.dateKey === today && Number(v.count) > 0) {
                    this.linkCooldowns.set(k, {
                        dateKey: v.dateKey,
                        count: Number(v.count),
                        ts: Number(v.ts || Date.now())
                    });
                }
                if (this.linkCooldowns.size >= this.config.maxCooldownEntries) break;
            }
        } catch {}
    }

    _scheduleCooldownSave() {
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            const obj = Object.create(null);
            const today = getDhakaDateKey();
            for (const [k, v] of this.linkCooldowns.entries()) {
                if (v.dateKey === today) obj[k] = v;
            }
            atomicWriteJsonSafe(LINK_COOLDOWN_FILE, obj);
        }, 4000);
        if (this._saveTimer.unref) this._saveTimer.unref();
    }

    getDynamicSiteDomainRegex() {
        const now = Date.now();
        if (this._cachedSiteRx && (now - this._cachedSiteRxAt) < 60000) {
            this._cachedSiteRx.lastIndex = 0;
            return this._cachedSiteRx;
        }

        const hosts = ['prime-(?:web|monir)\\.netlify\\.app'];
        const addHost = (rawUrl) => {
            try {
                if (!rawUrl) return;
                const host = new URL(rawUrl).hostname.replace(/^www\./i, '');
                if (host && !/prime-(?:web|monir)\.netlify\.app/i.test(host)) {
                    const esc = escapeRegExp(host);
                    if (!hosts.includes(esc)) hosts.push(esc);
                }
            } catch {}
        };

        addHost(settings.ownerWebsite);
        try { addHost(systemControl?.getBotBranding?.().ownerWebsite); } catch {}

        this._cachedSiteRx = new RegExp(`https?:\\/\\/(?:www\\.)?(?:${hosts.join('|')})[^\\s<>()]*`, 'gi');
        this._cachedSiteRxAt = now;
        return this._cachedSiteRx;
    }

    toSuperscript(str = '') {
        return [...String(str)].map((ch) => SUPERSCRIPT_MAP[ch] || ch).join('');
    }

    toSubscript(str = '') {
        return [...String(str)].map((ch) => SUBSCRIPT_MAP[ch] || ch).join('');
    }

    // জিরো-কলিশন PUA প্লেসহোল্ডার (কখনোই LaTeX _0 বা মার্কডাউন দিয়ে নষ্ট হবে না)
    protectCodeBlocks(text) {
        const blocks = [];
        let masked = String(text || '').replace(/```[\s\S]*?```/g, (match) => {
            const idx = blocks.length;
            blocks.push(match);
            return `\uE010C${idx}\uE011`;
        });
        masked = masked.replace(/`[^`\n]+`/g, (match) => {
            const idx = blocks.length;
            blocks.push(match);
            return `\uE010C${idx}\uE011`;
        });
        return { masked, blocks };
    }

    restoreCodeBlocks(text, blocks) {
        if (!blocks || !blocks.length) return text;
        return String(text || '').replace(/\uE010C(\d+)\uE011/g, (_, idx) => blocks[Number(idx)] ?? '');
    }

    protectUrls(text) {
        const urls = [];
        const masked = String(text || '').replace(/https?:\/\/[^\s<>()]+/gi, (match) => {
            const idx = urls.length;
            urls.push(match);
            return `\uE010U${idx}\uE011`;
        });
        return { masked, urls };
    }

    restoreUrls(text, urls) {
        if (!urls || !urls.length) return text;
        return String(text || '').replace(/\uE010U(\d+)\uE011/g, (_, idx) => urls[Number(idx)] ?? '');
    }

    stripLeakedSystemTags(text = '') {
        let out = normalizeBn(text)
            .replace(/<think>[\s\S]*?<\/think>/gi, '');
        if (out.includes('<think>')) out = out.split('<think>')[0];

        return out
            .replace(/\[(?:STRICT LANGUAGE OVERRIDE|MANDATORY [^\]]+|VERIFIED [^\]]+|DEEP STYLE DNA|USER MEMORY PROFILE|LINK RULE|Voice Style|Language Rule|SYSTEM|INTERNAL|PROOF|IMAGE|VIDEO|GAMING_DOWNLOAD)[^\]]*\]/gi, '')
            .replace(/@@(?:URLTOKEN|CODEBLOCK)[_\d₀-₉]+@@/g, '')
            .replace(/^(?:Maya|মায়া|Assistant|Bot)\s*:\s*/i, '')
            .trim();
    }

    stripGlitchEmojis(text = '', userText = '') {
        let out = String(text || '');
        if (!out) return out;
        if (settings.maya?.emoji?.disableTrailingSignatureEmoji === false) return out;

        if (!TRAIN_TOPIC_RE.test(String(userText || '')) && GLITCH_TRAIN_EMOJI_RE.test(out)) {
            out = out.replace(GLITCH_TRAIN_EMOJI_RE, '');
            this.metrics.glitchEmojisStripped++;
        }

        // শেষের অকারণ বাড়তি স্পেস পরিষ্কার
        return out.replace(/[ \t]+$/gm, '').trim();
    }

    cleanLatexForWhatsApp(text = '') {
        let out = String(text || '');
        if (!out) return { text: '', hadLatex: false };

        let hadLatex = false;

        out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => { hadLatex = true; return inner.trim(); });
        out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => { hadLatex = true; return inner.trim(); });
        out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => { hadLatex = true; return inner.trim(); });

        out = out.replace(/\$(?!\s)([^$\n]{1,120}?)(?<!\s)\$/g, (full, inner) => {
            const trimmed = inner.trim();
            if (/^\d+(?:\.\d+)?\s+[\u0980-\u09FFa-zA-Z]/.test(trimmed)) return full;
            const looksLikeMath = /[\\^_=+\-*/{}<>]|^[a-zA-Z0-9()]+$/.test(trimmed);
            if (!looksLikeMath) return full;
            hadLatex = true;
            return trimmed;
        });

        for (let pass = 0; pass < 3; pass++) {
            const next = out.replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, num, den) => {
                hadLatex = true;
                return `(${num.trim()}/${den.trim()})`;
            });
            if (next === out) break;
            out = next;
        }

        out = out.replace(/\\sqrt\[3\]\{([^{}]+)\}/g, (_, inner) => {
            hadLatex = true;
            return `∛${inner.length > 2 ? `(${inner})` : inner}`;
        });
        out = out.replace(/\\sqrt\[(\d+)\]\{([^{}]+)\}/g, (_, n, inner) => {
            hadLatex = true;
            return `${this.toSuperscript(n)}√(${inner})`;
        });
        out = out.replace(/\\sqrt\{([^{}]+)\}/g, (_, inner) => {
            hadLatex = true;
            const t = inner.trim();
            return t.length <= 2 && /^[a-zA-Z0-9]+$/.test(t) ? `√${t}` : `√(${t})`;
        });

        for (let i = 0; i < LATEX_SYMBOL_MAP.length; i++) {
            const [re, sym] = LATEX_SYMBOL_MAP[i];
            if (re.test(out)) {
                hadLatex = true;
                out = out.replace(re, sym);
            }
        }

        out = out
            .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|boxed)\{([^{}]+)\}/g, (_, g) => { hadLatex = true; return g; })
            .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, '')
            .replace(/\\[,;:!]/g, ' ');

        out = out.replace(/\^\{([0-9+\-=()ni]+)\}/g, (_, g) => { hadLatex = true; return this.toSuperscript(g); });
        out = out.replace(/([a-zA-Z0-9)])\^([0-9n])/g, (_, base, exp) => { hadLatex = true; return `${base}${this.toSuperscript(exp)}`; });
        out = out.replace(/_\{([0-9+\-=()aeinox]+)\}/g, (_, g) => { hadLatex = true; return this.toSubscript(g); });
        // শুধু একক গাণিতিক ভেরিয়েবল (যেমন x_1, H_2) সাবস্ক্রিপ্ট হবে — বড় শব্দ/টোকেন কখনোই ভাঙবে না
        out = out.replace(/(?<![a-zA-Z0-9_])([a-zA-Z])_([0-9])(?![a-zA-Z0-9_])/g, (_, base, sub) => {
            hadLatex = true;
            return `${base}${this.toSubscript(sub)}`;
        });

        return { text: out, hadLatex };
    }

    normalizeMarkdownLinks(text = '') {
        return String(text || '').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
            const cleanLabel = label.trim();
            if (!cleanLabel || cleanLabel === url) return url;
            return `${cleanLabel}: ${url}`;
        });
    }

    normalizeWhatsAppMarkdown(text = '') {
        let out = this.normalizeMarkdownLinks(text);
        out = out
            .replace(/^#{1,6}\s+(.+)$/gm, (_, title) => `*${title.replace(/\*+/g, '').trim()}*`)
            .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
            .replace(/__([^_\n]+?)__/g, '_$1_')
            .replace(/~~([^~\n]+?)~~/g, '~$1~')
            .replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, '──────────────')
            .replace(/^\s*[-*]\s+/gm, '• ');
        return out;
    }

    polishBanglaPunctuation(text = '') {
        return String(text || '')
            .replace(/[ \t]+([।?!,])/g, '$1')
            .replace(/([।?!])([\u0980-\u09FFA-Za-z])/g, '$1 $2')
            .replace(/।{2,}/g, '।')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    shouldAllowSiteLink({
        chatId = '',
        userText = '',
        botReply = '',
        intent = 'CHAT',
        isImageOnly = false,
        forceAllowLinks = false
    } = {}) {
        const isGroup = String(chatId || '').endsWith('@g.us');

        // ১. গ্রুপ অ্যান্টি-লিংক শিল্ড: গ্রুপে পোর্টফোলিও লিংক কখনোই অটো যাবে না (ওয়ার্নিং/কিক প্রতিরোধ)
        if (isGroup && !forceAllowLinks) {
            const allowGroups = settings.maya?.sanitizer?.portfolioLinkAllowInGroups ?? this.config.allowInGroups;
            let groupSafe = settings.maya?.ui?.groupAntiLinkShield !== false;
            try {
                const ug = userGroupLib?.loadUserGroupData?.();
                if (ug?.groupSafeMode && ug.groupSafeMode[chatId] !== undefined) {
                    groupSafe = Boolean(ug.groupSafeMode[chatId]);
                }
            } catch {}
            if (!allowGroups || groupSafe) {
                return { allowed: false, reason: 'group_antilink_shield' };
            }
        }

        if (forceAllowLinks) return { allowed: true, reason: 'forced' };

        const u = normalizeBn(userText).trim();
        const r = normalizeBn(botReply).trim();

        if (REFUSAL_REGEX.test(r)) return { allowed: false, reason: 'refusal_reply' };
        if (isImageOnly && !u) return { allowed: false, reason: 'image_only_no_ask' };

        const explicitAsk = EXPLICIT_LINK_ASK_REGEX.test(u);
        const intentAllowed = LINK_ALLOWED_INTENTS.has(String(intent || '').toUpperCase());
        if (!explicitAsk && !intentAllowed) return { allowed: false, reason: 'unsolicited' };

        // ২. প্রতি চ্যাটে ২৪ ঘণ্টায় (ঢাকার তারিখ অনুযায়ী) সর্বোচ্চ ১ বার পোর্টফোলিও লিংক
        const dailyLimit = Number.isFinite(settings.maya?.sanitizer?.portfolioLinkDailyLimitPerChat)
            ? settings.maya.sanitizer.portfolioLinkDailyLimitPerChat
            : this.config.dailyLimitPerChat;

        if (dailyLimit <= 0) return { allowed: false, reason: 'daily_limit_zero' };

        if (chatId) {
            const key = String(chatId).toLowerCase();
            const today = getDhakaDateKey();
            const now = Date.now();
            const entry = this.linkCooldowns.get(key);

            if (entry && entry.dateKey === today && entry.count >= dailyLimit) {
                return { allowed: false, reason: 'daily_limit_reached' };
            }

            const nextCount = (entry && entry.dateKey === today) ? entry.count + 1 : 1;
            if (this.linkCooldowns.has(key)) this.linkCooldowns.delete(key);
            this.linkCooldowns.set(key, { dateKey: today, count: nextCount, ts: now });

            while (this.linkCooldowns.size > this.config.maxCooldownEntries) {
                this.linkCooldowns.delete(this.linkCooldowns.keys().next().value);
            }
            this._scheduleCooldownSave();
        }

        return { allowed: true, reason: 'approved' };
    }

    stripForcedSiteBlocks(reply = '') {
        const siteRx = this.getDynamicSiteDomainRegex();
        let out = String(reply || '')
            .replace(/\n*\*?Prime Download Center:?\*?[^\n]*(?:\n[^\n]*(?:FF MAX|ROOT SOLUTION|FIRMWARE|PRIME TUBE)[^\n]*)*/gi, '')
            .replace(/\n*[•*\-–]?\s*\*?পেজ:?\*?[^\n]*/gi, '')
            .replace(new RegExp(`\\n*[•*\\-–]?\\s*🔗?\\s*\\*?লিংক:?\\*?\\s*${siteRx.source}[^\\n]*`, 'gi'), '')
            .replace(/\n*[•*\-–]?\s*(?:🛠|🛠️)?\s*\*?(?:কীভাবে ব্যবহার করবে|ব্যবহার|ক্যাটাগরি):?\*?[^\n]*/gi, '')
            .replace(new RegExp(`\\n*.*?(?:কামাল দেখাতে চাইলে|প্রুফ দেখতে পারো|Prime Download Center-এ গিয়ে)[^\\n]*${siteRx.source}`, 'gi'), '')
            .replace(/\n*\(?লিংকে ঢুকে[^\n)]*\)?/gi, '')
            .replace(siteRx, '');

        return out
            .replace(/\(\s*\)/g, '')
            .replace(/:\s*(?=\n|$)/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    sanitizeReply(rawText = '', options = {}) {
        const {
            chatId = '',
            userText = '',
            intent = 'CHAT',
            isImageOnly = false,
            forceAllowLinks = false,
            enforceLinkFirewall = true
        } = options;

        let text = this.stripLeakedSystemTags(rawText);
        if (!text) return { text: '', hadLatex: false, strippedLinks: false, linkReason: 'empty' };

        this.metrics.sanitizedReplies++;

        const { masked: codeSafe, blocks } = this.protectCodeBlocks(text);
        text = this.normalizeMarkdownLinks(codeSafe);

        let strippedLinks = false;
        let linkReason = 'no_site_link';
        const siteRx = this.getDynamicSiteDomainRegex();
        const hasSiteLink = siteRx.test(text);

        if (enforceLinkFirewall && hasSiteLink) {
            const check = this.shouldAllowSiteLink({
                chatId, userText, botReply: text, intent, isImageOnly, forceAllowLinks
            });
            linkReason = check.reason;
            if (!check.allowed) {
                const cleaned = this.stripForcedSiteBlocks(text);
                if (cleaned.length >= 8) {
                    text = cleaned;
                    strippedLinks = true;
                    this.metrics.linksStripped++;
                }
            }
        }

        // ১. জিরো-কলিশন PUA টোকেন দিয়ে URL সুরক্ষা
        const { masked: urlSafe, urls } = this.protectUrls(text);
        text = urlSafe;

        // ২. LaTeX, মার্কডাউন, গ্লিচ ইমোজি ও বাংলা বিরামচিহ্ন পরিষ্কার
        const latexRes = this.cleanLatexForWhatsApp(text);
        text = latexRes.text;
        if (latexRes.hadLatex) this.metrics.latexCleaned++;

        text = this.normalizeWhatsAppMarkdown(text);
        text = this.stripGlitchEmojis(text, userText);
        text = this.polishBanglaPunctuation(text);

        // ৩. অক্ষত URL ও কোড-ব্লক পুনরুদ্ধার
        text = this.restoreUrls(text, urls);
        text = this.restoreCodeBlocks(text, blocks);

        // সেফটি নেট: কোনো কারণে প্লেসহোল্ডার থেকে গেলে মুছে দেওয়া
        text = text.replace(/[\uE010\uE011]/g, '').replace(/@@(?:URLTOKEN|CODEBLOCK)[_\d₀-₉]+@@/g, '');

        if (text.length > this.config.maxWhatsAppChars) {
            const cut = text.slice(0, this.config.maxWhatsAppChars - 20);
            const stop = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('।'), cut.lastIndexOf(' '));
            text = `${(stop > 500 ? cut.slice(0, stop) : cut).trim()}\n…`;
        }

        return { text, hadLatex: latexRes.hadLatex, strippedLinks, linkReason };
    }

    /**
     * প্রো এক্সপ্রেসিভ বাংলা TTS ফোনেটিক প্রিপ্রেসার (Studio Voice v3 + Edge Neural রেডি)
     */
    prepareTextForTTS(rawText = '', maxChars = this.config.defaultTtsMaxChars) {
        let clean = this.stripLeakedSystemTags(rawText);
        if (!clean) return '';

        this.metrics.ttsPrepared++;

        clean = this.stripGlitchEmojis(clean, '');
        clean = clean
            .replace(/```[\s\S]*?```/g, ' কোডটি মেসেজে দেওয়া আছে। ')
            .replace(/`([^`\n]+)`/g, ' $1 ');
        clean = this.cleanLatexForWhatsApp(clean).text;

        clean = clean
            .replace(/https?:\/\/\S+/gi, 'আমাদের ওয়েবসাইটে')
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, 'ইমেইলে')
            .replace(/\b\d{10,20}@(?:s\.whatsapp\.net|lid|g\.us)\b/gi, 'ওই নম্বরে')
            .replace(/@\d{8,18}\b/g, '');

        clean = clean
            .replace(/([0-9০-৯]),(?=[0-9০-৯]{3}\b)/g, '$1')
            .replace(/\b([0-9০-৯]{1,2}):([0-9০-৯]{2})\s*(?:am|pm)?\b/gi, (_, h, m) => (
                (m === '00' || m === '০০') ? `${h}টা` : `${h}টা ${m}`
            ))
            .replace(/([0-9০-৯]+)\s*[-–—]\s*([0-9০-৯]+)/g, '$1 থেকে $2')
            .replace(/\$\s*([0-9০-৯]+(?:\.[0-9০-৯]+)?)/g, '$1 ডলার')
            .replace(/([0-9০-৯]+(?:\.[0-9০-৯]+)?)\s*\$/g, '$1 ডলার')
            .replace(/৳\s*([0-9০-৯]+(?:\.[0-9০-৯]+)?)/g, '$1 টাকা')
            .replace(/([0-9০-৯]+(?:\.[0-9০-৯]+)?)\s*(?:৳|tk|bdt)\b/gi, '$1 টাকা')
            .replace(/\bv(\d+)\.(\d+)\b/gi, 'ভার্সন $1 পয়েন্ট $2')
            .replace(/([0-9০-৯]+)\s*%/g, '$1 শতাংশ')
            .replace(/24\/7|২৪\/৭/g, 'চব্বিশ ঘণ্টা')
            .replace(/\b([0-9০-৯]+)\s*(?:min|mins|m)\b/gi, '$1 মিনিট')
            .replace(/\b([0-9০-৯]+)\s*(?:hr|hrs|h)\b/gi, '$1 ঘণ্টা')
            .replace(/\b([0-9০-৯]+)\s*(?:sec|secs|s)\b/gi, '$1 সেকেন্ড')
            .replace(/\b([0-9০-৯]+)\s*MB\b/gi, '$1 এম বি')
            .replace(/\b([0-9০-৯]+)\s*GB\b/gi, '$1 জি বি')
            .replace(/\b([0-9০-৯]+)\s*KB\b/gi, '$1 কে বি');

        clean = clean
            .replace(/×/g, ' গুণ ')
            .replace(/÷/g, ' ভাগ ')
            .replace(/√/g, ' রুট ')
            .replace(/=/g, ' সমান ')
            .replace(/±/g, ' প্লাস মাইনাস ')
            .replace(/([\u0980-\u09FFA-Za-z]+)\s*\/\s*([\u0980-\u09FFA-Za-z]+)/g, '$1 বা $2');

        clean = clean
            .replace(/(?:হা){3,}/g, 'হাহা')
            .replace(/(?:হি){3,}/g, 'হিহি')
            .replace(/(?:ha){3,}/gi, 'হাহা')
            .replace(/([\u0985-\u09B9])\1{2,}/g, '$1')
            .replace(/([\u09BE-\u09CC])\1+/g, '$1');

        for (let i = 0; i < TTS_PHONETIC_MAP.length; i++) {
            const [regex, bn] = TTS_PHONETIC_MAP[i];
            clean = clean.replace(regex, bn);
        }

        clean = clean
            .replace(/([\u0980-\u09FFA-Za-z0-9]+)[-\u2013\u2014]+(এর|এ|কে|রে|টা|টি|গুলো|দের|তে|র)(?=\s|[।?!,]|$)/g, '$1 $2')
            .replace(/\.{3,}|…/g, ', ')
            .replace(/[*_`~#>|•━═╭╰┃─▪▫▸►◆◇●○★☆\[\]{}()<>\\]+/g, ' ')
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');

        clean = clean
            .replace(/([।?!,])\s*\r?\n+/g, '$1 ')
            .replace(/\r?\n+/g, '। ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([।?!,])/g, '$1')
            .replace(/([।?!,]){2,}/g, '$1')
            .replace(/^[।,.\s-]+/, '')
            .trim();

        if (clean.length > maxChars) {
            const sliced = clean.slice(0, maxChars);
            const lastStop = Math.max(
                sliced.lastIndexOf('।'),
                sliced.lastIndexOf('?'),
                sliced.lastIndexOf('!')
            );
            if (lastStop >= Math.floor(maxChars * 0.45)) {
                clean = sliced.slice(0, lastStop + 1);
            } else {
                const lastComma = sliced.lastIndexOf(',');
                const lastSpace = sliced.lastIndexOf(' ');
                const cutAt = lastComma >= Math.floor(maxChars * 0.55) ? lastComma : lastSpace;
                clean = `${(cutAt > 40 ? sliced.slice(0, cutAt) : sliced).trim()}।`;
            }
        }

        if (clean && !/[।?!.]$/.test(clean)) {
            clean += '।';
        }

        return clean;
    }

    sweepCooldowns(aggressive = false) {
        const today = getDhakaDateKey();
        for (const [key, entry] of this.linkCooldowns.entries()) {
            if (!entry || entry.dateKey !== today) {
                this.linkCooldowns.delete(key);
            }
        }
        while (this.linkCooldowns.size > this.config.maxCooldownEntries) {
            this.linkCooldowns.delete(this.linkCooldowns.keys().next().value);
        }
        if (aggressive) {
            this._cachedSiteRx = null;
        }
    }

    resetLinkCooldowns() {
        this.linkCooldowns.clear();
        this._scheduleCooldownSave();
    }

    getStats() {
        return {
            trackedLinkCooldowns: this.linkCooldowns.size,
            ...this.metrics
        };
    }
}

const textSanitizer = new TextSanitizer();

module.exports = {
    TextSanitizer,
    textSanitizer,
    sanitizeReply: (raw, opts) => textSanitizer.sanitizeReply(raw, opts),
    cleanLatexForWhatsApp: (t) => textSanitizer.cleanLatexForWhatsApp(t).text,
    normalizeWhatsAppMarkdown: (t) => textSanitizer.normalizeWhatsAppMarkdown(t),
    polishBanglaPunctuation: (t) => textSanitizer.polishBanglaPunctuation(t),
    stripGlitchEmojis: (t, u) => textSanitizer.stripGlitchEmojis(t, u),
    shouldAllowSiteLink: (opts) => textSanitizer.shouldAllowSiteLink(opts),
    stripForcedSiteBlocks: (t) => textSanitizer.stripForcedSiteBlocks(t),
    prepareTextForTTS: (t, max) => textSanitizer.prepareTextForTTS(t, max),
    resetLinkCooldowns: () => textSanitizer.resetLinkCooldowns(),
    getSanitizerStats: () => textSanitizer.getStats()
};
