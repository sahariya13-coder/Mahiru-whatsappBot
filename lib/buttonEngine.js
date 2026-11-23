/**
 * MSK • Mahiru v1.0 ULTIMATE — God-Tier Interactive Button, Location Banner & Live-Edit Engine
 * Pro Tricks: Auto-Optimized JPEG Thumbnail for Location Banner (Zero Green Map Pin) + Hybrid single_select
 *             + biz/v9 NativeFlow Relay + Verified Virtual Quote + In-Place Live Edit + Group Anti-Link Shield
 * RAM Profile: 256MB Cloud Safe (~30KB Cached Thumbnail, Single-Flight FFmpeg, Auto Cleanup Hook)
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const settings = require('../settings');

const execFileAsync = promisify(execFile);

const systemOptimizer = (() => {
    try { return require('./systemOptimizer'); } catch { return null; }
})();

const userGroupLib = (() => {
    try { return require('./index'); } catch { return null; }
})();

const baileys = (() => {
    for (const mod of ['@whiskeysockets/baileys', 'baileys', '@adiwajshing/baileys']) {
        try {
            const loaded = require(mod);
            if (loaded && (loaded.proto || loaded.generateWAMessageFromContent)) return loaded;
        } catch {}
    }
    return null;
})();

const proto = baileys?.proto || null;
const generateWAMessageFromContent = baileys?.generateWAMessageFromContent || null;
const prepareWAMessageMedia = baileys?.prepareWAMessageMedia || null;

// ==================================================
// ১. প্রিমিয়াম টাইপোগ্রাফি, সময় ও রানটাইম টেলিমেট্রি
// ==================================================
const SMALL_CAPS_MAP = Object.freeze({
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
});

const READ_MORE = String.fromCharCode(8206).repeat(4001);

function toSmallCaps(text = '') {
    return String(text || '').replace(/[a-zA-Z]/g, (ch) => SMALL_CAPS_MAP[ch.toLowerCase()] || ch);
}

function getDhakaTimeInfo() {
    const now = new Date();
    const tz = settings.timezone || 'Asia/Dhaka';

    const hour24 = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now)
    ) || 0;

    let greeting = 'GOOD EVENING';
    let greetingBn = 'শুভ সন্ধ্যা';
    let greetEmoji = '🌆';
    if (hour24 >= 5 && hour24 < 12) {
        greeting = 'GOOD MORNING';
        greetingBn = 'শুভ সকাল';
        greetEmoji = '🌅';
    } else if (hour24 >= 12 && hour24 < 17) {
        greeting = 'GOOD AFTERNOON';
        greetingBn = 'শুভ দুপুর';
        greetEmoji = '☀️';
    } else if (hour24 >= 17 && hour24 < 20) {
        greeting = 'GOOD EVENING';
        greetingBn = 'শুভ সন্ধ্যা';
        greetEmoji = '🌆';
    } else {
        greeting = 'GOOD NIGHT';
        greetingBn = 'শুভ রাত্রি';
        greetEmoji = '🌙';
    }

    const time = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }).format(now);

    const date = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(now);

    return { greeting, greetingBn, greetEmoji, time, date, hour24 };
}

function formatUptime(sec = process.uptime()) {
    const total = Math.max(0, Math.floor(sec));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}D`);
    if (h > 0 || d > 0) parts.push(`${h}H`);
    parts.push(`${m}M`);
    parts.push(`${s}S`);
    return parts.join(' ');
}

function getRamUsageText() {
    const rssMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const profileRaw = String(settings.ramProfile || '256mb').replace(/\D/g, '');
    const limitMb = Number(profileRaw) || 256;
    return `${rssMb} / ${limitMb} MB`;
}

// ভুয়া LINUX টেক্সট সরিয়ে প্রিমিয়াম ক্লাউড রানটাইম ব্যাজ
function getRuntimeLabel() {
    const cloud = settings.mahiru?.ui?.runtimeLabel || 'PRIME CLOUD';
    return `${toSmallCaps(cloud)} • Node ${process.version}`;
}

// ==================================================
// ২. আল্ট্রা-হালকা JPEG লোকেশন ব্যানার থাম্বনেইল ইঞ্জিন (সবুজ ম্যাপ পিন ১০০% ফিক্স)
// ==================================================
const TEMP_DIR = path.join(process.cwd(), 'temp');
const LOC_THUMB_CACHE_FILE = path.join(TEMP_DIR, 'mahiru_banner_loc_thumb.jpg');
const MAX_LOC_THUMB_BYTES = 65 * 1024; // WhatsApp locationMessage-এর জন্য আদর্শ সাইজ (<=65KB JPEG)

let rawBannerCache = { path: '', mtime: -1, buffer: null };
let locThumbCache = { srcPath: '', srcMtime: -1, buffer: null };
let thumbGenInFlight = null;

function isJpegBuffer(buf) {
    return Buffer.isBuffer(buf) && buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8;
}

function findBannerFilePath(customPath = '') {
    const assetsDir = path.join(__dirname, '../assets');
    const candidates = [
        customPath,
        settings.bannerImagePath ? path.resolve(process.cwd(), settings.bannerImagePath) : '',
        path.join(assetsDir, 'banner.png'),
        path.join(assetsDir, 'banner.jpg'),
        path.join(assetsDir, 'banner.jpeg'),
        path.join(assetsDir, 'banner.webp'),
        path.join(assetsDir, 'mahiru_logo.png'),
        path.join(assetsDir, 'mahiru_logo.jpg'),
        settings.fallbackBannerPath ? path.resolve(process.cwd(), settings.fallbackBannerPath) : '',
        path.join(assetsDir, 'bot_image.jpg'),
        path.join(assetsDir, 'bot_image.png'),
        path.join(assetsDir, 'menu.jpg')
    ].filter(Boolean);

    for (let i = 0; i < candidates.length; i++) {
        const fp = candidates[i];
        try {
            if (!fs.existsSync(fp)) continue;
            const st = fs.statSync(fp);
            if (st.isFile() && st.size > 200 && st.size <= 5 * 1024 * 1024) {
                return { path: fp, mtime: st.mtimeMs, size: st.size };
            }
        } catch {}
    }
    return null;
}

function getCachedBannerBuffer(customPath = '') {
    const found = findBannerFilePath(customPath);
    if (!found) return null;

    // ২৫৬MB RAM প্রোটেকশন: ১.২MB-এর বড় কাঁচা ছবি র‍্যামে হোল্ড না করে শুধু প্রয়োজনে পড়বে
    if (rawBannerCache.path === found.path && rawBannerCache.mtime === found.mtime && rawBannerCache.buffer) {
        return rawBannerCache.buffer;
    }

    try {
        const buf = fs.readFileSync(found.path);
        if (buf.length <= 800 * 1024) {
            rawBannerCache = { path: found.path, mtime: found.mtime, buffer: buf };
        }
        return buf;
    } catch {
        return null;
    }
}

/**
 * যেকোনো PNG/বড় JPG লোগোকে (যেমন assets/banner.png) একবার ffmpeg দিয়ে ~25-40KB ক্রিস্প JPEG থাম্বনেইলে
 * রূপান্তর করে ক্যাশ করে—যাতে locationMessage হেডারে খালি সবুজ ম্যাপ পিনের বদলে আসল MAHIRU ব্যানার দেখায়।
 */
