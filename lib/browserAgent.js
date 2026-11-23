const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    loadJson,
    saveJson,
    scheduleSaveJson,
    normalizeBn,
    generateWithFailover,
    sendOwnerAlert
} = require('./mahiruCore');
const {
    RESTRICTED_BRANDS_RX,
    XIAOMI_BRANDS_RX,
    OTG_FRIENDLY_BRANDS_RX,
    MODEL_CODE_RX,
    ROOT_RX,
    analyzeDeviceForRoot
} = require('./primeKnowledge');

const DATA_DIR = path.join(process.cwd(), 'data');
const WATCH_FILE = path.join(DATA_DIR, 'mahiru_web_watch.json');
const PHONE_SPECS_CACHE_FILE = path.join(DATA_DIR, 'mahiru_phone_specs_cache.json');
const MEDIA_CACHE_DIR = path.join(DATA_DIR, 'media_cache');

const CACHE_TTL_MS = 20 * 60 * 1000;
const PHONE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ৩০ দিন ভেরিফায়েড ফোন স্পেক ক্যাশ
const MAX_CACHE_ITEMS = 80;
const MAX_PHONE_CACHE_ITEMS = 120;
const MAX_PAGE_BYTES = 1000 * 1024;
const MAX_IMAGE_BYTES = 1800 * 1024;
const RESEARCH_BUDGET_MS = 6500;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });

let watchList = loadJson(WATCH_FILE, []);
let verifiedPhoneCache = loadJson(PHONE_SPECS_CACHE_FILE, {});
if (!Array.isArray(watchList)) watchList = [];
if (!verifiedPhoneCache || typeof verifiedPhoneCache !== 'object') verifiedPhoneCache = {};

const researchCache = new Map();
let watchdogSock = null;
let watchdogTimer = null;

function saveWatchList() { saveJson(WATCH_FILE, watchList); }

function getCachedPhoneSpec(modelKey = '') {
    const key = modelKey.toLowerCase().trim();
    const item = verifiedPhoneCache[key];
    if (!item) return null;
    if (Date.now() - (item.ts || 0) > PHONE_CACHE_TTL_MS) {
        delete verifiedPhoneCache[key];
        scheduleSaveJson(PHONE_SPECS_CACHE_FILE, verifiedPhoneCache, 5000);
        return null;
    }
    return item;
}

function setCachedPhoneSpec(modelKey = '', payload = {}) {
    const key = modelKey.toLowerCase().trim();
    if (!key || !payload?.title) return;
    verifiedPhoneCache[key] = { ...payload, ts: Date.now() };
    const keys = Object.keys(verifiedPhoneCache);
    if (keys.length > MAX_PHONE_CACHE_ITEMS) {
        const oldest = keys.sort((a, b) => (verifiedPhoneCache[a]?.ts || 0) - (verifiedPhoneCache[b]?.ts || 0)).slice(0, keys.length - MAX_PHONE_CACHE_ITEMS);
        for (const k of oldest) delete verifiedPhoneCache[k];
    }
    scheduleSaveJson(PHONE_SPECS_CACHE_FILE, verifiedPhoneCache, 4000);
}

// ==================================================
// ১. URL নিরাপত্তা (SSRF প্রটেকশন), Bot/CAPTCHA শিল্ড ও HTML ক্লিনার
// ==================================================
const BOT_BLOCK_RX = /(just a moment\.\.\.|attention required!\s*\|\s*cloudflare|verify you are human|are you a robot|please enable javascript and cookies|access denied|403 forbidden|ddos-guard|checking your browser before accessing|cf-browser-verification|g-recaptcha|hcaptcha|px-captcha|bot protection|unusual traffic from your computer|security check to access)/i;

const BLOCKED_DOMAINS = new Set([
    'facebook.com', 'm.facebook.com', 'instagram.com', 'tiktok.com',
    'twitter.com', 'x.com', 'pinterest.com', 'linkedin.com', 'quora.com', 'youtube.com', 'youtu.be'
]);

const TRUSTED_SPEC_DOMAINS = [
    'gsmarena.com', 'mobiledokan.com', 'mobiledokan.co', 'devicespecifications.com',
    '91mobiles.com', 'nanoreview.net', 'kimovil.com', 'smartprix.com',
    'gadgets360.com', 'gsmarena.com.bd', 'mobilemaya.com', 'bdprice.com.bd', 'phoneaqua.com'
];

const GREETING_NO_SEARCH_RX = /(?:found\s+you\s+(?:through|from|via)|came\s+from\s+your\s+website|saw\s+your\s+website|from\s+your\s+(?:website|site|portfolio)|through\s+your\s+(?:website|site)|তোমার\s*ওয়েবসাইট\s*থেকে|আপনার\s*ওয়েবসাইট\s*থেকে|ওয়েবসাইট\s*থেকে\s*(?:এলাম|আসলাম|আসছি|পেলাম|নক))/i;

function extractUrls(text = '') {
    const matches = String(text || '').match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi) || [];
    return Array.from(new Set(matches.map(u => u.replace(/[.,!?;:)]+$/, '')))).filter(isSafePublicUrl);
}

