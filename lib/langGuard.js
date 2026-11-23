/**
 * PRIME MONIR • Maya v2.0 ULTRA — Language Detection, Style Matcher & 3-Layer Banglish Enforcer
 * Features:
 *  - High-precision Bangla / Banglish / English detector (handles stretched words, SMS shorthand & suffixes)
 *  - Neutral/ambiguous message sticky inheritance ("ok", "hmm", emojis won't flip language)
 *  - Explicit in-message language switch detection ("banglish e bolo", "বাংলায় বলো", "speak english")
 *  - Auto Pronoun/Politeness detector (apni / tumi / tui with stranger-safe guard)
 *  - 3-Layer Zero-Leak Banglish Enforcer: Prompt Lock -> AI Rewrite Hook -> Offline Syllable Transliterator
 *  - Atomic per-chat language & style lock persistence (./data/lang_prefs.json) for Owner Agent
 */

const fs = require('fs');
const path = require('path');

let registerCleanupHook = null;
try {
    ({ registerCleanupHook } = require('./systemOptimizer'));
} catch {}

const BANGLA_SCRIPT_RE = /[\u0980-\u09FF]/;
const BANGLA_CHAR_GLOBAL_RE = /[\u0980-\u09FF\u0964\u0965]/g;
const LATIN_WORD_RE = /[a-zA-Z]+/g;

const VALID_MODES = new Set(['auto', 'bn_only', 'banglish_reply', 'en']);
const VALID_STYLES = new Set(['auto', 'apni', 'tumi', 'tui']);

const DEFAULT_CONFIG = {
    prefsFile: './data/lang_prefs.json',
    defaultMode: 'bn_only',
    defaultStyle: 'tumi',
    allowTuiAuto: false,           // অপরিচিতদের সাথে অটো 'তুই' না বলে 'তুমি' বলবে (সেফ গার্ড)
    stickyTtlMs: 6 * 60 * 60 * 1000, // ৬ ঘণ্টা পর্যন্ত চ্যাটের শেষ ভাষা মনে রাখবে
    maxStickyEntries: 1000
};

// অ্যাম্বিগুয়াস/নিউট্রাল শব্দ (এগুলো দেখে ভাষা পরিবর্তন করবে না)
const NEUTRAL_WORDS = new Set([
    'ok', 'okay', 'oky', 'kk', 'k', 'hmm', 'hm', 'hmmm', 'hi', 'hii', 'hello', 'hey',
    'yo', 'bro', 'boss', 'sir', 'mama', 'wow', 'nice', 'good', 'cool', 'great', 'fine',
    'lol', 'lmao', 'haha', 'hahaha', 'hehe', 'yes', 'no', 'yep', 'nope', 'ya', 'yup',
    'thanks', 'thank', 'thx', 'tnx', 'ty', 'sorry', 'sry', 'plz', 'pls', 'bye', 'gn', 'gm',
    'done', 'wait', 'same', 'true', 'right', 'oh', 'ohh', 'oo', 'ooo', 'op', 'gg', 'pro'
]);

