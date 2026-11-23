const { normalizeBn, OWNER_NAME, BOT_NAME, BOT_VERSION } = require('./mayaCore');

// ==================================================
// ১. PRIME WEB ৯টি অফিসিয়াল রাউট ও নির্ভুল ব্যবহার গাইড
// ==================================================
const SITE_ROUTES = {};

// অ্যান্টি-স্প্যাম লিংক কুলডাউন (অযথা বারবার লিংক দেবে না)
const linkCooldownMap = new Map();
const ROUTE_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const ANY_LINK_COOLDOWN_MS = 10 * 60 * 1000;

const linkPruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of linkCooldownMap.entries()) {
        if (now - (v.lastAnyAt || 0) > 6 * 60 * 60 * 1000) linkCooldownMap.delete(k);
    }
}, 30 * 60 * 1000);
if (linkPruneTimer.unref) linkPruneTimer.unref();

// ==================================================
// ২. ব্র্যান্ড, চিপসেট ও সার্ভিস ডিটেকশন প্যাটার্ন
// ==================================================
const RESTRICTED_BRANDS_RX = /\b(oppo|realme|vivo|iqoo|huawei|honor)\b|অপো|রিয়েলমি|রিয়েলমি|ভিভো|হুয়াওয়ে|হুয়াওয়ে|অনার/i;
const XIAOMI_BRANDS_RX = /\b(xiaomi|redmi|poco|mi\s*\d+)\b|শাওমি|রেডমি|পোকো/i;
const SAMSUNG_BRAND_RX = /\b(samsung|galaxy|sm-[a-z0-9]+)\b|স্যামসাং/i;
const OTG_FRIENDLY_BRANDS_RX = /\b(tecno|infinix|itel|symphony|motorola|moto|nothing|cmf|pixel|oneplus|walton|nokia|sony|asus)\b|টেকনো|ইনফিনিক্স|আইটেল|সিম্ফনি|মটোরোলা|নাথিং|ওয়ালটন|পিক্সেল|ওয়ানপ্লাস/i;
const MODEL_CODE_RX = /\b(?:cph\d{4}|rmx\d{4}|sm-[a-z0-9]+|x\d{4}|km\d[a-z]?|cm\d[a-z]?|ke\d[a-z]?|xt\d{4}|v\d{4})\b/i;

const UNISOC_RX = /\b(unisoc|spreadtrum|tiger\s*t\d+|t606|t612|t616|t618|t700|t760|t820|sc9863a|sc9832e)\b|ইউনিসক/i;
const MEDIATEK_RX = /\b(mediatek|mtk|dimensity|helio|mt6\d{3})\b|মিডিয়াটেক|মিডিয়াটেক|হেলিও|ডাইমেনসিটি/i;
const SNAPDRAGON_RX = /\b(snapdragon|qualcomm|sm\d{4}|sd\s*\d{3})\b|স্ন্যাপড্রাগন|কোয়ালকম/i;
const EXYNOS_RX = /\b(exynos)\b|এক্সিনস/i;
const KIRIN_RX = /\b(kirin|hisilicon)\b|কিরিন/i;

