/**
 * MSK • Mahiru v1.0 ULTIMATE — Clean Bot Owner Profile
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
// ২. মূল ওনার কমান্ড হ্যান্ডলার (.owner / .o)
// ==================================================
async function ownerCommand(sock, chatId, message = null) {
    const prefix = settings.prefix || '.';
    const isGroup = String(chatId || '').endsWith('@g.us');
    const groupSafe = await isGroupLinkProtected(chatId);

    const botName = settings.botName || 'Mahiru Shiina';
    const botTitle = toSmallCaps(botName);
    const ownerDisplay = settings.ownerDisplayName || settings.botOwner || 'MSK';
    const ownerHandle = String(settings.ownerUsername || 'MSK').replace(/^@+/, '');
    const versionClean = String(settings.version || '1.0.0-ULTIMATE').replace(/^v/i, '');
    const whatsappLink = `https://wa.me/${ownerHandle}`;
    const timeInfo = getDhakaTimeInfo();

    // ১. বট ওনার প্রোফাইল কার্ড — ফোন নম্বর প্রকাশ করা হবে না
    const profileCard = buildInfoFrame('Bot Owner', [
        { raw: `👑 *${toSmallCaps('VERIFIED BOT ARCHITECT')}*` },
        { icon: '👤', label: 'NAME', value: ownerDisplay },
        { icon: '🏷️', label: 'BRAND', value: botTitle },
        { icon: '🆔', label: 'HANDLE', value: `@${ownerHandle}` },
        { icon: '🔗', label: 'WHATSAPP', value: `wa.me/${ownerHandle}` },
        { icon: '🤖', label: 'SYSTEM', value: `Mahiru v${versionClean}` },
        { icon: '🛠️', label: 'SERVICES', value: 'Mahiru Shiina • WhatsApp Bot • AI' },
        { icon: '🕒', label: 'LOCAL TIME', value: `${timeInfo.time} (${timeInfo.date})` }
    ]);

    const bodyText = `${profileCard}\n\n💡 _ওনারের সাথে WhatsApp-এ যোগাযোগ করতে WhatsApp লিংকটি ব্যবহার করো।_`;

    // ২. যোগাযোগের বাটন — ফোন নম্বর প্রকাশ নয়
    const buttons = [
        { text: 'CALL OWNER ☎', id: 'owner_whatsapp', type: 'cta_url', url: whatsappLink },
        { text: 'MENU 📚', id: `${prefix}menu`, type: 'quick_reply' },
        { text: 'ALIVE ⚡', id: `${prefix}alive`, type: 'quick_reply' }
    ];

    if (isGroup) {
        buttons.push({ text: 'PING 🚀', id: `${prefix}ping`, type: 'quick_reply' });
    }

    try {
        await sendInteractiveCard(sock, chatId, {
            body: bodyText,
            footer: settings.mahiru?.ui?.footerText || `Powered By ${botTitle} • মাহিরু v1.0`,
            headerTitle: `${botTitle} • OWNER`,
            headerSubtitle: `👑 ${ownerDisplay}`,
            headerType: 'none',
            useVerifiedQuote: false,
            buttons,
            quoted: message
        });
    } catch (error) {
        console.error('❌ [owner] Error sending owner card:', error?.message || error);
        try {
            await sock.sendMessage(chatId, { text: `👑 *Bot Owner:* ${ownerDisplay}\n🆔 *Username:* @${ownerHandle}\n🔗 *WhatsApp:* wa.me//${ownerHandle}` }, message ? { quoted: message } : {});
        } catch {}
    }
}

module.exports = ownerCommand;