async function getLocationThumbnailBuffer(customPath = '') {
    const found = findBannerFilePath(customPath);
    if (!found) return null;

    if (locThumbCache.srcPath === found.path && locThumbCache.srcMtime === found.mtime && locThumbCache.buffer) {
        return locThumbCache.buffer;
    }

    // সোর্স ফাইলটি আগে থেকেই ছোট JPEG হলে সরাসরি ক্যাশ করো (জিরো CPU)
    if (found.size <= MAX_LOC_THUMB_BYTES) {
        try {
            const direct = fs.readFileSync(found.path);
            if (isJpegBuffer(direct)) {
                locThumbCache = { srcPath: found.path, srcMtime: found.mtime, buffer: direct };
                return direct;
            }
        } catch {}
    }

    // ডিস্কে আগে থেকেই তৈরি থাম্বনেইল আপ-টু-ডেট থাকলে সরাসরি লোড করো
    try {
        if (fs.existsSync(LOC_THUMB_CACHE_FILE)) {
            const tst = fs.statSync(LOC_THUMB_CACHE_FILE);
            if (tst.mtimeMs >= found.mtime && tst.size > 500 && tst.size <= MAX_LOC_THUMB_BYTES) {
                const cachedDisk = fs.readFileSync(LOC_THUMB_CACHE_FILE);
                if (isJpegBuffer(cachedDisk)) {
                    locThumbCache = { srcPath: found.path, srcMtime: found.mtime, buffer: cachedDisk };
                    return cachedDisk;
                }
            }
        }
    } catch {}

    // সিঙ্গেল-ফ্লাইট FFmpeg থাম্বনেইল জেনারেটর (একই সময়ে ডাবল FFmpeg রান প্রতিরোধ)
    if (thumbGenInFlight) return thumbGenInFlight;

    thumbGenInFlight = (async () => {
        try {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
            const tmpOut = `${LOC_THUMB_CACHE_FILE}.${process.pid}.tmp.jpg`;
            await execFileAsync('ffmpeg', [
                '-y', '-threads', '1',
                '-i', found.path,
                '-vf', "scale='min(480,iw)':-2",
                '-q:v', '6',
                '-frames:v', '1',
                tmpOut
            ], { timeout: 10000, maxBuffer: 512 * 1024 });

            if (fs.existsSync(tmpOut)) {
                const thumbBuf = fs.readFileSync(tmpOut);
                if (isJpegBuffer(thumbBuf) && thumbBuf.length <= 120 * 1024) {
                    try { fs.renameSync(tmpOut, LOC_THUMB_CACHE_FILE); } catch {}
                    locThumbCache = { srcPath: found.path, srcMtime: found.mtime, buffer: thumbBuf };
                    return thumbBuf;
                }
                try { fs.unlinkSync(tmpOut); } catch {}
            }
        } catch {}
        return null;
    })().finally(() => {
        thumbGenInFlight = null;
    });

    return thumbGenInFlight;
}