function isSafePublicUrl(urlStr = '') {
    try {
        const u = new URL(urlStr);
        if (!['http:', 'https:'].includes(u.protocol)) return false;
        const host = u.hostname.toLowerCase();
        if (
            host === 'localhost' ||
            host.endsWith('.local') ||
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^0\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^169\.254\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
            host === '::1' ||
            host.startsWith('fc') ||
            host.startsWith('fd')
        ) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function getDomain(urlStr = '') {
    try { return new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase(); } catch { return 'website'; }
}

function isBlockedPageText(text = '') {
    const sample = String(text || '').slice(0, 1500);
    if (sample.length < 45) return true;
    return BOT_BLOCK_RX.test(sample);
}

function decodeHtmlEntities(str = '') {
    return String(str || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
}

function stripHtmlToText(html = '') {
    return decodeHtmlEntities(
        String(html || '')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();
}

function cacheGet(key) {
    const entry = researchCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        researchCache.delete(key);
        return null;
    }
    return entry.value;
}

function cacheSet(key, value) {
    researchCache.set(key, { value, ts: Date.now() });
    if (researchCache.size > MAX_CACHE_ITEMS) {
        researchCache.delete(researchCache.keys().next().value);
    }
}

// ==================================================
// ২. ব্র্যান্ড-অ্যাঙ্করড বাংলা/বাংলিশ ফোন মডেল এক্সট্র্যাক্টর
// ==================================================
const BN_PHONE_LEXICON = [
    [/টেকনো/g, 'Tecno'], [/স্পার্ক/g, 'Spark'], [/ক্যামন/g, 'Camon'], [/পোভা/g, 'Pova'], [/পপ/g, 'Pop'],
    [/ইনফিনিক্স/g, 'Infinix'], [/হট/g, 'Hot'], [/স্মার্ট/g, 'Smart'], [/জিরো/g, 'Zero'],
    [/আইটেল/g, 'Itel'], [/সিম্ফনি/g, 'Symphony'], [/ওয়ালটন|ওয়ালটন/g, 'Walton'],
    [/অপো/g, 'Oppo'], [/রেনো/g, 'Reno'], [/রিয়েলমি|রিয়েলমি/g, 'Realme'], [/নারজো/g, 'Narzo'],
    [/ভিভো/g, 'Vivo'], [/হুয়াওয়ে|হুয়াওয়ে/g, 'Huawei'], [/অনার/g, 'Honor'],
    [/শাওমি/g, 'Xiaomi'], [/রেডমি/g, 'Redmi'], [/পোকো/g, 'Poco'],
    [/স্যামসাং/g, 'Samsung'], [/গ্যালাক্সি/g, 'Galaxy'], [/মটোরোলা/g, 'Motorola'], [/মটো/g, 'Moto'],
    [/নাথিং/g, 'Nothing'], [/পিক্সেল/g, 'Pixel'], [/ওয়ানপ্লাস|ওয়ানপ্লাস/g, 'OnePlus'], [/নোকিয়া|নোকিয়া/g, 'Nokia'],
    [/নোট/g, 'Note'], [/প্রো/g, 'Pro'], [/প্লাস/g, 'Plus'], [/আল্ট্রা/g, 'Ultra'],
    [/লাইট/g, 'Lite'], [/ম্যাক্স/g, 'Max'], [/নিও/g, 'Neo'], [/মিনি/g, 'Mini'],
    [/পাওয়ার|পাওয়ার/g, 'Power'], [/প্লে/g, 'Play'], [/প্রাইম/g, 'Prime'],
    [/ফাইভ\s*জি/g, '5G'], [/ফোর\s*জি/g, '4G']
];

const BRAND_ANCHOR_RX = /\b(tecno|infinix|itel|symphony|walton|oppo|realme|vivo|iqoo|huawei|honor|xiaomi|redmi|poco|samsung|galaxy|motorola|moto|nothing|cmf|pixel|oneplus|nokia|sony|asus)\b/i;

const BANGLISH_STOP_RX = /\b(root|custom\s*rom|bootloader|unlock|unbrick|brick|flash|magisk|kernelsu|apatch|twrp|korbo|korbe|korte|korate|korabo|koranor|chai|chacchi|chaitesi|kora|jabe|kina|koto|taka|price|lagbe|dibo|nibo|hobe|hoye|geche|gelo|amar|amr|ami|amake|amader|tumi|tomar|apni|apnar|ei|eta|ota|ekta|akta|phone|phn|fon|mobile|mbl|device|model|ta|te|er|ke|r|ar|please|pls|plz|vai|vaiya|bhai|bhaiya|bro|boss|sir|dada|mama|dost|can|you|my|want|to|need|help|with|the|is|it|possible|for|how|much|cost|hello|hi|assalamu|alaikum|salam)\b/gi;

function translateBnPhoneTerms(text = '') {
    let s = normalizeBn(text).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
    for (const [rx, en] of BN_PHONE_LEXICON) {
        s = s.replace(rx, ` ${en} `);
    }
    return s;
}

function extractPhoneModelCandidate(text = '') {
    let clean = translateBnPhoneTerms(text)
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\[রিপ্লাই করা আগের মেসেজ:[^\]]*\]/g, ' ')
        .replace(/[\u0980-\u09FF]+/g, ' ')
        .replace(/[^a-zA-Z0-9\s\-+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // ব্র্যান্ড নাম পাওয়া গেলে ঠিক ব্র্যান্ডের শুরু থেকেই কাটবে (ফলে "Ami/Bhai/Amar" কখনো সামনে থাকবে না)
    const brandMatch = clean.match(BRAND_ANCHOR_RX);
    if (brandMatch && typeof brandMatch.index === 'number') {
        clean = clean.slice(brandMatch.index);
    }

    clean = clean
        .replace(BANGLISH_STOP_RX, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // সর্বোচ্চ ৬ শব্দ (যেমন: Tecno Camon 40 Pro 5G)
    const tokens = clean.split(' ').filter(Boolean).slice(0, 6);
    return tokens.join(' ').slice(0, 50);
}

function detectPhoneRootInquiry(text = '') {
    const clean = normalizeBn(text).trim();
    const translated = translateBnPhoneTerms(clean);
    const hasRootIntent = ROOT_RX.test(clean) || /(আনব্রিক|unbrick|ডেড|bootloop|বুটলুপ)/i.test(clean);
    const hasKnownBrand =
        BRAND_ANCHOR_RX.test(translated) ||
        RESTRICTED_BRANDS_RX.test(translated) ||
        XIAOMI_BRANDS_RX.test(translated) ||
        OTG_FRIENDLY_BRANDS_RX.test(translated);
    const hasModelCode = MODEL_CODE_RX.test(translated);
    const modelCandidate = extractPhoneModelCandidate(clean);

    const looksLikeModel = hasKnownBrand || hasModelCode || (modelCandidate.length >= 4 && /\d/.test(modelCandidate));
    const isPhoneLookup = Boolean(hasRootIntent && looksLikeModel && modelCandidate.length >= 3);

    return {
        hasRootIntent,
        isPhoneLookup,
        modelCandidate
    };
}

function shouldAutoResearch(text = '') {
    const clean = normalizeBn(text).trim();
    if (clean.length < 5) return false;
    if (GREETING_NO_SEARCH_RX.test(clean)) return false;
    if (extractUrls(clean).length > 0) return true;
    if (detectPhoneRootInquiry(clean).isPhoneLookup) return true;

    return /(রিসার্চ|research|খুঁজে দাও|খুজে দাও|সার্চ কর|search|কোন সাইট|দাম কত|price|মার্কেট|আজকের খবর|news|স্কোর|score|খেলা|আবহাওয়া|weather|রেট কত|ডলার রেট|সর্বশেষ|latest|আপডেট|release date|specs|ফিচার কি|রিভিউ|review|তুলনা|compare|vs|ডাউনলোড লিংক|অফিশিয়াল সাইট|কবে বের হবে|কিভাবে সমাধান|error fix|unlocktool|android multi tool|amt tool|mtkclient|sp flash tool|kernelsu|apatch|dark tunnel|free fire ob)/i.test(clean);
}

// ==================================================
// ৩. ৪-লেয়ার মাল্টি-ইঞ্জিন সার্চ (Tavily -> Brave -> DDG HTML -> DDG Lite -> Wikipedia)
// ==================================================
async function searchTavily(query, maxResults = 5, timeoutMs = 4500) {
    const key = (process.env.TAVILY_API_KEY || '').trim();
    if (!key) return [];
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, query, search_depth: 'basic', max_results: maxResults, include_answer: false }),
            signal: AbortSignal.timeout(timeoutMs)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || [])
            .filter(r => r.url && isSafePublicUrl(r.url) && !BLOCKED_DOMAINS.has(getDomain(r.url)))
            .map(r => ({
                title: String(r.title || getDomain(r.url)).slice(0, 140),
                url: r.url,
                domain: getDomain(r.url),
                snippet: String(r.content || '').slice(0, 450)
            }));
    } catch { return []; }
}

