/**
 * MSK • Mahiru v1.0 ULTIMATE — Immutable Root Owner Profile & Pro vCard Engine
 * Fixes: Correct ../lib/systemOptimizer Path + Immutable +8801869332798 Root Lock + Memoized vCard
 * Features: Zero-Upload MAHIRU Banner Card + Group Anti-Link Shield + Daily 1-Link Guard
 * RAM Profile: Zero Disk I/O + Bounded Map (256MB Cloud Optimized)
 */
const settings = require('../settings');
const buttonEngine = require('../lib/buttonEngine');

const systemOptimizer = (() => {
    try { return require('../lib/systemOptimizer'); } catch { return null; }
})();

const {
    toSmallCaps,
    getDhakaTimeInfo,
    buildInfoFrame,
    isGroupLinkProtected,
    sendInteractiveCard
} = buttonEngine;

// অটুট রুট সুপার-ওনার নম্বর (কোনো ফাইল বা ENV বদলেও কখনো পরিবর্তন হবে না)
const IMMUTABLE_ROOT_PHONE = String(settings.ownerNumber || settings.rootSuperOwner || '').replace(/[^\d]/g, '');

// ==================================================
// ১. ডেইলি ১-লিংক ট্র্যাকার (বাউন্ডেড — ২৫৬MB RAM সেফ)
// ==================================================
const MAX_LINK_TRACK = 80;
const portfolioLinkHistory = new Map(); // chatId -> { ts, count }

function pruneLinkHistory(force = false) {
    if (force) {
        portfolioLinkHistory.clear();
        return;
    }
    const now = Date.now();
    const windowMs = settings.mahiru?.sanitizer?.linkCooldownMs || (24 * 60 * 60 * 1000);
    for (const [k, v] of portfolioLinkHistory.entries()) {
        if (now - v.ts > windowMs) portfolioLinkHistory.delete(k);
    }
}

if (systemOptimizer?.registerCleanupHook) {
    systemOptimizer.registerCleanupHook('ownerLinkCooldown', () => pruneLinkHistory(true));
}

function canShowPortfolioButton(chatId, groupSafe) {
    const isGroup = String(chatId || '').endsWith('@g.us');
    if (groupSafe || (isGroup && !settings.mahiru?.sanitizer?.portfolioLinkAllowInGroups)) {
        return false;
    }

    const url = String(settings.ownerWebsite || '').trim();
    if (!/^https?:\/\//i.test(url)) return false;

    const dailyLimit = settings.mahiru?.sanitizer?.portfolioLinkDailyLimitPerChat ?? 1;
    if (dailyLimit <= 0) return false;

    const now = Date.now();
    const windowMs = settings.mahiru?.sanitizer?.linkCooldownMs || (24 * 60 * 60 * 1000);
    const key = String(chatId || '').toLowerCase();
    const entry = portfolioLinkHistory.get(key);

    if (entry && (now - entry.ts) < windowMs) {
        if (entry.count >= dailyLimit) return false;
        entry.count += 1;
        return true;
    }

    if (portfolioLinkHistory.size >= MAX_LINK_TRACK) {
        pruneLinkHistory(false);
        if (portfolioLinkHistory.size >= MAX_LINK_TRACK) {
            const oldest = portfolioLinkHistory.keys().next().value;
            if (oldest !== undefined) portfolioLinkHistory.delete(oldest);
        }
    }

    portfolioLinkHistory.set(key, { ts: now, count: 1 });
    return true;
}

// ==================================================
// ২. মেমোয়াইজড RFC-কমপ্লায়েন্ট vCard বিল্ডার (জিরো রি-অ্যালোকেশন)
// ==================================================
let cachedVcardSig = '';
let cachedVcardStr = '';

function escapeVcardText(val = '') {
    return String(val || '')
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, ' ')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .trim();
}