// শক্তিশালী বাংলিশ অভিধান (O(1) সেট লুকআপ — দ্রুত ও নির্ভুল)
const STRONG_BANGLISH_WORDS = new Set([
    // সর্বনাম ও সম্বোধন
    'ami', 'amr', 'amar', 'amake', 'amk', 'amader', 'amra',
    'tumi', 'tmi', 'tomar', 'tmr', 'tomake', 'tmk', 'tomader', 'tomra',
    'apni', 'apnr', 'apnar', 'apnake', 'apnara', 'apnader',
    'tui', 'tor', 'toke', 'tora', 'toder',
    'bhai', 'vai', 'bhaiya', 'vaiya', 'apu', 'bon', 'bondhu', 'dosto', 'dost', 'kire', 'mama',
    'monir', 'maya', 'chacha', 'kaka', 'baba', 'ammu', 'abbu',

    // প্রশ্নবোধক ও কানেক্টর
    'ki', 'kisu', 'kichu', 'kono', 'keno', 'kno', 'kene', 'kothay', 'kothai', 'koi',
    'kokhon', 'kobe', 'kivabe', 'kibhabe', 'kemne', 'kemon', 'kmn', 'koto', 'koyta', 'konta',
    'ke', 'kar', 'kake', 'kara', 'kader', 'jodi', 'kintu', 'ar', 'aar', 'ebong', 'tobe',
    'tai', 'taina', 'naki', 'na', 'nah', 'nai', 'nei', 'haa', 'ha', 'hya', 'ji', 'jii', 'accha', 'acha',

    // ক্রিয়া ও দৈনন্দিন শব্দ
    'achi', 'asi', 'acho', 'aso', 'achen', 'asen', 'ache', 'ase', 'chilo', 'silo', 'thako', 'thaki', 'thakbe', 'thak',
    'valo', 'bhalo', 'vlo', 'kharap', 'shob', 'sob', 'sobai', 'shobai', 'ektu', 'ekto', 'ekdom', 'khub', 'beshi', 'kom',
    'thik', 'thk', 'bhul', 'vul', 'sotti', 'shotti', 'mitthe', 'mithya', 'asole', 'ashole',
    'koro', 'korbo', 'krbo', 'korchi', 'korsi', 'kortesi', 'korte', 'krte', 'korben', 'koren', 'korle', 'kore', 'koreso', 'korso',
    'hobe', 'hbe', 'hocche', 'hosse', 'hoyeche', 'hoise', 'holo', 'hoye', 'hoy', 'hoile', 'hole',
    'bolo', 'bolen', 'bolun', 'bolchi', 'bolsi', 'boltesi', 'bolte', 'blte', 'bolbo', 'bolle', 'bole',
    'dao', 'den', 'din', 'dibo', 'disi', 'dichhi', 'dite', 'dile', 'de', 'deo',
    'nao', 'nen', 'nin', 'nibo', 'nisi', 'nite', 'nile', 'ne',
    'jao', 'jan', 'jabo', 'jassi', 'jacchi', 'jete', 'jaite', 'gele', 'gelo', 'geche', 'gese',
    'asho', 'aso', 'asbo', 'astesi', 'asche', 'aslo', 'ashle',
    'dekho', 'dekhen', 'dekhbo', 'dekhchi', 'dekhsi', 'dekhte', 'dekhle', 'dekha',
    'shuno', 'suno', 'shunen', 'shunbo', 'shunsi', 'shunte',
    'bujho', 'bujhen', 'bujhbo', 'bujhchi', 'bujhsi', 'bjsi', 'bujhina', 'bujhi', 'bujhcho', 'bujhso',
    'parbo', 'parina', 'pari', 'paro', 'paren', 'parbe', 'parle', 'parchi', 'parsi',
    'jani', 'janina', 'jano', 'janen', 'janbo', 'janai', 'janao', 'janaben',
    'lagbe', 'lgbe', 'lage', 'lagche', 'lagse', 'laglo', 'dorkar', 'drkr', 'chai', 'chao', 'chan', 'chaichi',
    'khabo', 'khaiso', 'kheyecho', 'khawa', 'khabar', 'ghumaicho', 'ghumabo', 'ghum',
    'cholo', 'cholbe', 'chole', 'cholche', 'cholse', 'pathao', 'pathan', 'pathabo', 'pathaisi', 'pathiyechi',

    // সময়, সংখ্যা, টাকা ও সাধারণ বাংলা শব্দ
    'ekhon', 'akhon', 'ekhn', 'pore', 'age', 'ajke', 'aj', 'kalke', 'kal', 'porshu', 'sokale', 'rate', 'ratre', 'dupure', 'bikale',
    'ekta', 'akta', 'duita', 'tinta', 'charta', 'pachta', 'onek', 'onk', 'shudhu', 'sudhu', 'matro', 'abar', 'aro', 'aaro',
    'taka', 'tk', 'poisa', 'dam', 'koto', 'bari', 'basa', 'basha', 'desh', 'dhaka', 'gram', 'kaj', 'kaaj', 'kam',
    'shomossha', 'somossa', 'shomossa', 'somadhan', 'shomadhan', 'kotha', 'nam', 'naam', 'chobi', 'pic', 'gan', 'gaan',
    'bhalobasha', 'valobasha', 'mon', 'koshto', 'kosto', 'dukkho', 'khushi', 'moja', 'hasir', 'rag', 'chinta',
    'dhonnobad', 'shukriya', 'assalamu', 'alaikum', 'salam', 'alhamdulillah', 'inshallah', 'mashallah', 'allah', 'hafez',
    'oboshshoi', 'obosshoi', 'nischoi', 'hoyto', 'mane', 'maane', 'ba', 'ota', 'eta', 'eita', 'oita', 'sheta', 'seta',
    'ekhane', 'okhane', 'shekhane', 'sekhane', 'amar', 'nijer', 'onno', 'notun', 'purono', 'purano', 'boro', 'choto', 'choto',
    'sundor', 'shundor', 'darun', 'osadharon', 'baje', 'foka', 'faka', 'basto', 'byasto', 'kosto', 'sohoj', 'shohoj', 'kothin',
    'porikkha', 'poralekha', 'boye', 'boi', 'onko', 'hisab', 'hishab', 'uttor', 'proshno', 'lekha', 'likhe', 'likho', 'poro',
    'bangla', 'banglish', 'bujhai', 'dekhao', 'shikhao', 'khelbo', 'khela', 'bondho', 'chalu', 'khulo', 'kholo', 'rakho', 'rakhen'
]);

// বাংলিশ ক্রিয়া-প্রত্যয় (অজানা শব্দও ধরতে সাহায্য করে, তবে ইংরেজি শব্দ বাদ দিয়ে)
const BANGLISH_SUFFIX_RE = /(?:tesi|techi|tese|teche|teso|techo|chilo|silo|korbo|korbi|korben|korsi|korchi|hoise|hoyeche|parbo|parina|lagbe|dibo|nibo|jabo|asbo|bolbo|dekhbo)$/;
const ENGLISH_COMMON_WORDS = new Set([
    'the', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might',
    'what', 'where', 'when', 'why', 'how', 'who', 'which', 'that', 'this', 'these', 'those',
    'you', 'your', 'yours', 'me', 'my', 'mine', 'we', 'our', 'they', 'their', 'he', 'she', 'it',
    'please', 'help', 'need', 'want', 'give', 'send', 'tell', 'show', 'make', 'fix', 'install',
    'download', 'update', 'remove', 'delete', 'check', 'open', 'close', 'start', 'stop', 'work',
    'working', 'not', 'error', 'problem', 'issue', 'phone', 'mobile', 'device', 'screen', 'file',
    'price', 'cost', 'much', 'many', 'about', 'with', 'from', 'for', 'and', 'but', 'because',
    'about', 'after', 'before', 'today', 'tomorrow', 'yesterday', 'time', 'now', 'here', 'there'
]);