async function searchBrave(query, maxResults = 5, timeoutMs = 4500) {
    const key = (process.env.BRAVE_API_KEY || '').trim();
    if (!key) return [];
    try {
        const res = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
            { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key }, signal: AbortSignal.timeout(timeoutMs) }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data?.web?.results || [])
            .filter(r => r.url && isSafePublicUrl(r.url) && !BLOCKED_DOMAINS.has(getDomain(r.url)))
            .map(r => ({
                title: String(r.title || getDomain(r.url)).slice(0, 140),
                url: r.url,
                domain: getDomain(r.url),
                snippet: stripHtmlToText(r.description || '').slice(0, 380)
            }));
    } catch { return []; }
}

async function searchDuckDuckGoHtml(query, maxResults = 5, timeoutMs = 5000) {
    try {
        const res = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9,bn-BD;q=0.8'
                },
                signal: AbortSignal.timeout(timeoutMs)
            }
        );
        if (!res.ok) return [];
        const html = await res.text();
        if (BOT_BLOCK_RX.test(html.slice(0, 1200))) return [];

        const results = [];
        const links = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
        const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi)];

        for (let i = 0; i < links.length && results.length < maxResults; i++) {
            let rawHref = decodeHtmlEntities(links[i][1] || '');
            const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
            if (uddgMatch && uddgMatch[1]) {
                try { rawHref = decodeURIComponent(uddgMatch[1]); } catch {}
            } else if (rawHref.startsWith('//')) rawHref = 'https:' + rawHref;

            if (!isSafePublicUrl(rawHref) || BLOCKED_DOMAINS.has(getDomain(rawHref))) continue;
            const title = stripHtmlToText(links[i][2] || '').slice(0, 140);
            const snippet = stripHtmlToText(snippets[i]?.[1] || '').slice(0, 380);
            if (!title) continue;

            results.push({ title, url: rawHref, domain: getDomain(rawHref), snippet });
        }
        return results;
    } catch { return []; }
}