const ROOT_RX = /(রুট|root|bootloader|বুটলোডার|custom\s*rom|কাস্টম\s*রম|কাস্টম\s*রুম|magisk|kernelsu|apatch|twrp|orangefox|gsi|ফ্ল্যাশ|flash)/i;
const UNBRICK_RX = /(unbrick|আনব্রিক|brick|ব্রিক|dead\s*phone|ফোন\s*ডেড|ডেড\s*হয়ে|মারা\s*গেছে|bootloop|বুটলুপ|restart\s*হচ্ছে|রিস্টার্ট\s*আসছে|লোগোতে\s*আটকে|hang\s*on\s*logo|stuck\s*on\s*logo|চালু\s*হচ্ছে\s*না|ফ্লাশ\s*ফেইল|সফটওয়্যার\s*নষ্ট)/i;
const VPN_RX = /(dark\s*tunnel|ডার্ক\s*টানেল|কনফিগ|config|vless|trojan|ssh\s*file|বাইপাস|bypass|ফ্রি\s*নেট|free\s*net|টানেল|tunnel|npv|netmod|v2ray|ভিপিএন|vpn)/i;
const DEV_RX = /(ওয়েবসাইট|ওয়েবসাইট|website|web\s*dev|অ্যাপ\s*বানা|app\s*dev|সফটওয়্যার\s*তৈরি|software|বট\s*তৈরি|whatsapp\s*bot|telegram\s*bot|অটোমেশন|automation|hire|কাজ\s*করাব|প্রজেক্ট)/i;
const GAMING_DL_RX = /(free\s*fire|ফ্রি\s*ফায়ার|ফ্রি\s*ফায়ার|ff\s*max|প্যানেল|panel|হ্যাক|hack|mod\s*apk|এপিকে|apk|ডাউনলোড|download|kernelsu\s*next|prime\s*tube|অ্যাপ\s*লিংক|টুলস\s*ডাউনলোড|ফার্মওয়্যার\s*ডাউনলোড)/i;
const OTG_ASK_RX = /(?:otg|ওটিজি)\s*(?:কি|কী|কেমন|দেখতে\s*কেমন|কোথায়\s*পাব|কোথায়\s*পাব|দাম\s*কত|কত\s*টাকা|কোনটা|কিনব|ছবি|পিক|বলে|মানে)|(?:what\s+is\s+otg|otg\s+ki|otg\s+kemon|otg\s+price)/i;
const PROOF_TRUST_RX = /(প্রুফ|proof|বিশ্বাস|trust|আগে\s*কাজ\s*করেছ|কাজের\s*ছবি|স্ক্রিনশট|রিভিউ|review|আসল\s*নাকি|ফে[ইক]ক|অভিজ্ঞতা|experience|পোর্টফোলিও|portfolio)/i;
const EXPLICIT_LINK_RX = /(লিংক|link|ওয়েবসাইট|ওয়েবসাইট|website|সাইট|কোথায়\s*পাব|ডাউনলোড)/i;

function isAskingAboutOtg(text = '') {
    return OTG_ASK_RX.test(normalizeBn(text));
}

function getOtgExplainerText(style = 'tumi') {
    const addr = style === 'tui' ? 'তোর' : style === 'apni' ? 'আপনার' : 'তোমার';
    return (
        `🔌 *OTG (On-The-Go) কী?*\n` +
        `এটা একটা ছোট কানেক্টর, যা দিয়ে USB ডেটা কেবলের মাধ্যমে একটা ফোন আরেকটা ফোনের সাথে কানেক্ট করা যায়।\n\n` +
        `• *ধরন:* বাজারে ২ ধরনের পাওয়া যায়—১টা *তারওয়ালা (Cable OTG)* আর ১টা *তারছাড়া ছোট অ্যাডাপ্টার (Mini OTG)* (উপরে ২টার ছবি দিলাম)।\n` +
        `• *দাম:* যেকোনো মোবাইল এক্সেসরিজের দোকানে *৩০ থেকে ১০০ টাকার* মধ্যেই পাওয়া যায়।\n` +
        `• *পিসি ছাড়া কীভাবে রুট হবে:* ${addr} কম্পিউটার না থাকলে বন্ধু, মা-বাবা, চাচা বা বাসার যেকোনো কারো আরেকটা *সেকেন্ড ফোন* ম্যানেজ করে OTG ও ডেটা কেবল দিয়ে কানেক্ট করলেই *Bugjaeger / ADB* অ্যাপ দিয়ে ফাস্টবুট কমান্ডে রুট করা যাবে 👍`
    );
}

function detectServiceDomain(text = '') {
    const clean = normalizeBn(text);
    if (isAskingAboutOtg(clean)) return 'otg';
    if (UNBRICK_RX.test(clean)) return 'unbrick';
    if (ROOT_RX.test(clean)) return 'root';
    if (VPN_RX.test(clean)) return 'vpn';
    if (GAMING_DL_RX.test(clean)) return 'gaming_download';
    if (DEV_RX.test(clean)) return 'dev';
    if (PROOF_TRUST_RX.test(clean)) return 'proof';
    return 'general';
}