function clearButtonEngineCache() {
    rawBannerCache = { path: '', mtime: -1, buffer: null };
    locThumbCache = { srcPath: '', srcMtime: -1, buffer: null };
}

if (systemOptimizer?.registerCleanupHook) {
    systemOptimizer.registerCleanupHook('buttonEngineCache', clearButtonEngineCache);
}

// ==================================================
// ৩. ফ্রেমড বক্স, ভেরিফায়েড ভার্চুয়াল কোট ও ক্যাটাগরি বিল্ডার
// ==================================================
function buildVerifiedQuote(label = '') {
    const title = label || `${settings.botName || 'Mahiru Shiina'} • মাহিরু v1.0`;
    return {
        key: {
            fromMe: false,
            participant: '0@s.whatsapp.net',
            remoteJid: 'status@broadcast'
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${title};;;\nFN:${title}\nitem1.TEL;waid=${settings.ownerNumber || ''}:+${settings.ownerNumber || ''}\nitem1.X-ABLabel:Verified\nEND:VCARD`
            }
        }
    };
}

function buildInfoFrame(title = 'Info', rows = []) {
    const lines = [`╭───「 ✦ *${title}* ✦ 」───╮`];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        if (r.raw) {
            lines.push(`│ ${r.raw}`);
        } else {
            const label = toSmallCaps(r.label || '');
            const icon = r.icon ? `${r.icon} ` : '';
            lines.push(`│ ${icon}*${label}* : ${r.value}`);
        }
    }
    lines.push('╰────────────────────╯');
    return lines.join('\n');
}

function buildCommandSection(categoryTitle, commands = [], startIndex = 1, prefix = '.') {
    const p = prefix || settings.prefix || '.';
    const lines = [`╭━━━━〔 *${categoryTitle}* 〕━━━••○`];

    for (let i = 0; i < commands.length; i++) {
        const num = String(startIndex + i).padStart(2, '0');
        const item = commands[i];
        if (!item) continue;
        if (typeof item === 'object' && item.cmd) {
            const cmdRaw = String(item.cmd).replace(/^\.+/, '');
            const desc = item.desc ? ` — _${item.desc}_` : '';
            lines.push(`│❖│ \`${num}.\` *${p}${cmdRaw}*${desc}`);
        } else {
            const cmdRaw = String(item).replace(/^\.+/, '');
            lines.push(`│❖│ \`${num}.\` *${p}${toSmallCaps(cmdRaw)}*`);
        }
    }

    lines.push('│❖╰━━━━━━━━━━━━━━━━○');
    lines.push('╰━━━━━━━━━━━━━━━━••○');
    return {
        text: lines.join('\n'),
        nextIndex: startIndex + commands.length
    };
}