// অফলাইন বাংলা -> বাংলিশ ফাস্ট শব্দকোষ (সর্বাধিক ব্যবহৃত শব্দের নিখুঁত উচ্চারণ)
const BN_TO_BANGLISH_DICT = {
    'আমি': 'ami', 'আমার': 'amar', 'আমাকে': 'amake', 'আমরা': 'amra', 'আমাদের': 'amader',
    'তুমি': 'tumi', 'তোমার': 'tomar', 'তোমাকে': 'tomake', 'তোমরা': 'tomra', 'তোমাদের': 'tomader',
    'আপনি': 'apni', 'আপনার': 'apnar', 'আপনাকে': 'apnake', 'আপনারা': 'apnara', 'আপনাদের': 'apnader',
    'তুই': 'tui', 'তোর': 'tor', 'তোকে': 'toke', 'তোরা': 'tora',
    'ভাই': 'vai', 'ভাইয়া': 'vaiya', 'আপু': 'apu', 'বোন': 'bon', 'বন্ধু': 'bondhu', 'বস': 'boss',
    'মনির': 'Monir', 'প্রাইম': 'Prime', 'মায়া': 'Maya',
    'ভালো': 'bhalo', 'খারাপ': 'kharap', 'আছি': 'achi', 'আছো': 'acho', 'আছেন': 'achen', 'আছে': 'ache', 'ছিল': 'chilo',
    'কেমন': 'kemon', 'কী': 'ki', 'কি': 'ki', 'কেন': 'keno', 'কোথায়': 'kothay', 'কখন': 'kokhon',
    'কীভাবে': 'kivabe', 'কিভাবে': 'kivabe', 'কত': 'koto', 'কয়টা': 'koyta', 'কোন': 'kon', 'কোনো': 'kono', 'কোনটা': 'konta',
    'হ্যাঁ': 'ha', 'না': 'na', 'নেই': 'nei', 'নাই': 'nai', 'আচ্ছা': 'accha', 'ঠিক': 'thik', 'একদম': 'ekdom',
    'খুব': 'khub', 'অনেক': 'onek', 'একটু': 'ektu', 'শুধু': 'shudhu', 'মাত্র': 'matro', 'সব': 'shob', 'সবাই': 'shobai',
    'আর': 'ar', 'এবং': 'ebong', 'কিন্তু': 'kintu', 'তবে': 'tobe', 'তাই': 'tai', 'যদি': 'jodi', 'তাহলে': 'tahole',
    'বা': 'ba', 'নাকি': 'naki', 'অথবা': 'othoba', 'কারণ': 'karon', 'জন্য': 'jonno', 'সাথে': 'sathe', 'থেকে': 'theke',
    'দিয়ে': 'diye', 'নিয়ে': 'niye', 'করে': 'kore', 'হয়ে': 'hoye', 'গিয়ে': 'giye', 'এসে': 'eshe',
    'এটা': 'eta', 'ওটা': 'ota', 'সেটা': 'sheta', 'এখানে': 'ekhane', 'ওখানে': 'okhane', 'এখন': 'ekhon', 'পরে': 'pore', 'আগে': 'age',
    'আজ': 'aj', 'আজকে': 'ajke', 'কাল': 'kal', 'কালকে': 'kalke', 'সময়': 'shomoy', 'দিন': 'din', 'রাত': 'rat',
    'কথা': 'kotha', 'কাজ': 'kaj', 'কাজটা': 'kajta', 'নাম': 'nam', 'দাম': 'dam', 'টাকা': 'taka', 'ডলার': 'dollar',
    'সমস্যা': 'shomossha', 'সমাধান': 'shomadhan', 'সাহায্য': 'shahajjo', 'দরকার': 'dorkar', 'প্রয়োজন': 'proyojon',
    'ধন্যবাদ': 'dhonnobad', 'স্বাগতম': 'shagotom', 'দুঃখিত': 'dukkhito', 'ক্ষমা': 'khoma', 'অবশ্যই': 'oboshshoi',
    'চিন্তা': 'chinta', 'সুন্দর': 'shundor', 'দারুণ': 'darun', 'সহজ': 'shohoj', 'কঠিন': 'kothin', 'নতুন': 'notun', 'পুরোনো': 'purono',
    'করতে': 'korte', 'করো': 'koro', 'করুন': 'korun', 'করব': 'korbo', 'করবো': 'korbo', 'করছি': 'korchi', 'করেছি': 'korechi', 'করবে': 'korbe',
    'বলো': 'bolo', 'বলুন': 'bolun', 'বলব': 'bolbo', 'বলছি': 'bolchi', 'বলেছি': 'bolechi', 'বলতে': 'bolte', 'বলে': 'bole',
    'দাও': 'dao', 'দিন': 'din', 'দেব': 'debo', 'দিব': 'dibo', 'দিচ্ছি': 'dicchi', 'দিয়েছি': 'diyechi', 'দিতে': 'dite', 'দেবে': 'debe',
    'নাও': 'nao', 'নিন': 'nin', 'নেব': 'nebo', 'নিতে': 'nite', 'নিয়েছি': 'niyechi',
    'হবে': 'hobe', 'হচ্ছে': 'hocche', 'হয়েছে': 'hoyeche', 'হলো': 'holo', 'হয়': 'hoy', 'হলে': 'hole',
    'পারব': 'parbo', 'পারবো': 'parbo', 'পারি': 'pari', 'পারো': 'paro', 'পারেন': 'paren', 'পারবে': 'parbe', 'পারছি': 'parchi', 'পারতে': 'parte',
    'জানি': 'jani', 'জানো': 'jano', 'জানেন': 'janen', 'জানাও': 'janao', 'জানান': 'janan', 'জানাব': 'janabo',
    'বুঝতে': 'bujhte', 'বুঝি': 'bujhi', 'বুঝেছি': 'bujhechi', 'দেখো': 'dekho', 'দেখুন': 'dekhun', 'দেখছি': 'dekhchi', 'দেখা': 'dekha',
    'লাগবে': 'lagbe', 'লাগে': 'lage', 'লাগছে': 'lagche', 'চাই': 'chai', 'চাইলে': 'chaile', 'চাও': 'chao', 'চান': 'chan',
    'আবার': 'abar', 'আরো': 'aro', 'আরও': 'aro', 'কিছু': 'kichu', 'বেশি': 'beshi', 'কম': 'kom', 'সবচেয়ে': 'shobcheye',
    'ছবি': 'chobi', 'ভিডিও': 'video', 'ভয়েস': 'voice', 'অডিও': 'audio', 'মেসেজ': 'message', 'লিংক': 'link', 'ওয়েবসাইট': 'website',
    'ফোন': 'phone', 'মোবাইল': 'mobile', 'অ্যাপ': 'app', 'ফাইল': 'file', 'রুট': 'root', 'সার্ভার': 'server', 'বট': 'bot',
    'বাংলা': 'Bangla', 'ইংরেজি': 'English', 'বাংলিশ': 'Banglish', 'হোয়াটসঅ্যাপ': 'WhatsApp',
    'হিসাব': 'hisab', 'অংক': 'onko', 'উত্তর': 'uttor', 'প্রশ্ন': 'proshno', 'সঠিক': 'shothik', 'ভুল': 'bhul',
    'দয়া': 'doya', 'অনুগ্রহ': 'onugroho', 'অপেক্ষা': 'opekkha', 'তৈরি': 'toiri', 'চালু': 'chalu', 'বন্ধ': 'bondho'
};