// ==================================================
// ৩. চিপসেট, ব্র্যান্ড, অ্যান্ড্রয়েড ভার্সন ও পিসি/ওটিজি বিশ্লেষক
// ==================================================
function detectChipsetType(text = '') {
    const s = normalizeBn(text);
    if (UNISOC_RX.test(s)) return 'unisoc';
    if (MEDIATEK_RX.test(s)) return 'mediatek';
    if (SNAPDRAGON_RX.test(s)) return 'snapdragon';
    if (EXYNOS_RX.test(s)) return 'exynos';
    if (KIRIN_RX.test(s)) return 'kirin';
    return 'unknown';
}

function extractAndroidVersions(text = '') {
    const clean = normalizeBn(text);
    const found = new Set();
    const patterns = [
        /(?:android|অ্যান্ড্রয়েড|অ্যান্ড্রয়েড|এন্ড্রয়েড|এন্ড্রয়েড|ভার্সন|version)\s*(?:হলো|হল|:|-|v)?\s*(\d{1,2})\b/gi,
        /\b(?:coloros|realme\s*ui|funtouch\s*os|hyperos|miui|xos|hios|one\s*ui)\s*v?(\d{1,2})\b/gi
    ];
    for (const rx of patterns) {
        for (const m of clean.matchAll(rx)) {
            const v = parseInt(m[1], 10);
            if (v >= 7 && v <= 17) found.add(v);
        }
    }
    return Array.from(found).sort((a, b) => a - b);
}