// ==================================================
// ৪. গ্রুপ অ্যান্টি-লিংক শিল্ড চেকার
// ==================================================
async function isGroupLinkProtected(chatId = '') {
    const isGroup = String(chatId || '').endsWith('@g.us');
    if (!isGroup) return false;

    if (typeof userGroupLib?.isGroupSafeMode === 'function') {
        try {
            return await userGroupLib.isGroupSafeMode(chatId);
        } catch {}
    }
    return settings.mahiru?.ui?.groupAntiLinkShield !== false;
}

// ==================================================
// ৫. বাটন পেলোড কনভার্টার (single_select + quick_reply + cta_copy/call/url)
// ==================================================
function buildNativeFlowButtons(buttons = [], { groupSafe = false } = {}) {
    const out = [];
    for (let i = 0; i < buttons.length && out.length < 6; i++) {
        const b = buttons[i];
        if (!b || !b.text) continue;

        const type = (b.type || 'quick_reply').toLowerCase();

        if (type === 'cta_url') {
            if (groupSafe || !b.url) continue;
            out.push({
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: String(b.text),
                    url: String(b.url),
                    merchant_url: String(b.url)
                })
            });
            continue;
        }

        if (type === 'cta_copy') {
            out.push({
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: String(b.text),
                    id: String(b.id || b.copyCode || ''),
                    copy_code: String(b.copyCode || b.id || '')
                })
            });
            continue;
        }

        if (type === 'cta_call' && b.phone) {
            out.push({
                name: 'cta_call',
                buttonParamsJson: JSON.stringify({
                    display_text: String(b.text),
                    id: String(b.id || 'call'),
                    phone_number: String(b.phone)
                })
            });
            continue;
        }

        if (type === 'single_select' && Array.isArray(b.sections) && b.sections.length) {
            out.push({
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                    title: String(b.text),
                    sections: b.sections
                })
            });
            continue;
        }

        out.push({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: String(b.text),
                id: String(b.id || b.text)
            })
        });
    }
    return out;
}