async function searchDuckDuckGoLite(query, maxResults = 5, timeoutMs = 4500) {
    try {
        const res = await fetch(
            `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                signal: AbortSignal.timeout(timeoutMs)
            }
        );
        if (!res.ok) return [];
        const html = await res.text();
        if (BOT_BLOCK_RX.test(html.slice(0, 1200))) return [];

        const results = [];
        const links = [...html.matchAll(/<a[^>]+class=['"]result-link['"][^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)];
        const snippets = [...html.matchAll(/<td[^>]+class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi)];

        for (let i = 0; i < links.length && results.length < maxResults; i++) {
            let rawHref = decodeHtmlEntities(links[i][1] || '');
            const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
            if (uddgMatch && uddgMatch[1]) {
                try { rawHref = decodeURIComponent(uddgMatch[1]); } catch {}
            } else if (rawHref.startsWith('//')) rawHref = 'https:' + rawHref;

            if (!isSafePublicUrl(rawHref) || BLOCKED_DOMAINS.has(getDomain(rawHref))) continue;
            const title = stripHtmlToText(links[i][2] || '').slice(0, 140);
            const snippet = stripHtmlToText(snippets[i]?.[1] || '').slice(0, 380);
            if (!title) continue;

            results.push({ title, url: rawHref, domain: getDomain(rawHref), snippet });
        }
        return results;
    } catch { return []; }
}

async function searchWikipedia(query, maxResults = 2, timeoutMs = 3500) {
    try {
        const lang = /[\u0980-\u09FF]/.test(query) ? 'bn' : 'en';
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=${maxResults}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MahiruBot/1.0 (MSK)' }, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return [];
        const data = await res.json();
        return (data?.query?.search || []).map(item => ({
            title: item.title,
            url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
            domain: `${lang}.wikipedia.org`,
            snippet: stripHtmlToText(item.snippet || '').slice(0, 320)
        }));
    } catch { return []; }
}

async function searchWeb(query, maxResults = 5, deadlineMs = Date.now() + RESEARCH_BUDGET_MS) {
    const cleanQ = normalizeBn(query).trim().slice(0, 180);
    if (!cleanQ) return [];

    const cached = cacheGet(`search:${cleanQ.toLowerCase()}`);
    if (cached) return cached;

    const rem = () => Math.max(1800, Math.min(4800, deadlineMs - Date.now()));
    let hits = [];

    if (Date.now() < deadlineMs) hits = await searchTavily(cleanQ, maxResults, rem());
    if (!hits.length && Date.now() < deadlineMs) hits = await searchBrave(cleanQ, maxResults, rem());
    if (!hits.length && Date.now() < deadlineMs) hits = await searchDuckDuckGoHtml(cleanQ, maxResults, rem());
    if (!hits.length && Date.now() < deadlineMs) hits = await searchDuckDuckGoLite(cleanQ, maxResults, rem());
    if (!hits.length && Date.now() < deadlineMs) hits = await searchWikipedia(cleanQ, 2, rem());

    if (hits.length) cacheSet(`search:${cleanQ.toLowerCase()}`, hits);
    return hits;
}

// ==================================================
// ৪. CAPTCHA-সেফ ওয়েবপেজ রিডার (Jina Reader -> Direct Fallback)
// ==================================================
async function fetchPageContent(url, maxChars = 1500, timeoutMs = 4500) {
    if (!isSafePublicUrl(url) || BLOCKED_DOMAINS.has(getDomain(url))) return null;
    const cacheKey = `page:${url}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
            headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
            signal: AbortSignal.timeout(timeoutMs)
        });
        if (jinaRes.ok) {
            const cleaned = (await jinaRes.text()).replace(/\s+/g, ' ').trim();
            if (cleaned.length > 90 && !isBlockedPageText(cleaned)) {
                const out = { url, domain: getDomain(url), text: cleaned.slice(0, maxChars) };
                cacheSet(cacheKey, out);
                return out;
            }
        }
    } catch {}

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(Math.min(4000, timeoutMs))
        });
        if (!res.ok) return null;
        const cLen = Number(res.headers.get('content-length') || 0);
        if (cLen > MAX_PAGE_BYTES) return null;

        const html = (await res.text()).slice(0, MAX_PAGE_BYTES);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? stripHtmlToText(titleMatch[1]).slice(0, 120) : getDomain(url);
        const text = stripHtmlToText(html).slice(0, maxChars);
        if (text.length < 60 || isBlockedPageText(text)) return null;

        const out = { url, domain: getDomain(url), title, text };
        cacheSet(cacheKey, out);
        return out;
    } catch { return null; }
}

// ==================================================
// ৫. এক্স্যাক্ট-ভ্যারিয়েন্ট ফোন-স্পেক ভেরিফায়ার + ৩০-দিনের ডিস্ক ক্যাশ
// ==================================================
const VARIANT_MODIFIERS = ['5g', 'pro', 'plus', 'ultra', 'lite', 'max', 'neo', 'mini', 'se', 'fe', 'gt', 'go', 'air', 'power', 'play', 'prime'];