function analyzeDeviceForRoot({ userText = '', specText = '' } = {}) {
    const combined = normalizeBn(`${userText}\n${specText}`);
    const chipset = detectChipsetType(combined);
    const versions = extractAndroidVersions(combined);
    const maxVersion = versions.length ? versions[versions.length - 1] : null;
    const minVersion = versions.length ? versions[0] : null;

    const isRestricted = RESTRICTED_BRANDS_RX.test(combined);
    const isXiaomi = XIAOMI_BRANDS_RX.test(combined);
    const isSamsung = SAMSUNG_BRAND_RX.test(combined);
    const isOtgFriendly = OTG_FRIENDLY_BRANDS_RX.test(combined);

    let feasibility = 'check_needed';
    let feasibilityNote = 'ছবি বা টেক্সট থেকে ফোনের ব্র্যান্ড, প্রসেসর ও অ্যান্ড্রয়েড ভার্সন মিলিয়ে নিচের ম্যাট্রিক্স অনুযায়ী সিদ্ধান্ত দাও।';
    let hardwareRequirement = 'ব্র্যান্ড ও প্রসেসর অনুযায়ী PC অথবা ২য় ফোন + OTG ব্যবহার হবে।';
    let chipsetNote = '';

    if (chipset === 'unisoc') {
        chipsetNote = 'Unisoc প্রসেসর -> বুটলোডার আনলক করতে স্পেশাল আইডেন্টিফায়ার কোড/টোকেন বের করে কাস্টম আনলক ফাইল (signature.bin) তৈরি করে ফ্ল্যাশ করতে হয়; বটের ওনার পুরোটা নিরাপদে করে দেন।';
    } else if (chipset === 'mediatek') {
        chipsetNote = 'MediaTek (MTK) প্রসেসর -> Fastboot বা প্রফেশনাল PC টুলে (MTKClient / UnlockTool / Android Multi Tool) নিরাপদে আনলক ও রুট হয়।';
    } else if (chipset === 'snapdragon') {
        chipsetNote = 'Snapdragon প্রসেসর -> ব্র্যান্ড অনুযায়ী Fastboot আনলক বা অফিসিয়াল/EDL টুলে কাজ হয়।';
    } else if (chipset === 'exynos') {
        chipsetNote = 'Samsung Exynos -> পিসিতে OEM Unlock ও Odin টুলে রুট/ফ্ল্যাশ হয়।';
    } else if (chipset === 'kirin') {
        chipsetNote = 'Huawei/Honor Kirin -> কোম্পানির হার্ড বুটলোডার লক; পুরোনো ভার্সন ছাড়া আনলক হয় না।';
    }

    if (isRestricted) {
        hardwareRequirement = 'পিসি (PC) ও প্রফেশনাল টুল (UnlockTool / Android Multi Tool) প্রয়োজন হয়।';
        if (minVersion !== null && minVersion >= 14) {
            feasibility = 'not_possible';
            feasibilityNote = `OPPO/Realme/Vivo/Huawei/Honor-এর Android ${minVersion} (14 বা তার উপরে) ভার্সনে কোম্পানি বুটলোডার হার্ড-লক করে রাখায় কোনো থার্ড-পার্টি টুল দিয়েও আনলক/রুট/কাস্টম রম সম্ভব নয়। ভদ্রভাবে জানিয়ে দাও যে এই ভার্সনে বর্তমানে কাজ হয় না।`;
        } else if (maxVersion !== null && maxVersion <= 13) {
            feasibility = 'high_80';
            feasibilityNote = `OPPO/Realme/Vivo/Huawei/Honor-এর Android ${maxVersion} (12/13 বা নিচে) হওয়ায় আগের সিকিউরিটি থাকার কারণে স্পেশাল টুলে বুটলোডার আনলক ও রুট হওয়ার সম্ভাবনা প্রায় *৮০%*।`;
        } else {
            feasibility = 'need_android_version';
            feasibilityNote = 'OPPO/Realme/Vivo/Huawei/Honor-এ Android 12/13 বা নিচে হলে রুট হওয়ার সম্ভাবনা ৮০%, আর Android 14+ হলে কোম্পানির হার্ড-লকের কারণে সম্ভব নয়। ছবিতে বা ইউজারের কাছ থেকে অ্যান্ড্রয়েড ভার্সন নিশ্চিত হও।';
        }
    } else if (isXiaomi) {
        feasibility = 'possible_pc_only';
        hardwareRequirement = '⚠️ Xiaomi/Redmi/POCO ফোনের জন্য *কম্পিউটার/ল্যাপটপ (PC) বাধ্যতামূলক*—কারণ Mi Unlock Tool ও UnlockTool শুধু পিসিতে সাপোর্ট করে (অন্য ফোন/OTG দিয়ে হবে না)।';
        feasibilityNote = 'Xiaomi/Redmi/POCO ফোন বটের ওনার নিরাপদে রুট ও কাস্টম রম করে দেবেন।';
    } else if (isSamsung) {
        feasibility = 'possible_pc_only';
        hardwareRequirement = '⚠️ Samsung ফোনে Odin টুল চালাতে *কম্পিউটার/ল্যাপটপ (PC)* প্রয়োজন।';
        feasibilityNote = 'Samsung ফোনে OEM Unlock থাকলে নিরাপদে রুট করা যাবে।';
    } else if (isOtgFriendly) {
        feasibility = 'possible_otg_or_pc';
        hardwareRequirement = '✅ এর জন্য কম্পিউটার না থাকলেও চলবে! বন্ধু, মা-বাবা বা বাসার যেকোনো কারো *সেকেন্ড ফোন + OTG কেবল* দিয়ে *Bugjaeger / ADB* অ্যাপে ফাস্টবুট কমান্ডেই রুট করা সম্ভব (পিসি থাকলে আরও ভালো)।';
        feasibilityNote = 'এই ফোনটি বটের ওনার নিরাপদে রুট ও কাস্টম রম করে দিতে পারবেন।';
    } else if (chipset === 'unisoc') {
        feasibility = 'possible_otg_or_pc';
        hardwareRequirement = 'Unisoc-এ আনলক ফাইল (signature.bin) তৈরির পর পিসি অথবা ২য় ফোন + OTG দিয়ে আনলক ও রুট করা যায়।';
        feasibilityNote = 'Unisoc প্রসেসরের ফোন বটের ওনার কাস্টম টোকেন ফাইল তৈরি করে রুট করে দিতে পারবেন।';
    }

    return {
        feasibility,
        feasibilityNote,
        hardwareRequirement,
        chipset,
        chipsetNote,
        detectedVersions: versions,
        isRestricted,
        isXiaomi,
        isOtgFriendly
    };
}