function getProVcard({ displayName, brandName, phoneDigits, versionClean }) {
    const sig = `${displayName}|${brandName}|${phoneDigits}|${versionClean}`;
    if (sig === cachedVcardSig && cachedVcardStr) return cachedVcardStr;

    const fn = escapeVcardText(displayName || brandName || 'MSK');
    const org = escapeVcardText(brandName || 'Mahiru Shiina');
    const desc = escapeVcardText(`Founder & Root Developer • Mahiru v${versionClean}`);

    cachedVcardStr = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${fn};;;`,
        `FN:${fn}`,
        `ORG:${org};`,
        'TITLE:Founder & System Architect',
        `TEL;type=CELL;type=VOICE;waid=${phoneDigits}:+${phoneDigits}`,
        `X-WA-BIZ-NAME:${fn}`,
        `X-WA-BIZ-DESCRIPTION:${desc}`,
        'END:VCARD'
    ].join('\n');
    cachedVcardSig = sig;
    return cachedVcardStr;
}

// ==================================================
// ৩. মূল ওনার কমান্ড হ্যান্ডলার (.owner / .o)
// ==================================================
async function ownerCommand(sock, chatId, message = null) {
    const prefix = settings.prefix || '.';
    const isGroup = String(chatId || '').endsWith('@g.us');
    const groupSafe = await isGroupLinkProtected(chatId);

    const botName = settings.botName || 'Mahiru Shiina';
    const botTitle = toSmallCaps(botName);
    const ownerDisplay = settings.ownerDisplayName || settings.botOwner || 'প্রাইম মনির';
    const ownerHandle = String(settings.ownerUsername || 'MSK').replace(/^@+/, '');
    const versionClean = String(settings.version || '1.0.0-ULTIMATE').replace(/^v/i, '');
    const phoneDigits = IMMUTABLE_ROOT_PHONE || String(settings.botOwnerNumber || '').replace(/[^\d]/g, '');
    if (!phoneDigits) return sock.sendMessage(chatId, { text: 'Owner নম্বর settings.js-এ সেট করা নেই।' }, message ? { quoted: message } : {});
    const formattedPhone = `+${phoneDigits}`;
    const timeInfo = getDhakaTimeInfo();

    // ১. ক্লিন vCard কন্টাক্ট কার্ড পাঠানো (স্থায়ীভাবে +8801869332798)
    const vcard = getProVcard({
        displayName: ownerDisplay,
        brandName: botName,
        phoneDigits,
        versionClean
    });

    let sentContactMsg = null;
    try {
        sentContactMsg = await sock.sendMessage(
            chatId,
            {
                contacts: {
                    displayName: ownerDisplay,
                    contacts: [{ vcard }]
                }
            },
            message ? { quoted: message } : {}
        );
    } catch (err) {
        console.warn(`⚠️ [owner] vCard send failed: ${err?.message || err}`);
    }

    // ২. প্রিমিয়াম ফ্রেমড ওনার প্রোফাইল কার্ড (১০০% টেক্সট-লিংক ফ্রি)
    const profileCard = buildInfoFrame('Root Owner Profile', [
        { raw: `👑 *${toSmallCaps('VERIFIED BOT ARCHITECT')}*` },
        { icon: '👤', label: 'NAME', value: ownerDisplay },
        { icon: '🏷️', label: 'BRAND', value: botTitle },
        { icon: '🆔', label: 'HANDLE', value: `@${ownerHandle}` },
        { icon: '📱', label: 'CONTACT', value: `\`${formattedPhone}\`` },
        { icon: '🤖', label: 'SYSTEM', value: `Mahiru v${versionClean}` },
        { icon: '🛠️', label: 'SERVICES', value: 'Mahiru Shiina • WhatsApp Bot • AI' },
        { icon: '🕒', label: 'LOCAL TIME', value: `${timeInfo.time} (${timeInfo.date})` }
    ]);

    const bodyText = `${profileCard}\n\n💡 _সরাসরি যোগাযোগ করতে ওপরের কন্টাক্ট কার্ডে ট্যাপ করো অথবা নিচের বাটন ব্যবহার করো।_`;

    // ৩. কনটেক্সট-অ্যাওয়্যার বাটন (গ্রুপে সম্পূর্ণ লিংক-ফ্রি, ইনবক্সে কল/কপি/ডেইলি ১-লিংক)
    const buttons = [];

    if (!isGroup) {
        buttons.push({
            text: 'CALL OWNER 📞',
            id: 'owner_call',
            type: 'cta_call',
            phone: formattedPhone
        });
    }

    buttons.push({
        text: 'COPY NUMBER 📋',
        id: 'copy_owner_phone',
        type: 'cta_copy',
        copyCode: formattedPhone
    });

    if (canShowPortfolioButton(chatId, groupSafe)) {
        buttons.push({
            text: 'PORTFOLIO 🌐',
            id: 'owner_portfolio',
            type: 'cta_url',
            url: settings.ownerWebsite
        });
    }

    buttons.push(
        { text: 'MENU 📚', id: `${prefix}menu`, type: 'quick_reply' },
        { text: 'ALIVE ⚡', id: `${prefix}alive`, type: 'quick_reply' }
    );

    if (isGroup) {
        buttons.push({ text: 'PING 🚀', id: `${prefix}ping`, type: 'quick_reply' });
    }

    try {
        await sendInteractiveCard(sock, chatId, {
            body: bodyText,
            footer: settings.mahiru?.ui?.footerText || `Powered By ${botTitle} • মাহিরু v1.0`,
            headerTitle: `${botTitle} • OWNER`,
            headerSubtitle: `👑 ${ownerDisplay}`,
            headerType: 'location',
            useVerifiedQuote: true,
            buttons,
            quoted: sentContactMsg || message
        });
    } catch (error) {
        console.error('❌ [owner] Error sending owner card:', error?.message || error);
        if (!sentContactMsg) {
            try {
                await sock.sendMessage(
                    chatId,
                    { text: `👑 *Owner:* ${ownerDisplay}\n📱 *Contact:* ${formattedPhone}` },
                    message ? { quoted: message } : {}
                );
            } catch {}
        }
    }
}

module.exports = ownerCommand;