function scoreSpecHit(modelCandidate, hit) {
    const queryLower = modelCandidate.toLowerCase();
    const titleLower = `${hit.title || ''} ${hit.url || ''}`.toLowerCase();
    const qTokens = queryLower.split(/\s+/).filter(Boolean);
    const qNums = qTokens.filter(t => /^\d+[a-z]?$/.test(t));

    let score = 0;

    for (const num of qNums) {
        const numRx = new RegExp(`(?:^|[^0-9])${num}(?:$|[^0-9])`, 'i');
        if (numRx.test(hit.title || '')) score += 28;
        else score -= 90;
    }

    for (const tok of qTokens) {
        if (tok.length < 2) continue;
        if (titleLower.includes(tok)) score += 18;
        else score -= 22;
    }

    for (const mod of VARIANT_MODIFIERS) {
        const rx = new RegExp(`\\b${mod}\\b`, 'i');
        const userHas = rx.test(queryLower);
        const titleHas = rx.test(hit.title || '');
        if (userHas && titleHas) score += 26;
        else if (!userHas && titleHas) score -= 75;
        else if (userHas && !titleHas) score -= 55;
    }

    for (const num of qNums) {
        if (/^\d+$/.test(num)) {
            const suffixRx = new RegExp(`\\b${num}[a-z]\\b`, 'i');
            if (suffixRx.test(hit.title || '') && !suffixRx.test(queryLower)) score -= 75;
        }
    }

    if (!/\b5g\b/i.test(queryLower) && /\b4g\b/i.test(hit.title || '')) score += 12;
    if (TRUSTED_SPEC_DOMAINS.some(d => hit.domain.includes(d))) score += 22;

    return score;
}

function extractChipsetFromSpecText(text = '') {
    const rx = /(?:MediaTek\s+(?:Dimensity|Helio)\s+[A-Za-z0-9]+(?:\s+(?:Ultimate|Ultra|Max|Pro|Plus|Extreme|\d{3,4}))?|Qualcomm\s+Snapdragon\s+[A-Za-z0-9\s+]{2,22}|Snapdragon\s+[0-9][A-Za-z0-9\s+]{1,18}|Unisoc\s+(?:Tiger\s+)?[A-Za-z0-9]+|Spreadtrum\s+[A-Za-z0-9]+|Exynos\s+[0-9]{3,4}|Kirin\s+[0-9A-Za-z]+|Google\s+Tensor\s+[A-Za-z0-9]+)/i;
    const m = String(text || '').match(rx);
    return m ? m[0].replace(/\s+/g, ' ').trim().slice(0, 48) : '';
}

function buildVerifiedPhoneContext({ title, chip, androidVer, snippet, userText, rawSpecs }) {
    const analysis = analyzeDeviceForRoot({ userText, specText: rawSpecs });
    return (
        `\n# ওয়েব থেকে যাচাইকৃত ফোনের এক্স্যাক্ট স্পেকস (কখনোই এর বাইরে অনুমান করে প্রসেসর বানাবে না):\n` +
        `- এক্স্যাক্ট মডেল: ${title}\n` +
        `- প্রসেসর/চিপসেট: ${chip || 'নিশ্চিত নয় (অনুমান করে প্রসেসর বলবে না; About Phone স্ক্রিনশট চাও)'}\n` +
        `- অ্যান্ড্রয়েড ভার্সন: ${androidVer || 'নিশ্চিত নয় (About Phone দেখে নিশ্চিত হও)'}\n` +
        `- মূল্যায়ন: ${analysis.feasibilityNote}\n` +
        `${analysis.chipsetNote ? `- চিপসেট নোট: ${analysis.chipsetNote}\n` : ''}` +
        `- পিসি / ওটিজি রিকোয়ারমেন্ট: ${analysis.hardwareRequirement}\n` +
        `- যাচাইকৃত স্নিপেট: ${String(snippet || '').slice(0, 480)}`
    );
}