// ==================================================
// ৪. স্মার্ট কনটেক্সচুয়াল ওয়েবসাইট লিংক রাউটার (৯টি পেজ + অ্যান্টি-স্প্যাম)
// ==================================================
function pickContextualWebsiteRoute(text = '', chatKey = '', domain = 'general') {
    const clean = normalizeBn(text).toLowerCase();
    const explicitAsk = EXPLICIT_LINK_RX.test(clean) || PROOF_TRUST_RX.test(clean);

    let selectedKey = null;

    if (/(root[\s-]*check|রুট\s*চেক|রুট\s*হবে\s*কিনা\s*দেখ|কোন\s*রম\s*ভালো|custom\s*rom\s*list)/i.test(clean)) {
        selectedKey = 'rootCheck';
    } else if (GAMING_DL_RX.test(clean)) {
        selectedKey = 'downloads';
    } else if (/(টিউটোরিয়াল|টিউটরিয়াল|tutorial|guide|গাইড|শিখব|শিখতে\s*চাই|adb\s*setup)/i.test(clean)) {
        selectedKey = 'tutorials';
    } else if (PROOF_TRUST_RX.test(clean)) {
        selectedKey = /(অভিজ্ঞতা|experience|দক্ষতা|skill)/i.test(clean) ? 'experience' : 'posts';
    } else if (/(hire|হায়ার|অর্ডার\s*করব|কাজ\s*বুক|ওয়েবসাইট\s*বানাব|অ্যাপ\s*বানাব|বট\s*বানাব|সফটওয়্যার\s*বানাব)/i.test(clean)) {
        selectedKey = 'hireMe';
    } else if (/(android\s*research|কার্নেল\s*রিসার্চ|রিসার্চ\s*পেজ)/i.test(clean)) {
        selectedKey = 'androidResearch';
    } else if (/(prime\s*ai|এআই\s*হাব|ai\s*hub|তোমার\s*ওয়েব\s*এআই)/i.test(clean)) {
        selectedKey = 'aiHub';
    } else if (domain === 'root' && /(চেক|হবে\s*কি|সম্ভব|লিংক|ওয়েবসাইট|মডেল|রুট\s*করব)/i.test(clean)) {
        selectedKey = 'rootCheck';
    } else if (/(তোমার\s*ওয়েবসাইট|মালিকের\s*ওয়েবসাইট|মনিরের\s*ওয়েবসাইট|prime\s*web|পোর্টফোলিও)/i.test(clean)) {
        selectedKey = 'home';
    }

    if (!selectedKey) return null;

    const now = Date.now();
    const record = linkCooldownMap.get(chatKey) || { lastAnyAt: 0, byRoute: {} };
    const lastSameAt = record.byRoute[selectedKey] || 0;

    if (!explicitAsk) {
        if (now - lastSameAt < ROUTE_COOLDOWN_MS) return null;
        if (now - record.lastAnyAt < ANY_LINK_COOLDOWN_MS) return null;
    } else if (now - lastSameAt < 2 * 60 * 1000) {
        return null;
    }

    record.lastAnyAt = now;
    record.byRoute[selectedKey] = now;
    linkCooldownMap.set(chatKey, record);

    return { key: selectedKey, ...SITE_ROUTES[selectedKey] };
}

// ==================================================
// ৫. পূর্ণাঙ্গ বিজনেস ও সেলস ডিরেক্টিভ বিল্ডার (ছবি + টেক্সট উভয়ের জন্য নির্ভুল)
// ==================================================
const FULL_ROOT_MATRIX_RULES =
`• ব্র্যান্ড ও অ্যান্ড্রয়েড ভার্সন নিয়ম (ছবি বা টেক্সট যেখান থেকেই মডেল/ভার্সন পাও):
  - *OPPO / Realme / Vivo / Huawei / Honor:* Android 12, 13 বা নিচে হলে রুট হওয়ার সম্ভাবনা *প্রায় ৮০%* (আগের সিকিউরিটি হওয়ায় স্পেশাল PC টুলে বুটলোডার আনলক সম্ভব)। কিন্তু Android 14 বা তার উপরে হলে কোম্পানির হার্ড-লক থাকায় বর্তমানে রুট/কাস্টম রম সম্ভব নয়—ভদ্রভাবে না বলে দাও।
  - *Xiaomi / Redmi / POCO:* রুট ও কাস্টম রম সম্ভব, তবে *কম্পিউটার (PC) বাধ্যতামূলক* (Mi Unlock Tool / UnlockTool পিসি ছাড়া চলে না)।
  - *Tecno / Infinix / Itel / Symphony / Motorola / Nothing / Pixel / OnePlus:* নিরাপদে রুট ও কাস্টম রম করা যাবে। পিসি না থাকলেও বন্ধু বা পরিবারের আরেকটা *সেকেন্ড ফোন + OTG কেবল* দিয়ে *Bugjaeger / ADB* অ্যাপে করা সম্ভব।
  - *Unisoc প্রসেসর:* আইডেন্টিফায়ার কোড/টোকেন বের করে কাস্টম আনলক ফাইল (signature.bin) তৈরি করে ফ্ল্যাশ করতে হয়—বস নিরাপদে করে দেবেন।
  - *Samsung:* পিসিতে Odin টুলে রুট করা হয়।
• দাম ও প্রস্তুতি (রুট সম্ভব হলেই বলবে):
  - আনুমানিক খরচ *৮০০ থেকে ১,৫০০ টাকা*—ফোন দেখে *বস ${OWNER_NAME}* অনলাইনে এসে সঠিক দাম বলে দেবেন।
  - প্রস্তুতি: রুট করলে ফোনের সব ডাটা ডিলিট/রিসেট হবে তাই আগে *ব্যাকআপ* নিতে বলো এবং ফোনে *৬০%+ চার্জ* রাখতে বলো।`;