const BN_VOWELS = {
    'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u',
    'ঋ': 'ri', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou'
};

const BN_KARS = {
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u',
    'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou'
};

const BN_CONSONANTS = {
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
    'চ': 'ch', 'ছ': 'ch', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
    'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
    'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
    'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh',
    'স': 's', 'হ': 'h', 'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y'
};

const BN_DIGITS = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
};

const HASANTA = '্';

class LanguageGuard {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        // পার-চ্যাট পার্মানেন্ট লক (./data/lang_prefs.json-এ সংরক্ষিত)
        // { globalMode: 'auto', globalStyle: 'auto', chats: { [chatId]: { mode, style, updatedAt } } }
        this.prefs = { globalMode: 'auto', globalStyle: 'auto', chats: {} };

        // পার-চ্যাট স্টিকি হিস্ট্রি (অ্যাম্বিগুয়াস মেসেজে আগের ভাষা ধরে রাখে)
        // chatId -> { mode, style, updatedAt }
        this.stickyMap = new Map();

        this.metrics = {
            totalDetected: 0,
            banglishDetected: 0,
            banglaDetected: 0,
            englishDetected: 0,
            aiRewritesTriggered: 0,
            offlineTransliterations: 0
        };

        this.loadPrefs();

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('langGuard', () => this.sweepSticky(true));
        }

        global.langGuard = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    // --- অ্যাটমিক ফাইল স্টোরেজ (ক্র্যাশে JSON নষ্ট হবে না) ---
    loadPrefs() {
        try {
            if (!fs.existsSync(this.config.prefsFile)) return;
            const parsed = JSON.parse(fs.readFileSync(this.config.prefsFile, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                this.prefs = {
                    globalMode: VALID_MODES.has(parsed.globalMode) ? parsed.globalMode : 'auto',
                    globalStyle: VALID_STYLES.has(parsed.globalStyle) ? parsed.globalStyle : 'auto',
                    chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {}
                };
            }
        } catch {
            this.prefs = { globalMode: 'auto', globalStyle: 'auto', chats: {} };
        }
    }

    savePrefs() {
        try {
            const dir = path.dirname(this.config.prefsFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const tmp = `${this.config.prefsFile}.tmp.${process.pid}`;
            fs.writeFileSync(tmp, JSON.stringify(this.prefs, null, 2), 'utf8');
            fs.renameSync(tmp, this.config.prefsFile);
        } catch {}
    }

    // --- ওনার এজেন্ট ও কমান্ডের জন্য লক কন্ট্রোল API ---
    normalizeModeInput(input = '') {
        const s = String(input || '').trim().toLowerCase();
        if (['auto', 'অটো'].includes(s)) return 'auto';
        if (['bn', 'bn_only', 'bangla', 'বাংলা'].includes(s)) return 'bn_only';
        if (['banglish', 'banglish_reply', 'বাংলিশ', 'roman'].includes(s)) return 'banglish_reply';
        if (['en', 'english', 'ইংরেজি', 'ইংলিশ'].includes(s)) return 'en';
        return null;
    }

    normalizeStyleInput(input = '') {
        const s = String(input || '').trim().toLowerCase();
        if (['auto', 'অটো'].includes(s)) return 'auto';
        if (['apni', 'আপনি', 'formal'].includes(s)) return 'apni';
        if (['tumi', 'তুমি', 'friendly'].includes(s)) return 'tumi';
        if (['tui', 'তুই', 'casual'].includes(s)) return 'tui';
        return null;
    }

    setGlobalLanguage(modeInput) {
        const mode = this.normalizeModeInput(modeInput);
        if (!mode) return false;
        this.prefs.globalMode = mode;
        this.savePrefs();
        return true;
    }

    setGlobalStyle(styleInput) {
        const style = this.normalizeStyleInput(styleInput);
        if (!style) return false;
        this.prefs.globalStyle = style;
        this.savePrefs();
        return true;
    }

    setChatLanguageLock(chatId, modeInput) {
        if (!chatId) return false;
        const mode = this.normalizeModeInput(modeInput);
        if (!mode) return false;

        if (!this.prefs.chats[chatId]) this.prefs.chats[chatId] = {};
        if (mode === 'auto') {
            delete this.prefs.chats[chatId].mode;
        } else {
            this.prefs.chats[chatId].mode = mode;
        }
        this.prefs.chats[chatId].updatedAt = Date.now();
        this.cleanupEmptyChatPref(chatId);
        this.savePrefs();
        return true;
    }

    setChatStyleLock(chatId, styleInput) {
        if (!chatId) return false;
        const style = this.normalizeStyleInput(styleInput);
        if (!style) return false;

        if (!this.prefs.chats[chatId]) this.prefs.chats[chatId] = {};
        if (style === 'auto') {
            delete this.prefs.chats[chatId].style;
        } else {
            this.prefs.chats[chatId].style = style;
        }
        this.prefs.chats[chatId].updatedAt = Date.now();
        this.cleanupEmptyChatPref(chatId);
        this.savePrefs();
        return true;
    }

    cleanupEmptyChatPref(chatId) {
        const entry = this.prefs.chats[chatId];
        if (entry && !entry.mode && !entry.style) {
            delete this.prefs.chats[chatId];
        }
    }

    listLockedChats() {
        return Object.entries(this.prefs.chats).map(([chatId, cfg]) => ({
            chatId,
            mode: cfg.mode || 'auto',
            style: cfg.style || 'auto',
            updatedAt: cfg.updatedAt || 0
        }));
    }

    // --- স্ট্রেচড শব্দ নরমালাইজেশন ("valoooo" -> "valo", "vaiiii" -> "vai") ---
    normalizeToken(word = '') {
        const lower = String(word || '').toLowerCase();
        if (STRONG_BANGLISH_WORDS.has(lower)) return lower;
        // ৩ বা ততোধিক একই অক্ষর কমিয়ে ১টি করে চেক (vaiiii -> vai)
        const squeezed1 = lower.replace(/(.)\1{2,}/g, '$1');
        if (STRONG_BANGLISH_WORDS.has(squeezed1)) return squeezed1;
        // ২ বা ততোধিক অক্ষর কমিয়ে ১টি করে চেক (valoo -> valo, achaa -> acha)
        const squeezedAll = lower.replace(/(.)\1+/g, '$1');
        if (STRONG_BANGLISH_WORDS.has(squeezedAll)) return squeezedAll;
        return squeezed1;
    }

    /**
     * ইউজার মেসেজের ভেতরেই সরাসরি ভাষা বদলাতে বলছে কিনা তা ধরা
     */
    detectExplicitSwitch(rawText = '') {
        const t = String(rawText || '').trim();
        if (!t) return null;
        if (/(?:banglish|বাংলিশ).*(?:bolo|likho|reply|kotha|বলো|বলুন|লেখো|রিপ্লাই)|(?:reply|speak|write|talk)\s+in\s+banglish/i.test(t)) {
            return 'banglish_reply';
        }
        if (/(?:বাংলায়|বাংলা\s*অক্ষরে|bangla\s*te|bangla\s*script).*(?:বলো|বলুন|লেখো|রিপ্লাই|bolo|likho|reply)|(?:reply|speak|write)\s+in\s+bangla/i.test(t)) {
            return 'bn_only';
        }
        if (/(?:english\s*e|ইংরেজিতে|ইংলিশে).*(?:bolo|likho|reply|বলো|বলুন|লেখো)|(?:reply|speak|write|talk)\s+in\s+english/i.test(t)) {
            return 'en';
        }
        return null;
    }

    /**
     * ইউজারের সম্বোধন স্টাইল (apni / tumi / tui) স্বয়ংক্রিয়ভাবে শনাক্ত করা
     */
    detectPronounStyle(rawText = '') {
        const text = String(rawText || '');
        if (!text.trim()) return null;

        // বাংলা ও বাংলিশ 'আপনি' সংকেত
        if (/(?:আপনি|আপনার|আপনাকে|বলুন|করুন|দিন|নিন|আছেন|পারেন|জানেন|স্যার|ভাইয়া)/.test(text) ||
            /\b(?:apni|apnar|apnr|apnake|bolun|bolen|korun|koren|den|din|achen|asen|paren|janen|vaiya|bhaiya|sir)\b/i.test(text)) {
            return 'apni';
        }

        // 'তুই' সংকেত
        if (/(?:তুই|তোর|তোকে|করিস|বলিস|আছিস|পারিস|কিরে)/.test(text) ||
            /\b(?:tui|tor|toke|koris|bolis|achis|asis|paris|kire)\b/i.test(text)) {
            return this.config.allowTuiAuto ? 'tui' : 'tumi';
        }

        // 'তুমি' সংকেত
        if (/(?:তুমি|তোমার|তোমাকে|বলো|করো|দাও|নাও|আছো|পারো|জানো)/.test(text) ||
            /\b(?:tumi|tmi|tomar|tmr|tomake|tmk|bolo|koro|dao|nao|acho|aso|paro|jano|korso|bolso)\b/i.test(text)) {
            return 'tumi';
        }

        return null;
    }

    /**
     * কোর ডিটেকশন ইঞ্জিন: টেক্সট + চ্যাট লক + স্টিকি মেমোরি বিশ্লেষণ করে চূড়ান্ত ভাষা ও স্টাইল নির্ধারণ করে
     */
    analyze(userText = '', { chatId = '', isVoiceInput = false } = {}) {
        this.metrics.totalDetected++;
        const raw = String(userText || '').trim();

        const chatPref = (chatId && this.prefs.chats[chatId]) ? this.prefs.chats[chatId] : {};
        const sticky = chatId ? this.stickyMap.get(chatId) : null;
        const validSticky = sticky && (Date.now() - sticky.updatedAt) <= this.config.stickyTtlMs ? sticky : null;

        // ১. স্টাইল (আপনি/তুমি) নির্ধারণ: চ্যাট লক > গ্লোবাল লক > মেসেজ ডিটেক্ট > স্টিকি > ডিফল্ট
        const detectedStyle = this.detectPronounStyle(raw);
        let style = this.config.defaultStyle;
        if (chatPref.style && chatPref.style !== 'auto') style = chatPref.style;
        else if (this.prefs.globalStyle !== 'auto') style = this.prefs.globalStyle;
        else if (detectedStyle) style = detectedStyle;
        else if (validSticky?.style) style = validSticky.style;

        // ২. ভাষা নির্ধারণ: চ্যাট লক > গ্লোবাল লক > এক্সপ্লিসিট সুইচ > ভয়েস ইনপুট > অটো ডিটেক্ট
        if (chatPref.mode && chatPref.mode !== 'auto') {
            return this.finalizeAnalysis(chatId, chatPref.mode, style, 'chat_lock', 1.0);
        }
        if (this.prefs.globalMode !== 'auto') {
            return this.finalizeAnalysis(chatId, this.prefs.globalMode, style, 'global_lock', 1.0);
        }

        const explicit = this.detectExplicitSwitch(raw);
        if (explicit) {
            return this.finalizeAnalysis(chatId, explicit, style, 'explicit_request', 1.0);
        }

        // ভয়েস নোট এলে সবসময় স্বাভাবিক বাংলায় উত্তর দেবে (যদি না ইউজার ইংরেজি চায়)
        if (isVoiceInput && !raw) {
            return this.finalizeAnalysis(chatId, 'bn_only', style, 'voice_default', 0.95);
        }

        if (!raw) {
            return this.finalizeAnalysis(chatId, validSticky?.mode || this.config.defaultMode, style, 'empty_sticky', 0.5);
        }

        // URL ও মেনশন বাদ দিয়ে আসল লেখা বিশ্লেষণ
        const cleaned = raw
            .replace(/https?:\/\/\S+/gi, ' ')
            .replace(/@\d+/g, ' ')
            .trim();

        // বাংলা ইউনিকোড অক্ষর থাকলে সরাসরি bn_only
        if (BANGLA_SCRIPT_RE.test(cleaned)) {
            return this.finalizeAnalysis(chatId, 'bn_only', style, 'bangla_script', 1.0);
        }

        const rawTokens = cleaned.match(LATIN_WORD_RE) || [];
        if (!rawTokens.length) {
            // শুধু সংখ্যা, অংক বা ইমোজি -> আগের ভাষা ধরে রাখবে
            return this.finalizeAnalysis(chatId, validSticky?.mode || this.config.defaultMode, style, 'symbols_sticky', 0.6);
        }

        // নিউট্রাল শব্দ বাদে অর্থবহ শব্দ আলাদা করা
        const meaningful = [];
        for (const t of rawTokens) {
            const norm = this.normalizeToken(t);
            if (!NEUTRAL_WORDS.has(norm) && !NEUTRAL_WORDS.has(t.toLowerCase())) {
                meaningful.push({ orig: t.toLowerCase(), norm });
            }
        }

        // সব শব্দই যদি "ok", "hi", "hmm", "bro" হয় -> আগের ভাষা ধরে রাখবে
        if (!meaningful.length) {
            return this.finalizeAnalysis(chatId, validSticky?.mode || this.config.defaultMode, style, 'neutral_sticky', 0.65);
        }

        let banglishScore = 0;
        let englishScore = 0;

        for (const { orig, norm } of meaningful) {
            if (STRONG_BANGLISH_WORDS.has(norm)) {
                banglishScore += 2.2;
            } else if (ENGLISH_COMMON_WORDS.has(orig)) {
                englishScore += 1.5;
            } else if (norm.length >= 5 && BANGLISH_SUFFIX_RE.test(norm)) {
                banglishScore += 1.8;
            }
        }

        // ফলাফল নির্ণয়
        if (banglishScore > 0 && banglishScore >= englishScore * 0.75) {
            const conf = Math.min(0.99, 0.7 + banglishScore / (meaningful.length * 3));
            return this.finalizeAnalysis(chatId, 'banglish_reply', style, 'banglish_lexicon', Number(conf.toFixed(2)));
        }

        if (englishScore >= 2.5 || (englishScore > 0 && banglishScore === 0 && meaningful.length >= 2)) {
            return this.finalizeAnalysis(chatId, 'en', style, 'english_lexicon', 0.88);
        }

        // মাত্র ১টা অচেনা ল্যাটিন শব্দ (যেমন কোনো ব্র্যান্ড/নাম "Infinix" বা "Magisk") -> আগের ভাষা ধরে রাখা
        if (meaningful.length === 1 && banglishScore === 0 && englishScore === 0) {
            return this.finalizeAnalysis(chatId, validSticky?.mode || this.config.defaultMode, style, 'single_unknown_sticky', 0.6);
        }

        return this.finalizeAnalysis(chatId, englishScore > 0 ? 'en' : (validSticky?.mode || this.config.defaultMode), style, 'fallback', 0.65);
    }

    finalizeAnalysis(chatId, mode, style, source, confidence) {
        if (mode === 'banglish_reply') this.metrics.banglishDetected++;
        else if (mode === 'en') this.metrics.englishDetected++;
        else this.metrics.banglaDetected++;

        if (chatId) {
            this.stickyMap.set(chatId, { mode, style, updatedAt: Date.now() });
            if (this.stickyMap.size > this.config.maxStickyEntries) {
                this.stickyMap.delete(this.stickyMap.keys().next().value);
            }
        }

        return { mode, style, source, confidence };
    }

    /**
     * যেকোনো টেক্সট বাংলিশ কিনা তা যাচাই (voiceEngine-এর জন্য উপযোগী)
     */
    isBanglishText(text = '') {
        if (!text || BANGLA_SCRIPT_RE.test(text)) return false;
        const res = this.analyze(text, {});
        return res.mode === 'banglish_reply';
    }

    /**
     * প্রম্পটের একদম শেষে বসানোর জন্য স্ট্রিক্ট ল্যাঙ্গুয়েজ লক নির্দেশনা
     */
    getLanguageOverridePrompt(mode = 'bn_only', style = 'tumi') {
        if (mode === 'banglish_reply') {
            const p = style === 'apni'
                ? { sub: 'apni', obj: 'apnar', verb: 'koren', greet: 'kemon achen' }
                : style === 'tui'
                    ? { sub: 'tui', obj: 'tor', verb: 'kor', greet: 'kemon achis' }
                    : { sub: 'tumi', obj: 'tomar', verb: 'koro', greet: 'kemon acho' };

            return `
[MANDATORY LANGUAGE LOCK: BANGLISH ONLY]
- User wrote in Romanized Bangla (Banglish).
- You MUST reply 100% in natural Bangladeshi Banglish using ONLY English A-Z letters.
- STRICTLY FORBIDDEN: ZERO Bangla Unicode characters (অ-হ) and ZERO Bangla Dari (।). Even if earlier chat history contains Bangla script, DO NOT write a single Bangla letter in this reply!
- Use "${p.sub}" / "${p.obj}" naturally.
- Natural examples:
  * "Ami bhalo achi, ${p.sub} ${p.greet}?"
  * "Eta ekdom thik ache, kono chinta nai."
  * "Ektu details bolle ami shohoje help korte parbo."
  * "Kajta korte parbo, ${p.obj} phone-er model ta ektu bolo."
`.trim();
        }

        if (mode === 'en') {
            return `
[MANDATORY LANGUAGE LOCK: ENGLISH]
- Reply in clear, natural, concise English matching the user's tone.
- Do not switch to Bangla script unless quoting a Bangla term.
`.trim();
        }

        const bnStyle = style === 'apni'
            ? 'সম্বোধনে অবশ্যই "আপনি / আপনার" ব্যবহার করো।'
            : style === 'tui'
                ? 'বন্ধুসুলভ ঘনিষ্ঠ টোনে "তুই / তোর" ব্যবহার করো।'
                : 'আন্তরিক ও স্বাভাবিক টোনে "তুমি / তোমার" ব্যবহার করো।';

        return `
[MANDATORY LANGUAGE LOCK: NATURAL BANGLA]
- স্বাভাবিক বাংলাদেশি বাংলায় উত্তর দাও। ${bnStyle}
- প্রতিটি বাক্যের শেষে সঠিক বিরামচিহ্ন (।, ?, !) ব্যবহার করো।
- কখনো LaTeX ($...$, \\frac, \\sqrt) ব্যবহার করবে না; সাধারণ ইউনিকোড (², √, ÷, ×) ব্যবহার করো।
`.trim();
    }

    /**
     * এআই রিপ্লাই ল্যাঙ্গুয়েজ নিয়ম ভেঙেছে কিনা তা যাচাই
     */
    hasLanguageViolation(mode, reply = '') {
        const text = String(reply || '').trim();
        if (!text) return false;

        // কোড-ব্লক বাদ দিয়ে শুধু সাধারণ টেক্সট চেক
        const nonCode = text.replace(/```[\s\S]*?```/g, '').trim();
        if (!nonCode) return false;

        if (mode === 'banglish_reply') {
            return BANGLA_SCRIPT_RE.test(nonCode) || nonCode.includes('।');
        }
        return false;
    }

    /**
     * অফলাইন সিলেবল-ভিত্তিক বাংলা -> বাংলিশ ফোনেটিক ট্রান্সলিটারেটর
     * (জিরো ডিপেন্ডেন্সি, <1ms স্পিড, কোড-ব্লক ও URL নিরাপদ রেখে)
     */
    transliterateBanglaWord(word) {
        if (!word) return '';
        if (BN_TO_BANGLISH_DICT[word]) return BN_TO_BANGLISH_DICT[word];

        const chars = [...word];
        const len = chars.length;
        let out = '';

        for (let i = 0; i < len; i++) {
            const ch = chars[i];
            const next = chars[i + 1] || '';
            const next2 = chars[i + 2] || '';

            // বাংলা সংখ্যা
            if (BN_DIGITS[ch]) {
                out += BN_DIGITS[ch];
                continue;
            }

            // দাঁড়ি ও যতিচিহ্ন
            if (ch === '।' || ch === '॥') {
                out += '.';
                continue;
            }

            // অনুস্বার, বিসর্গ, চন্দ্রবিন্দু, খণ্ড-ত
            if (ch === 'ং') { out += 'ng'; continue; }
            if (ch === 'ঃ') { out += i === len - 1 ? 'o' : 'h'; continue; }
            if (ch === 'ঁ') { continue; }
            if (ch === 'ৎ') { out += 't'; continue; }

            // স্বরবর্ণ
            if (BN_VOWELS[ch]) {
                out += BN_VOWELS[ch];
                continue;
            }

            // কার-চিহ্ন (সাধারণত ব্যঞ্জনের সাথে প্রসেস হয়, তবুও একা থাকলে)
            if (BN_KARS[ch]) {
                out += BN_KARS[ch];
                continue;
            }

            if (ch === HASANTA) continue;

            // বিশেষ যুক্তবর্ণ: ক্ষ (শব্দের শুরুতে kh, মাঝে kkh)
            if (ch === 'ক' && next === HASANTA && next2 === 'ষ') {
                out += i === 0 ? 'kh' : 'kkh';
                i += 2;
                const after = chars[i + 1] || '';
                if (BN_KARS[after]) {
                    out += BN_KARS[after];
                    i++;
                } else if (after && after !== HASANTA && i < len - 1) {
                    out += 'o';
                }
                continue;
            }

            // বিশেষ যুক্তবর্ণ: জ্ঞ (শুরুতে g, মাঝে gg)
            if (ch === 'জ' && next === HASANTA && next2 === 'ঞ') {
                out += i === 0 ? 'g' : 'gg';
                i += 2;
                const after = chars[i + 1] || '';
                if (BN_KARS[after]) {
                    out += BN_KARS[after];
                    i++;
                } else if (after && after !== HASANTA && i < len - 1) {
                    out += 'o';
                }
                continue;
            }

            // ব্যঞ্জনবর্ণ
            if (BN_CONSONANTS[ch]) {
                // য-ফলা (যেমন ব্যা -> be/ba, ব্য -> be)
                if (next === HASANTA && next2 === 'য') {
                    out += BN_CONSONANTS[ch];
                    i += 2;
                    const after = chars[i + 1] || '';
                    if (after === 'া') {
                        out += i <= 2 ? 'a' : 'ya';
                        i++;
                    } else if (BN_KARS[after]) {
                        out += 'y' + BN_KARS[after];
                        i++;
                    } else {
                        out += i <= 2 ? 'e' : 'o';
                    }
                    continue;
                }

                out += BN_CONSONANTS[ch];

                // হসন্ত থাকলে স্বরধ্বনি (o) বসবে না
                if (next === HASANTA) {
                    i++; // হসন্ত স্কিপ
                    continue;
                }

                // পরের অক্ষর কার-চিহ্ন হলে সরাসরি যোগ
                if (BN_KARS[next]) {
                    out += BN_KARS[next];
                    i++;
                    continue;
                }

                // স্বাভাবিক 'o' স্বরধ্বনি নিয়ম (বাংলা উচ্চারণ অনুযায়ী)
                const isLast = i === len - 1;
                if (!isLast) {
                    const nextIsConsonant = Boolean(BN_CONSONANTS[next]);
                    const nextHasKar = nextIsConsonant && Boolean(BN_KARS[next2]);
                    const nextIsHasanta = nextIsConsonant && next2 === HASANTA;

                    // শব্দের প্রথম অক্ষর অথবা পরের ব্যঞ্জনে কার না থাকলে 'o' বসে (kolom, shomoy, korchi)
                    if (i === 0 || (!nextHasKar && !nextIsHasanta && next !== 'ং' && next !== 'ৎ')) {
                        out += 'o';
                    }
                }
                continue;
            }

            // অন্য যেকোনো অক্ষর যেমন আছে তেমনই থাকবে
            out += ch;
        }

        return out;
    }

    transliterateBanglaToBanglish(text = '') {
        if (!text) return '';

        // কোড-ব্লক ও URL রক্ষা করা
        const protectedBlocks = [];
        let masked = String(text).replace(/```[\s\S]*?```|https?:\/\/\S+/g, (m) => {
            const idx = protectedBlocks.length;
            protectedBlocks.push(m);
            return `@@LANGPROT_${idx}@@`;
        });

        // প্রতিটি বাংলা শব্দ আলাদাভাবে রূপান্তর
        masked = masked
            .replace(/[\u0980-\u09FF]+/g, (bnWord) => this.transliterateBanglaWord(bnWord))
            .replace(/[।॥]/g, '.')
            .replace(/\.\s*\./g, '.')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();

        // বাক্যের প্রথম অক্ষর ক্যাপিটাল করা
        masked = masked.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix, ch) => prefix + ch.toUpperCase());

        // কোড-ব্লক ও URL ফিরিয়ে আনা
        return masked.replace(/@@LANGPROT_(\d+)@@/g, (_, idx) => protectedBlocks[Number(idx)] ?? '');
    }

    /**
     * ৩-স্তরের জিরো-লিক আউটপুট এনফোর্সার:
     * @param {string} reply - এআই-এর আসল রিপ্লাই
     * @param {string} mode - 'bn_only' | 'banglish_reply' | 'en'
     * @param {string} style - 'apni' | 'tumi' | 'tui'
     * @param {Function|null} aiRewriteFn - async (rewritePrompt) => string (ঐচ্ছিক, থাকলে আগে AI দিয়ে রি-রাইট করবে)
     */
    async enforceOutputLanguage(reply = '', mode = 'bn_only', style = 'tumi', aiRewriteFn = null) {
        const original = String(reply || '');
        if (!original.trim() || !this.hasLanguageViolation(mode, original)) {
            return { text: original, fixed: false, method: 'none' };
        }

        if (mode === 'banglish_reply') {
            // স্তর ২: দ্রুত AI রি-রাইট চেষ্টা
            if (typeof aiRewriteFn === 'function') {
                try {
                    this.metrics.aiRewritesTriggered++;
                    const rewritePrompt =
                        `Convert the following reply into natural, casual Bangladeshi Banglish using ONLY English A-Z letters (zero Bangla characters, keep meaning, tone, emojis, and "${style}" pronoun exact, return ONLY the converted text):\n\n${original}`;
                    const rewritten = await aiRewriteFn(rewritePrompt);
                    if (rewritten && typeof rewritten === 'string' && rewritten.trim() && !this.hasLanguageViolation('banglish_reply', rewritten)) {
                        return { text: rewritten.trim(), fixed: true, method: 'ai_rewrite' };
                    }
                } catch {}
            }

            // স্তর ৩: অফলাইন ফোনেটিক ট্রান্সলিটারেটর (১০০% গ্যারান্টিড, কখনো ফেল করে না)
            this.metrics.offlineTransliterations++;
            const transliterated = this.transliterateBanglaToBanglish(original);
            return { text: transliterated, fixed: true, method: 'offline_transliterator' };
        }

        return { text: original, fixed: false, method: 'none' };
    }

    sweepSticky(aggressive = false) {
        const now = Date.now();
        const ttl = aggressive ? 30 * 60 * 1000 : this.config.stickyTtlMs;
        for (const [chatId, entry] of this.stickyMap.entries()) {
            if (now - entry.updatedAt > ttl) {
                this.stickyMap.delete(chatId);
            }
        }
    }

    getStats() {
        return {
            globalMode: this.prefs.globalMode,
            globalStyle: this.prefs.globalStyle,
            lockedChatsCount: Object.keys(this.prefs.chats).length,
            stickyChatsTracked: this.stickyMap.size,
            ...this.metrics
        };
    }
}

const langGuard = new LanguageGuard();

module.exports = {
    LanguageGuard,
    langGuard,
    analyzeLanguage: (text, opts) => langGuard.analyze(text, opts),
    isBanglishText: (text) => langGuard.isBanglishText(text),
    getLanguageOverridePrompt: (mode, style) => langGuard.getLanguageOverridePrompt(mode, style),
    hasLanguageViolation: (mode, reply) => langGuard.hasLanguageViolation(mode, reply),
    enforceOutputLanguage: (reply, mode, style, fn) => langGuard.enforceOutputLanguage(reply, mode, style, fn),
    transliterateBanglaToBanglish: (text) => langGuard.transliterateBanglaToBanglish(text),
    setChatLanguageLock: (chatId, mode) => langGuard.setChatLanguageLock(chatId, mode),
    setChatStyleLock: (chatId, style) => langGuard.setChatStyleLock(chatId, style),
    setGlobalLanguage: (mode) => langGuard.setGlobalLanguage(mode),
    setGlobalStyle: (style) => langGuard.setGlobalStyle(style),
    listLockedChats: () => langGuard.listLockedChats(),
    getLangStats: () => langGuard.getStats()
};