async function researchPhoneSpecsForRoot(userText = '') {
    const info = detectPhoneRootInquiry(userText);
    const model = info.modelCandidate;
    if (!model || model.length < 3) return { contextBlock: '', rawSpecs: '' };

    // ০ মিলিসেকেন্ড ভেরিফায়েড ডিস্ক ক্যাশ হিট
    const cached = getCachedPhoneSpec(model);
    if (cached) {
        console.log(`⚡ Mahiru v1.0 Phone-Spec INSTANT Cache: "${model}" -> ${cached.chip || 'Verified'}`);
        return {
            contextBlock: buildVerifiedPhoneContext({ ...cached, userText }),
            rawSpecs: cached.rawSpecs || ''
        };
    }

    const deadline = Date.now() + RESEARCH_BUDGET_MS;
    const hasExplicit5G = /\b5g\b/i.test(model);
    const queryPrimary = hasExplicit5G
        ? `"${model}" full specs chipset processor android`
        : `"${model}" 4G specs chipset processor android -5G`;

    let hits = await searchWeb(queryPrimary, 6, deadline);
    if (!hits.length && Date.now() < deadline) {
        hits = await searchWeb(`${model} specs chipset processor android`, 6, deadline);
    }

    const ranked = hits
        .map(h => ({ hit: h, score: scoreSpecHit(model, h) }))
        .sort((a, b) => b.score - a.score);

    const bestMatches = ranked.filter(x => x.score >= 24).slice(0, 3);

    if (!bestMatches.length) {
        const analysis = analyzeDeviceForRoot({ userText, specText: '' });
        console.log(`📱 Mahiru v1.0 Phone-Spec Lookup: "${model}" -> No exact verified match (Anti-Hallucination Guard ON)`);
        return {
            contextBlock:
                `\n# ফোন-স্পেক ভেরিফিকেশন নোট (অবশ্যই মানবে):\n` +
                `- ইউজারের বলা মডেল: ${model}\n` +
                `- ওয়েবে এই এক্স্যাক্ট ভ্যারিয়েন্টের স্পেকস ১০০% নিশ্চিত হওয়া যায়নি (সতর্কতা: কখনোই অনুমান করে ভুল প্রসেসর বা অ্যান্ড্রয়েড ভার্সন বলবে না!)\n` +
                `- ব্র্যান্ড মূল্যায়ন: ${analysis.feasibilityNote}\n` +
                `- হার্ডওয়্যার নোট: ${analysis.hardwareRequirement}\n` +
                `- নির্দেশনা: ইউজারের কাছ থেকে *Settings > About Phone*-এর স্ক্রিনশট বা সঠিক অ্যান্ড্রয়েড ভার্সন চেয়ে নাও।`,
            rawSpecs: ''
        };
    }

    const pageTimeout = Math.max(2000, Math.min(3500, deadline - Date.now()));
    const pages = await Promise.all(
        bestMatches.slice(0, 2).map(x => fetchPageContent(x.hit.url, 1300, pageTimeout).catch(() => null))
    );

    const cleanTexts = [];
    for (let i = 0; i < bestMatches.length; i++) {
        const h = bestMatches[i].hit;
        if (h.snippet && !isBlockedPageText(h.snippet)) cleanTexts.push(`${h.title} — ${h.snippet}`);
        if (pages[i]?.text) cleanTexts.push(pages[i].text.slice(0, 900));
    }

    const combinedRaw = cleanTexts.join('\n');
    const detectedChip = extractChipsetFromSpecText(combinedRaw);
    const analysis = analyzeDeviceForRoot({ userText, specText: combinedRaw });
    const detectedAndroid = analysis.detectedVersions.length ? analysis.detectedVersions.join(' / ') : '';

    const payload = {
        title: bestMatches[0].hit.title,
        chip: detectedChip,
        androidVer: detectedAndroid,
        snippet: combinedRaw.slice(0, 480),
        rawSpecs: combinedRaw.slice(0, 1200)
    };

    if (detectedChip || detectedAndroid) {
        setCachedPhoneSpec(model, payload);
    }

    console.log(`📱 Mahiru v1.0 Verified Phone-Spec: "${model}" -> ${payload.title} | Chip: ${detectedChip || 'Unverified'} | Android: ${detectedAndroid || 'Unverified'}`);
    return {
        contextBlock: buildVerifiedPhoneContext({ ...payload, userText }),
        rawSpecs: combinedRaw
    };
}

// ==================================================
// ৬. স্মার্ট OTG গাইড ইমেজ ফেচার (তারযুক্ত ক্যাবল + মিনি অ্যাডাপ্টার, লোকাল ক্যাশসহ)
// ==================================================
async function downloadValidImageBuffer(url) {
    if (!isSafePublicUrl(url)) return null;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MahiruShiina/1.0' },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return null;
        const mime = (res.headers.get('content-type') || '').toLowerCase();
        if (!mime.startsWith('image/')) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 4000 || buf.length > MAX_IMAGE_BYTES) return null;
        return buf;
    } catch {
        return null;
    }
}