function buildPrimeBusinessDirective({ userText = '', chatKey = '', role = 'auto', specText = '', mediaKind = '' } = {}) {
    const domain = detectServiceDomain(userText);
    if ((role === 'gf' || role === 'family') && domain === 'general') return '';

    const blocks = [];
    const route = pickContextualWebsiteRoute(userText, chatKey, domain);

    // ক) রুট / কাস্টম রম ইনকোয়ারি (টেক্সট বা ছবি সহ)
    if (domain === 'root') {
        const analysis = analyzeDeviceForRoot({ userText, specText });
        blocks.push(
            `# বটের ওনারের প্রফেশনাল Android Root ও Custom ROM সার্ভিস (অবশ্যই মানবে):\n` +
            `1. *নিজে রুট করার ধাপ/টিউটোরিয়াল (ADB/TWRP/Magisk steps) বা ভয় দেখানো ওয়ার্নিং একদমই দেবে না!* বরং প্রফেশনাল ও আস্থাশীলভাবে বলো যেন ইউজার *${OWNER_NAME}*-এর মাধ্যমেই নিরাপদে কাজটা করিয়ে নেয়।\n` +
            `2. বর্তমান মূল্যায়ন: ${analysis.feasibilityNote}\n` +
            `${analysis.chipsetNote ? `3. চিপসেট নোট: ${analysis.chipsetNote}\n` : ''}` +
            `4. হার্ডওয়্যার নোট: ${analysis.hardwareRequirement}\n` +
            `${FULL_ROOT_MATRIX_RULES}\n` +
            `5. উত্তর হবে সংক্ষিপ্ত ও গোছানো (সর্বোচ্চ ৭–৯ লাইন, কোনো --- ড্যাশ বা রচনা নয়)।`
        );
    } else if (mediaKind === 'image' && domain === 'general') {
        // ইউজার যদি কোনো ক্যাপশন ছাড়াই শুধু About Phone স্ক্রিনশট পাঠায়
        blocks.push(
            `# শর্তসাপেক্ষ স্ক্রিনশট গাইড:\n` +
            `• ছবিটি যদি কোনো ফোনের *About Phone / Device Specs* হয়, তবে ফোনের মডেল, প্রসেসর ও অ্যান্ড্রয়েড ভার্সন সংক্ষেপে উল্লেখ করে নিচের নিয়ম অনুযায়ী রুট সম্ভব কি না জানাও (কখনো নিজে রুট করার টিউটোরিয়াল দেবে না):\n` +
            `${FULL_ROOT_MATRIX_RULES}\n` +
            `• আর সাধারণ ছবি হলে স্বাভাবিক মানুষের মতো সংক্ষেপে উত্তর দাও।`
        );
    }

    // খ) ডেড ফোন / আনব্রিক / বুটলুপ রিকভারি
    if (domain === 'unbrick') {
        blocks.push(
            `# বটের ওনারের ডেড ফোন / আনব্রিক / বুটলুপ রিকভারি সার্ভিস:\n` +
            `• ইউজারকে আশ্বস্ত করো যে *${OWNER_NAME}* ডেড ফোন, হার্ড-ব্রিক, বুটলুপ ও অটো-রিস্টার্ট সমস্যা প্রফেশনাল টুলস (UnlockTool / Android Multi Tool / SP Flash Tool / MTKClient) দিয়ে রিকভার করেন।\n` +
            `• সংক্ষেপে জেনে নাও: (১) ফোনের সঠিক মডেল, (২) কী করতে গিয়ে সমস্যা হয়েছে, (৩) রিকভারি/ফাস্টবুট মোড আসে নাকি একদম ডেড? বলো, বস লাইনে এসেই সমাধান করে দেবেন।`
        );
    }

    // গ) ডার্ক টানেল / ভিপিএন কনফিগ বাইপাস
    if (domain === 'vpn') {
        blocks.push(
            `# বটের ওনারের VPN / Dark Tunnel কনফিগ সার্ভিস:\n` +
            `• সংক্ষেপে নিচের ৪টি তথ্য এক মেসেজে জানতে চাও:\n` +
            `  ১) কোন সিম (GP / Robi / Banglalink / Airtel / Teletalk)?\n` +
            `  ২) কোন প্যাকেজ বা অফার বাইপাস করতে চান?\n` +
            `  ৩) *ফ্রি কনফিগ* নাকি হাই-স্পিড *পেইড কনফিগ* চান?\n` +
            `  ৪) কোন টানেল অ্যাপ ব্যবহার করেন (Dark Tunnel / NPV / NetMod / V2Ray)?\n` +
            `• জানিয়ে দাও, এগুলো লিখে রাখলে *বস ${OWNER_NAME}* লাইনে এসেই ওয়ার্কিং কনফিগ ফাইল দিয়ে দেবেন।`
        );
    }

    // ঘ) ওয়েবসাইট / অ্যাপ / সফটওয়্যার / বট / অটোমেশন ডেভেলপমেন্ট
    if (domain === 'dev') {
        blocks.push(
            `# বটের ওনারের Web / App / Software / Bot & Automation সার্ভিস:\n` +
            `• জানাও যে *${OWNER_NAME}* প্রফেশনাল ওয়েবসাইট, অ্যান্ড্রয়েড অ্যাপ, সফটওয়্যার, হোয়াটসঅ্যাপ/টেলিগ্রাম বট ও অটোমেশন তৈরি করেন।\n` +
            `• ক্লায়েন্টের কাছে সংক্ষেপে কাজের ধরন, মূল ফিচার আর আনুমানিক বাজেট জেনে রাখো—বলো বস অনলাইনে এসেই কাজ শুরু করবেন।`
        );
    }

    // ঙ) ফ্রি ফায়ার / প্যানেল / এপিকে / KernelSU / টুলস ডাউনলোড
    if (domain === 'gaming_download') {
        blocks.push(
            `# প্রাইম ডাউনলোড সেন্টার গাইড:\n` +
            `• ইউজারকে সংক্ষেপে জানাও যে Free Fire MAX / গেমিং আপডেট ও ফাইল, KernelSU Next, Magisk, ADB/Fastboot, ফার্মওয়্যার ও রিকভারি সবকিছু আমাদের অফিসিয়াল Download Center-এ ক্যাটাগরি অনুযায়ী সাজানো আছে।`
        );
    }

    // চ) স্মার্ট কনটেক্সচুয়াল লিংক + গাইড ইনজেকশন (শুধু দরকার হলে)
    if (route) {
        blocks.push(
            `# অফিসিয়াল ওয়েবসাইট লিংক (উত্তরের শেষে স্বাভাবিকভাবে এই লিংকটি দাও এবং ১ লাইনে বলে দাও লিংকে ঢুকে কীভাবে কাজটা করবে):\n` +
            `• পেজ: ${route.title}\n` +
            `• লিংক: ${route.url}\n` +
            `• কীভাবে ব্যবহার করবে: ${route.guide}`
        );
    }

    return blocks.length ? `\n${blocks.join('\n')}` : '';
}