// ==================================================
// ৬. প্রিমিয়াম ইন্টারঅ্যাক্টিভ কার্ড সেন্ডার (জিরো সবুজ ম্যাপ পিন + হাইব্রিড রিলে)
// ==================================================
async function sendInteractiveCard(sock, chatId, options = {}) {
    const {
        body = '',
        footer = settings.mahiru?.ui?.footerText || 'Powered By MSK • মাহিরু v1.0',
        headerTitle = `${toSmallCaps(settings.botName || 'Mahiru Shiina')} • মাহিরু v1.0`,
        headerSubtitle = `👑 ${settings.ownerDisplayName || settings.botOwner || 'MSK'}`,
        headerType = 'none',
        imageBuffer = null,
        bannerPath = '',
        buttons = [],
        quoted = null,
        useVerifiedQuote = false,
        mentions = []
    } = options;

    const safeHeaderType = headerType === 'location' ? 'none' : headerType;
    const groupSafe = await isGroupLinkProtected(chatId);
    const interactiveEnabled = settings.mahiru?.ui?.enableInteractiveButtons !== false;
    const nativeButtons = buildNativeFlowButtons(buttons, { groupSafe });

    // Location headers are intentionally disabled so no fake map/location preview can appear.
    const fullImgBuf = imageBuffer || (safeHeaderType === 'image' ? getCachedBannerBuffer(bannerPath) : null);
    const effectiveQuote = quoted || (useVerifiedQuote && settings.mahiru?.ui?.useVerifiedQuote ? buildVerifiedQuote() : undefined);

    // ১. প্রিমিয়াম nativeFlowMessage + biz/v9 রিলে
    if (interactiveEnabled && nativeButtons.length > 0 && proto && generateWAMessageFromContent && typeof sock?.relayMessage === 'function') {
        try {
            let headerObj = {
                title: headerTitle,
                subtitle: headerSubtitle,
                hasMediaAttachment: false
            };

            if (safeHeaderType === 'image' && fullImgBuf && typeof prepareWAMessageMedia === 'function') {
                // থাম্বনেইল না মিললে সবুজ ম্যাপ পিন না দেখিয়ে সরাসরি ইমেজ হেডার পাঠাবে
                const media = await prepareWAMessageMedia(
                    { image: fullImgBuf },
                    { upload: sock.waUploadToServer }
                );
                headerObj = {
                    title: headerTitle,
                    subtitle: headerSubtitle,
                    hasMediaAttachment: true,
                    imageMessage: media.imageMessage
                };
            }

            const contextInfo = {};
            if (Array.isArray(mentions) && mentions.length) {
                contextInfo.mentionedJid = mentions;
            }
            if (settings.mahiru?.ui?.showViewChannelButton && settings.ownerChannelJid) {
                contextInfo.forwardingScore = 1;
                contextInfo.isForwarded = true;
                contextInfo.forwardedNewsletterMessageInfo = {
                    newsletterJid: settings.ownerChannelJid,
                    newsletterName: settings.ownerChannelName || 'Mahiru Shiina',
                    serverMessageId: 1
                };
            }

            const interactiveMsg = proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create(headerObj),
                body: proto.Message.InteractiveMessage.Body.create({ text: String(body || '') }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer || '') }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: nativeButtons
                }),
                ...(Object.keys(contextInfo).length ? { contextInfo } : {})
            });

            const waMessage = generateWAMessageFromContent(
                chatId,
                {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            interactiveMessage: interactiveMsg
                        }
                    }
                },
                {
                    userJid: sock?.user?.id,
                    quoted: effectiveQuote
                }
            );

            const additionalNodes = [
                {
                    tag: 'biz',
                    attrs: {},
                    content: [
                        {
                            tag: 'interactive',
                            attrs: { type: 'native_flow', v: '1' },
                            content: [
                                {
                                    tag: 'native_flow',
                                    attrs: { v: '9', name: 'mixed' }
                                }
                            ]
                        }
                    ]
                }
            ];

            await sock.relayMessage(chatId, waMessage.message, {
                messageId: waMessage.key.id,
                additionalNodes
            });

            return { ok: true, mode: 'interactive', key: waMessage.key };
        } catch (err) {
            console.warn(`⚠️ [ButtonEngine] Interactive relay fallback: ${err?.message || err}`);
        }
    }

    // ২. নিরাপদ ফলব্যাক
    const fallbackFooter = footer ? `\n\n_${footer}_` : '';
    const quickHints = buttons
        .filter((b) => b?.id && String(b.id).startsWith(settings.prefix || '.'))
        .map((b) => `\`${b.id}\``)
        .join(' • ');
    const hintLine = quickHints ? `\n\n💡 *কুইক কমান্ড:* ${quickHints}` : '';
    const fullText = `${body}${hintLine}${fallbackFooter}`.trim();

    if (fullImgBuf) {
        try {
            const sent = await sock.sendMessage(
                chatId,
                { image: fullImgBuf, caption: fullText, ...(mentions.length ? { mentions } : {}) },
                effectiveQuote ? { quoted: effectiveQuote } : {}
            );
            return { ok: true, mode: 'image_fallback', key: sent?.key };
        } catch {}
    }

    const sent = await sock.sendMessage(
        chatId,
        { text: fullText, ...(mentions.length ? { mentions } : {}) },
        effectiveQuote ? { quoted: effectiveQuote } : {}
    );
    return { ok: true, mode: 'text_fallback', key: sent?.key };
}