async function searchWikimediaImage(query) {
    try {
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=640&format=json`;
        const res = await fetch(apiUrl, {
            headers: { 'User-Agent': 'MahiruShiina/1.0' },
            signal: AbortSignal.timeout(7500)
        });
        if (!res.ok) return null;
        const data = await res.json();
        const pages = Object.values(data?.query?.pages || {});
        for (const p of pages) {
            const info = p?.imageinfo?.[0];
            if (!info) continue;
            const mime = (info.mime || '').toLowerCase();
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) continue;
            const imgUrl = info.thumburl || info.url;
            const buf = await downloadValidImageBuffer(imgUrl);
            if (buf) return buf;
        }
    } catch {}
    return null;
}

async function fetchOtgGuideImages() {
    const items = [
        {
            cacheFile: path.join(MEDIA_CACHE_DIR, 'otg_cable.jpg'),
            query: 'USB OTG cable',
            caption: '🔌 *ধরন ১: তারযুক্ত OTG কেবল (Cable OTG)* — যেকোনো মোবাইল দোকানে ৫০–১০০ টাকায় পাওয়া যায়।'
        },
        {
            cacheFile: path.join(MEDIA_CACHE_DIR, 'otg_adapter.jpg'),
            query: 'USB-C OTG adapter connector',
            caption: '🔌 *ধরন ২: তারছাড়া ছোট OTG অ্যাডাপ্টার (Mini OTG)* — ৩০–৬০ টাকায় পাওয়া যায়।'
        }
    ];

    const out = [];
    for (const item of items) {
        try {
            if (fs.existsSync(item.cacheFile) && fs.statSync(item.cacheFile).size > 4000) {
                out.push({ buffer: fs.readFileSync(item.cacheFile), caption: item.caption });
                continue;
            }
            const buf = await searchWikimediaImage(item.query);
            if (buf) {
                try { fs.writeFileSync(item.cacheFile, buf); } catch {}
                out.push({ buffer: buf, caption: item.caption });
            }
        } catch {}
    }
    return out;
}

// ==================================================
// ৭. অটোনোমাস চ্যাট রিসার্চ ও ডিপ রিপোর্ট
// ==================================================
async function autoResearchForChat(userText = '') {
    try {
        if (GREETING_NO_SEARCH_RX.test(normalizeBn(userText))) return { context: '', rawSpecs: '' };
        const urls = extractUrls(userText);

        if (urls.length > 0) {
            const page = await fetchPageContent(urls[0], 1700, 5000);
            if (!page) return { context: '', rawSpecs: '' };
            console.log(`🌐 Mahiru v1.0 BrowserAgent read URL: ${page.domain}`);
            return {
                context: `\n# লাইভ ওয়েবসাইট থেকে প্রাপ্ত তথ্য (অবশ্যই সোর্স উল্লেখ করবে):\n- ওয়েবসাইট: ${page.domain} (${page.url})\n- বিষয়বস্তু: ${page.text.slice(0, 1400)}`,
                rawSpecs: ''
            };
        }

        const rootCheck = detectPhoneRootInquiry(userText);
        if (rootCheck.isPhoneLookup) {
            const { contextBlock, rawSpecs } = await researchPhoneSpecsForRoot(userText);
            return { context: contextBlock, rawSpecs };
        }

        const cleanQuery = normalizeBn(userText)
            .replace(/(মাহিরু|মাহিরু|mahiru|দয়া করে|একটু|আমাকে|বলে দাও|খুঁজে দাও|খুজে দাও|রিসার্চ করে দাও|রিসার্চ করো)/gi, '')
            .trim()
            .slice(0, 140);

        if (cleanQuery.length < 3) return { context: '', rawSpecs: '' };
        const deadline = Date.now() + RESEARCH_BUDGET_MS;
        const results = await searchWeb(cleanQuery, 4, deadline);
        if (!results.length) return { context: '', rawSpecs: '' };

        const pageTimeout = Math.max(1800, Math.min(3200, deadline - Date.now()));
        const deepPages = await Promise.all(
            results.slice(0, 2).map(r => fetchPageContent(r.url, 900, pageTimeout).catch(() => null))
        );

        const blocks = [];
        for (let idx = 0; idx < results.length; idx++) {
            const r = results[idx];
            const full = deepPages[idx]?.text;
            const body = full ? full.slice(0, 650) : (r.snippet || r.title);
            if (isBlockedPageText(body)) continue;
            blocks.push(`[${blocks.length + 1}] ওয়েবসাইট: ${r.domain}\n    শিরোনাম: ${r.title}\n    লিংক: ${r.url}\n    তথ্য: ${body}`);
            if (blocks.length >= 3) break;
        }

        if (!blocks.length) return { context: '', rawSpecs: '' };
        console.log(`🌐 Mahiru v1.0 BrowserAgent researched "${cleanQuery.slice(0, 40)}" (${blocks.length} clean sites)`);
        return {
            context: `\n# লাইভ ওয়েব রিসার্চ রেজাল্ট (শুধু এখান থেকে নির্ভুল তথ্য দেবে, বানিয়ে কিছু বলবে না):\n` + blocks.join('\n'),
            rawSpecs: ''
        };
    } catch {
        return { context: '', rawSpecs: '' };
    }
}