// ==================================================
// ৬. ওনার এক্সিকিউটিভ রিপোর্ট ও অফ-ইনবক্স নম্বর তালিকা
// ==================================================
function buildDisabledInboxesReport(disabledChats = {}, contactProfiles = {}) {
    const uniqueMap = new Map();
    for (const rawKey of Object.keys(disabledChats || {})) {
        if (!disabledChats[rawKey]) continue;
        const phone = String(rawKey).split('@')[0].split(':')[0];
        if (!uniqueMap.has(phone)) {
            const prof = contactProfiles[phone] || contactProfiles[rawKey] || {};
            uniqueMap.set(phone, prof.name || 'অজানা');
        }
    }

    if (!uniqueMap.size) {
        return `🟢 *বস, বর্তমানে কোনো ইনবক্সেই চ্যাটবট বন্ধ নেই!* সব ইনবক্সে মাহিরু অ্যাক্টিভ আছে।`;
    }

    const lines = Array.from(uniqueMap.entries()).map(([num, name], idx) =>
        `${idx + 1}. *${name}* — \`+${num}\``
    );

    return (
        `⏸️ *চ্যাটবট বন্ধ থাকা ইনবক্সের তালিকা (${uniqueMap.size}টি)*\n` +
        `──────────────\n` +
        `${lines.join('\n')}\n\n` +
        `_সব চালু করতে বলো: "সব ইনবক্সে চ্যাটবট অন করে দাও"_`
    );
}