// ==================================================
// ৭. ইন-প্লেস লাইভ মেসেজ এডিট হেল্পার (জিরো ডাবল মেসেজ স্প্যাম)
// ==================================================
async function sendLiveEditableMessage(sock, chatId, initialText, quoted = null) {
    const sent = await sock.sendMessage(
        chatId,
        { text: String(initialText || '⏳ প্রসেস হচ্ছে...') },
        quoted ? { quoted } : {}
    );
    return {
        key: sent?.key || null,
        async update(newText) {
            if (!sent?.key || settings.mahiru?.ui?.enableLiveEdit === false) {
                return sock.sendMessage(chatId, { text: String(newText || '') }, quoted ? { quoted } : {});
            }
            try {
                return await sock.sendMessage(chatId, { text: String(newText || ''), edit: sent.key });
            } catch {
                return sock.sendMessage(chatId, { text: String(newText || '') }, quoted ? { quoted } : {});
            }
        }
    };
}

// ==================================================
// ৮. বাটন ও পপআপ লিস্ট ক্লিক ডিকোডার (main.js ও help.js ব্রিজ)
// ==================================================
function extractInteractiveCommand(message) {
    const clean = value => typeof value === 'string' ? value.trim() : '';

    const findId = (value, depth = 0) => {
        if (!value || typeof value !== 'object' || depth > 4) return '';
        const directKeys = [
            'id', 'selected_id', 'selectedId', 'selected_button_id', 'selectedButtonId',
            'selected_row_id', 'selectedRowId', 'row_id', 'rowId',
            'button_id', 'buttonId', 'command', 'cmd'
        ];
        for (const key of directKeys) {
            const candidate = clean(value[key]);
            if (candidate) return candidate;
        }

        // Some WhatsApp clients wrap the selected row/button payload one level deeper.
        const nestedKeys = ['params', 'payload', 'data', 'selected', 'button', 'row'];
        for (const key of nestedKeys) {
            const candidate = findId(value[key], depth + 1);
            if (candidate) return candidate;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const candidate = findId(item, depth + 1);
                if (candidate) return candidate;
            }
        }
        return '';
    };

    try {
        let m = message?.message || message || {};
        // WhatsApp may wrap interactive replies in more than one envelope.
        for (let depth = 0; depth < 8; depth++) {
            const nested =
                m.ephemeralMessage?.message ||
                m.viewOnceMessage?.message ||
                m.viewOnceMessageV2?.message ||
                m.viewOnceMessageV2Extension?.message ||
                m.deviceSentMessage?.message ||
                m.documentWithCaptionMessage?.message;
            if (!nested) break;
            m = nested;
        }

        const response = m.interactiveResponseMessage;
        const nativeFlow = response?.nativeFlowResponseMessage;
        if (nativeFlow?.paramsJson) {
            try {
                const parsed = typeof nativeFlow.paramsJson === 'string'
                    ? JSON.parse(nativeFlow.paramsJson)
                    : nativeFlow.paramsJson;
                const id = findId(parsed);
                if (id) return id;
            } catch {}
        }

        const candidates = [
            m.templateButtonReplyMessage?.selectedId,
            m.buttonsResponseMessage?.selectedButtonId,
            m.listResponseMessage?.singleSelectReply?.selectedRowId,
            response?.body?.text,
            nativeFlow?.name
        ];
        for (const candidate of candidates) {
            const id = clean(candidate);
            if (id && id.startsWith('.')) return id;
        }
    } catch (error) {
        console.warn('[ButtonEngine] Could not decode interactive reply:', error?.message || error);
    }
    return '';
}

module.exports = {
    READ_MORE,
    toSmallCaps,
    getDhakaTimeInfo,
    formatUptime,
    getRamUsageText,
    getRuntimeLabel,
    getCachedBannerBuffer,
    getLocationThumbnailBuffer,
    clearButtonEngineCache,
    buildVerifiedQuote,
    buildInfoFrame,
    buildCommandSection,
    isGroupLinkProtected,
    sendInteractiveCard,
    sendLiveEditableMessage,
    extractInteractiveCommand
};