async function runDeepResearchReport(query = '') {
    const cleanQ = normalizeBn(query).trim();
    if (!cleanQ) return '❌ রিসার্চ করার জন্য বিষয় বা ওয়েবসাইট লিংক দাও।';

    const urls = extractUrls(cleanQ);
    let sourcesBlock = '';
    let sourceLinks = [];

    if (urls.length > 0) {
        const page = await fetchPageContent(urls[0], 2400, 6000);
        if (!page) return `❌ \`${urls[0]}\` ওয়েবসাইটটিতে বট-প্রটেকশন থাকায় এই মুহূর্তে পড়া যায়নি।`;
        sourcesBlock = `ওয়েবসাইট: ${page.domain}\nলিংক: ${page.url}\nতথ্য:\n${page.text}`;
        sourceLinks = [`• *${page.domain}* — ${page.url}`];
    } else {
        const hits = await searchWeb(cleanQ, 5, Date.now() + 8000);
        if (!hits.length) return `❌ "${cleanQ}" নিয়ে ওয়েবে এই মুহূর্তে নির্ভরযোগ্য তথ্য পাওয়া যায়নি।`;

        const pages = await Promise.all(hits.slice(0, 3).map(h => fetchPageContent(h.url, 1100, 4500).catch(() => null)));
        const validBlocks = [];
        for (let i = 0; i < hits.length; i++) {
            const h = hits[i];
            const detail = pages[i]?.text ? pages[i].text.slice(0, 800) : h.snippet;
            if (!detail || isBlockedPageText(detail)) continue;
            validBlocks.push(`[${validBlocks.length + 1}] সাইট: ${h.domain} (${h.url})\nশিরোনাম: ${h.title}\nতথ্য: ${detail}`);
            sourceLinks.push(`• *${h.domain}* — ${h.url}`);
            if (validBlocks.length >= 3) break;
        }
        if (!validBlocks.length) return `❌ "${cleanQ}"-এর সাইটগুলোতে বট-প্রটেকশন থাকায় ক্লিন তথ্য পাওয়া যায়নি।`;
        sourcesBlock = validBlocks.join('\n\n');
    }

    const prompt = `তুমি মাহিরু v1.0-এর দক্ষ বাংলা রিসার্চ অ্যানালিস্ট। নিচের লাইভ ওয়েবসাইটগুলোর তথ্য যাচাই করে হোয়াটসঅ্যাপ ফরম্যাটে (*বোল্ড*, • বুলেট, > কোট) সংক্ষিপ্ত ও নির্ভুল রিপোর্ট লেখো। কখনোই --- বা # বা ** লিখবে না।
নিয়ম:
1. মূল তথ্যগুলো পয়েন্ট আকারে সহজ বাংলায় দেবে।
2. প্রতিটি গুরুত্বপূর্ণ তথ্যের সাথে কোন ওয়েবসাইটে পাওয়া গেছে তা স্পষ্ট উল্লেখ করবে।
3. কোনো বানানো তথ্য দেবে না—শুধু প্রদত্ত সোর্স থেকেই বলবে।`;

    const { text } = await generateWithFailover(
        prompt,
        [{ role: 'user', text: `বিষয়: ${cleanQ}\n\n${sourcesBlock}` }],
        { temperature: 0.25, maxTokens: 650 }
    );

    const body = text
        ? text.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/^#+\s*/gm, '').replace(/^\s*[-*_]{3,}\s*$/gm, '──────────────').trim()
        : `> সোর্সগুলো থেকে তথ্য পাওয়া গেছে, তবে সামারি তৈরি করা যায়নি।`;

    return `🌐 *মাহিরু v1.0 • ডিপ ওয়েব রিসার্চ*\n──────────────\n${body}\n\n🔗 *যাচাইকৃত ওয়েবসাইটসমূহ:*\n${sourceLinks.join('\n')}`;
}

// ==================================================
// ৮. ২৪/৭ ওয়েব ওয়াচডগ
// ==================================================
function attachWatchdogSock(sock) {
    watchdogSock = sock;
    if (watchdogTimer) return;
    watchdogTimer = setInterval(checkWatchedSites, 20 * 60 * 1000);
    if (watchdogTimer.unref) watchdogTimer.unref();
}

async function addWatchUrl(url, label = '') {
    if (!isSafePublicUrl(url)) return { ok: false, error: '❌ সঠিক পাবলিক http/https লিংক দাও।' };
    if (watchList.length >= 10) return { ok: false, error: '⚠️ সর্বোচ্চ ১০টি ওয়েবসাইট একসাথে ওয়াচ করা যাবে।' };

    const page = await fetchPageContent(url, 1500, 5000);
    const hash = page ? crypto.createHash('md5').update(page.text.slice(0, 1200)).digest('hex') : '';

    const item = {
        id: 'W' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        url,
        domain: getDomain(url),
        label: (label || page?.title || getDomain(url)).slice(0, 60),
        lastHash: hash,
        lastCheckedAt: Date.now()
    };
    watchList.push(item);
    saveWatchList();
    return { ok: true, item };
}

function removeWatchUrl(idOrUrl = '') {
    const token = String(idOrUrl).trim().toLowerCase();
    const before = watchList.length;
    watchList = watchList.filter(w => w.id.toLowerCase() !== token && w.url.toLowerCase() !== token);
    if (watchList.length < before) { saveWatchList(); return true; }
    return false;
}

function listWatchUrls() { return watchList; }

async function checkWatchedSites() {
    if (!watchdogSock || !watchdogSock.user || !watchList.length) return;
    let changed = false;

    for (const item of watchList) {
        try {
            const page = await fetchPageContent(item.url, 1500, 5000);
            if (!page || !page.text) continue;
            const newHash = crypto.createHash('md5').update(page.text.slice(0, 1200)).digest('hex');
            item.lastCheckedAt = Date.now();

            if (item.lastHash && newHash !== item.lastHash) {
                item.lastHash = newHash;
                changed = true;
                await sendOwnerAlert(
                    watchdogSock,
                    'ওয়েবসাইট আপডেট অ্যালার্ট 🌐',
                    `📌 *নাম:* ${item.label}\n🔗 *লিংক:* ${item.url}\n📝 *নতুন অংশ:* ${page.text.slice(0, 180)}...`
                );
            } else if (!item.lastHash) {
                item.lastHash = newHash;
                changed = true;
            }
        } catch {}
    }
    if (changed) saveWatchList();
}

function getBrowserAgentStats() {
    return {
        cachedItems: researchCache.size,
        verifiedPhones: Object.keys(verifiedPhoneCache).length,
        watchedSites: watchList.length,
        tavilyReady: Boolean((process.env.TAVILY_API_KEY || '').trim()),
        braveReady: Boolean((process.env.BRAVE_API_KEY || '').trim())
    };
}

module.exports = {
    extractUrls,
    detectPhoneRootInquiry,
    researchPhoneSpecsForRoot,
    fetchOtgGuideImages,
    shouldAutoResearch,
    searchWeb,
    fetchPageContent,
    autoResearchForChat,
    runDeepResearchReport,
    attachWatchdogSock,
    addWatchUrl,
    removeWatchUrl,
    listWatchUrls,
    getBrowserAgentStats
};