function buildExecutiveConversationReport(activityLog = [], leads = [], disabledChats = {}) {
    const now = Date.now();
    const last24h = (activityLog || []).filter(e => now - (e.ts || 0) <= 24 * 60 * 60 * 1000);

    if (!last24h.length) {
        return `📊 *${BOT_NAME} v${BOT_VERSION} এক্সিকিউটিভ রিপোর্ট (২৪ ঘণ্টা)*\n──────────────\n📭 গত ২৪ ঘণ্টায় নতুন কোনো ইনবক্স অ্যাক্টিভিটি পাওয়া যায়নি।`;
    }

    const bySender = new Map();
    for (const item of last24h) {
        const s = item.sender || 'Unknown';
        if (!bySender.has(s)) bySender.set(s, { count: 0, types: new Set(), lastMsg: '', lastTime: '' });
        const rec = bySender.get(s);
        rec.count += 1;
        rec.types.add(item.type || 'msg');
        rec.lastMsg = item.summary || '';
        rec.lastTime = item.time || '';
    }

    const peopleLines = Array.from(bySender.entries())
        .slice(-12)
        .reverse()
        .map(([sender, info], idx) => {
            const badges = [];
            if (info.types.has('urgent')) badges.push('🚨জরুরি');
            if (info.types.has('lead')) badges.push('💼লিড');
            if (info.types.has('call')) badges.push('📵কল');
            if (info.types.has('abuse')) badges.push('🛡️অ্যাবিউজ');
            const badgeStr = badges.length ? ` [${badges.join(' ')}]` : '';
            return `${idx + 1}. *${sender}* (${info.count}টি মেসেজ${badgeStr}) \`${info.lastTime}\`\n   └ শেষ কথা: _${info.lastMsg.slice(0, 90)}_`;
        });

    const recentLeads = (leads || []).filter(l => now - (l.ts || 0) <= 24 * 60 * 60 * 1000).length;
    const offCount = new Set(Object.keys(disabledChats || {}).map(k => k.split('@')[0])).size;

    return (
        `📊 *${BOT_NAME} v${BOT_VERSION} • ২৪ ঘণ্টার ইনবক্স রিপোর্ট*\n` +
        `──────────────\n` +
        `• মোট অ্যাক্টিভ কন্টাক্ট: *${bySender.size} জন* | নতুন কাজের লিড: *${recentLeads}টি* | অফ ইনবক্স: *${offCount}টি*\n` +
        `──────────────\n` +
        `${peopleLines.join('\n')}`
    );
}

module.exports = {
    SITE_ROUTES,
    RESTRICTED_BRANDS_RX,
    XIAOMI_BRANDS_RX,
    SAMSUNG_BRAND_RX,
    OTG_FRIENDLY_BRANDS_RX,
    MODEL_CODE_RX,
    ROOT_RX,
    UNBRICK_RX,
    VPN_RX,
    isAskingAboutOtg,
    getOtgExplainerText,
    detectServiceDomain,
    detectChipsetType,
    extractAndroidVersions,
    analyzeDeviceForRoot,
    pickContextualWebsiteRoute,
    buildPrimeBusinessDirective,
    buildDisabledInboxesReport,
    buildExecutiveConversationReport
};
