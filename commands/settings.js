/**
 * PRIME MONIR • Maya v3.0 ULTRA — Interactive Master Control & Settings Dashboard
 * Features: Zero-Spam mtime Config Cache + Accurate Bool/Object Resolver + Live Reload + Group Safe Shield
 * Security: Strict Owner Verification + Silent Unauthorized Alert | RAM: 256MB Cloud Optimized
 */
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const buttonEngine = require('../lib/buttonEngine');
const userGroupLib = require('../lib/index');
const isOwnerOrSudo = require('../lib/isOwner');

const systemOptimizer = (() => {
    try { return require('../lib/systemOptimizer'); } catch { return null; }
})();

const {
    toSmallCaps,
    getDhakaTimeInfo,
    getRamUsageText,
    buildInfoFrame,
    sendInteractiveCard
} = buttonEngine;

const {
    isStrictOwner,
    reportUnauthorizedAttempt,
    getOwnerSecurityDiagnostics,
    invalidateOwnerIdentityCache
} = isOwnerOrSudo;

const DATA_DIR = path.join(__dirname, '../data');
const STAT_THROTTLE_MS = 3000;

// ==================================================
// ১. ২৫৬MB RAM-সেফ লাইটওয়েট JSON ক্যাশ (জিরো রিডান্ড্যান্ট ডিস্ক I/O)
// ==================================================
const jsonFileCache = new Map(); // fileName -> { mtime, lastStatAt, data }

function readJsonCached(fileName, fallback) {
    const filePath = path.join(DATA_DIR, fileName);
    const now = Date.now();
    const cached = jsonFileCache.get(fileName);

    if (cached && (now - cached.lastStatAt) < STAT_THROTTLE_MS) {
        return cached.data;
    }

    try {
        const st = fs.statSync(filePath);
        if (cached && cached.mtime === st.mtimeMs) {
            cached.lastStatAt = now;
            return cached.data;
        }
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const data = (parsed && typeof parsed === 'object') ? parsed : fallback;
        jsonFileCache.set(fileName, { mtime: st.mtimeMs, lastStatAt: now, data });
        return data;
    } catch {
        jsonFileCache.set(fileName, { mtime: -1, lastStatAt: now, data: fallback });
        return fallback;
    }
}

function clearSettingsFileCache() {
    jsonFileCache.clear();
}

if (systemOptimizer?.registerCleanupHook) {
    systemOptimizer.registerCleanupHook('settingsDashboardCache', clearSettingsFileCache);
}

// ==================================================
// ২. নির্ভুল বুলিয়ান/অবজেক্ট স্ট্যাটাস পার্সার ও হেল্পার
// ==================================================
function isFeatureEnabled(entry) {
    if (typeof entry === 'boolean') return entry;
    if (entry && typeof entry === 'object') return entry.enabled === true;
    return false;
}

function badge(on, extra = '') {
    const base = on ? '🟢 ON' : '⚪ OFF';
    return extra ? `${base} (${extra})` : base;
}

function getRawArgs(message) {
    let m = message?.message || {};
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    const raw = String(
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        ''
    ).trim();
    return raw.split(/\s+/).slice(1).map((s) => s.toLowerCase());
}

function getAiSummary() {
    try {
        if (typeof settings.getAIKeys === 'function') {
            const k = settings.getAIKeys();
            return `G:${k.geminiKeys?.length || 0} • Q:${k.groqKeys?.length || 0} • OR:${k.openrouterKeys?.length || 0}`;
        }
    } catch {}
    return 'Active';
}

// ==================================================
// ৩. মূল সেটিংস কমান্ড হ্যান্ডলার
// ==================================================
async function settingsCommand(sock, chatId, message) {
    const prefix = settings.prefix || '.';
    const senderId = message?.key?.participant || message?.key?.remoteJid || '';
    const args = getRawArgs(message);
    const sub = args[0] || '';

    try {
        // ১. কঠোর ওনার যাচাই (৪র্থ প্যারামিটার message-সহ সঠিক LID/PN রেজলভ)
        let allowed = Boolean(message?.key?.fromMe);
        if (!allowed) {
            if (typeof isStrictOwner === 'function') {
                allowed = await isStrictOwner(senderId, sock, chatId, message);
            }
            if (!allowed && !settings.maya?.security?.strictOwnerOnly) {
                allowed = await isOwnerOrSudo(senderId, sock, chatId, message);
            }
        }

        if (!allowed) {
            if (typeof reportUnauthorizedAttempt === 'function') {
                reportUnauthorizedAttempt(sock, {
                    senderId,
                    chatId,
                    command: `${prefix}settings ${args.join(' ')}`.trim(),
                    pushName: message?.pushName || '',
                    reason: 'Owner-Only Settings Dashboard'
                }).catch(() => {});
            }
            await sock.sendMessage(
                chatId,
                { text: '🔒 *অ্যাক্সেস ডিনাইড:* `.settings` শুধুমাত্র বট ওনারের জন্য সংরক্ষিত।' },
                { quoted: message }
            );
            return;
        }

        // ২. বোনাস সাব-কমান্ড: .settings reload (রিস্টার্ট ছাড়াই ক্যাশ ও ENV রিফ্রেশ)
        if (sub === 'reload' || sub === 'refresh') {
            clearSettingsFileCache();
            if (typeof settings.reloadEnv === 'function') settings.reloadEnv();
            if (typeof userGroupLib.invalidateUserGroupCache === 'function') userGroupLib.invalidateUserGroupCache();
            if (typeof invalidateOwnerIdentityCache === 'function') invalidateOwnerIdentityCache();

            await sock.sendMessage(
                chatId,
                {
                    text: [
                        '♻️ *সিস্টেম কনফিগারেশন রিফ্রেশ সম্পন্ন!*',
                        `• *AI Keys:* ${getAiSummary()}`,
                        `• *RAM:* ${getRamUsageText()}`
                    ].join('\n')
                },
                { quoted: message }
            );
            return;
        }

        // ৩. বোনাস সাব-কমান্ড: .settings safe on|off (গ্রুপ অ্যান্টি-লিংক শিল্ড টগল)
        const isGroup = String(chatId || '').endsWith('@g.us');
        if (sub === 'safe' || sub === 'shield') {
            if (!isGroup) {
                await sock.sendMessage(
                    chatId,
                    { text: 'ℹ️ এই অপশনটি কোনো গ্রুপের ভেতরে ব্যবহার করো: `.settings safe on` অথবা `.settings safe off`' },
                    { quoted: message }
                );
                return;
            }
            const toggle = args[1] || '';
            if (toggle !== 'on' && toggle !== 'off') {
                const cur = typeof userGroupLib.isGroupSafeMode === 'function'
                    ? await userGroupLib.isGroupSafeMode(chatId)
                    : true;
                await sock.sendMessage(
                    chatId,
                    { text: `🛡️ *Group Anti-Link Shield:* ${badge(cur)}\nব্যবহার: \`${prefix}settings safe on\` / \`${prefix}settings safe off\`` },
                    { quoted: message }
                );
                return;
            }
            const nextState = toggle === 'on';
            if (typeof userGroupLib.setGroupSafeMode === 'function') {
                await userGroupLib.setGroupSafeMode(chatId, nextState);
            }
            await sock.sendMessage(
                chatId,
                {
                    text: nextState
                        ? '🛡️ *Group Anti-Link Shield চালু হয়েছে:* এই গ্রুপে বটের মেনু/রিপ্লাই ১০০% লিংক-ফ্রি থাকবে।'
                        : '⚠️ *Group Anti-Link Shield বন্ধ করা হয়েছে:* এই গ্রুপে সাধারণ লিংক কার্ড অনুমোদিত।'
                },
                { quoted: message }
            );
            return;
        }

        // ৪. ক্যাশড ডেটা সংগ্রহ (জিরো ডিস্ক স্প্যাম)
        const modeCfg = readJsonCached('messageCount.json', { isPublic: settings.commandMode !== 'private' });
        const autoStatus = readJsonCached('autoStatus.json', { enabled: false });
        const autoread = readJsonCached('autoread.json', { enabled: false });
        const autotyping = readJsonCached('autotyping.json', { enabled: false });
        const pmblocker = readJsonCached('pmblocker.json', { enabled: false });
        const anticall = readJsonCached('anticall.json', { enabled: false });
        const antidelete = readJsonCached('antidelete.json', { enabled: false });
        const antibot = readJsonCached('antibot.json', {});

        // userGroupData সরাসরি lib/index.js-এর mtime ক্যাশ থেকে নেওয়া হচ্ছে
        const userGroupData = typeof userGroupLib.loadUserGroupData === 'function'
            ? userGroupLib.loadUserGroupData()
            : readJsonCached('userGroupData.json', {
                antilink: {}, antibadword: {}, welcome: {}, goodbye: {}, chatbot: {}, chatbotLocks: {}, antitag: {}
            });

        const autoReaction = Boolean(userGroupData.autoReaction);
        const humanPersona = userGroupData.humanPersona !== false;
        const isPublicMode = modeCfg.isPublic !== undefined
            ? Boolean(modeCfg.isPublic)
            : String(settings.commandMode || 'public').toLowerCase() !== 'private';

        const secDiag = typeof getOwnerSecurityDiagnostics === 'function'
            ? getOwnerSecurityDiagnostics()
            : null;
        const sudoCount = Array.isArray(userGroupData.sudo) ? userGroupData.sudo.length : 0;
        const timeInfo = getDhakaTimeInfo();
        const botTitle = toSmallCaps(settings.botName || 'Mahiru Shiina');

        // ৫. গ্লোবাল অটোমেশন ও সিকিউরিটি কার্ড
        const globalFrame = buildInfoFrame('Bot Control Panel', [
            { icon: '🔓', label: 'MODE', value: isPublicMode ? '🟢 PUBLIC' : '🔒 PRIVATE' },
            { icon: '👁️', label: 'AUTO STATUS', value: badge(isFeatureEnabled(autoStatus)) },
            { icon: '☑️', label: 'AUTO READ', value: badge(isFeatureEnabled(autoread)) },
            { icon: '⌨️', label: 'AUTO TYPING', value: badge(isFeatureEnabled(autotyping)) },
            { icon: '🎭', label: 'AUTO REACT', value: badge(autoReaction) },
            { icon: '📵', label: 'ANTI CALL', value: badge(isFeatureEnabled(anticall)) },
            { icon: '🚫', label: 'PM BLOCKER', value: badge(isFeatureEnabled(pmblocker)) },
            { icon: '♻️', label: 'ANTI DELETE', value: badge(isFeatureEnabled(antidelete)) },
            { icon: '🧠', label: 'HUMAN PERSONA', value: badge(humanPersona) }
        ]);

        const runtimeFrame = buildInfoFrame('Security & Engine', [
            { icon: '🛡️', label: 'CHATBOT LOCK', value: settings.maya?.security?.strictOwnerChatbotLock !== false ? '🔒 OWNER LOCKED' : '⚪ OFF' },
            { icon: '👑', label: 'SUDO / BLOCKED', value: `Sudo: ${sudoCount} • Blocked: ${secDiag?.hardBlockedCount ?? 1}` },
            { icon: '🤖', label: 'AI CORES', value: getAiSummary() },
            { icon: '🎙️', label: 'VOICE ENGINE', value: `${settings.maya?.voice?.defaultGlobalMode || 'auto'} • Studio v3` },
            { icon: '🔗', label: 'LINK LIMIT', value: `${settings.maya?.sanitizer?.portfolioLinkDailyLimitPerChat ?? 1}/day per chat` },
            { icon: '🐏', label: 'RAM USAGE', value: getRamUsageText() },
            { icon: '🕒', label: 'TIME', value: `${timeInfo.time} (${timeInfo.date})` }
        ]);

        const blocks = [globalFrame, runtimeFrame];

        // ৬. পার-গ্রুপ সেটিংস কার্ড (সঠিক অবজেক্ট ও লক চেকসহ)
        if (isGroup) {
            const alCfg = userGroupData.antilink?.[chatId];
            const alOn = isFeatureEnabled(alCfg);

            const abCfg = userGroupData.antibadword?.[chatId];
            const abOn = isFeatureEnabled(abCfg);

            const atCfg = userGroupData.antitag?.[chatId];
            const atOn = isFeatureEnabled(atCfg);

            const antibotEntry = antibot?.[chatId] !== undefined ? antibot[chatId] : antibot;
            const antibotOn = isFeatureEnabled(antibotEntry);

            const welcomeOn = isFeatureEnabled(userGroupData.welcome?.[chatId]);
            const goodbyeOn = isFeatureEnabled(userGroupData.goodbye?.[chatId]);

            const rawCb = userGroupData.chatbot?.[chatId];
            const cbLocked = Boolean(
                userGroupData.chatbotLocks?.[chatId]?.locked ||
                (rawCb && typeof rawCb === 'object' && rawCb.ownerLocked)
            );
            const cbOn = !cbLocked && isFeatureEnabled(rawCb);
            const cbText = cbLocked ? '🔒 OFF (Owner Locked)' : badge(cbOn);

            const safeModeOn = typeof userGroupLib.isGroupSafeMode === 'function'
                ? await userGroupLib.isGroupSafeMode(chatId)
                : (settings.maya?.ui?.groupAntiLinkShield !== false);

            const groupFrame = buildInfoFrame('Group Settings', [
                { icon: '🤖', label: 'CHATBOT', value: cbText },
                { icon: '🛡️', label: 'LINK SHIELD', value: badge(safeModeOn, 'Safe UI') },
                { icon: '🔗', label: 'ANTILINK', value: badge(alOn, alOn ? (alCfg?.action || 'delete') : '') },
                { icon: '🤬', label: 'ANTIBADWORD', value: badge(abOn, abOn ? (abCfg?.action || 'delete') : '') },
                { icon: '🏷️', label: 'ANTITAG', value: badge(atOn, atOn ? (atCfg?.action || 'delete') : '') },
                { icon: '🚧', label: 'ANTIBOT', value: badge(antibotOn) },
                { icon: '🎉', label: 'WELCOME', value: badge(welcomeOn) },
                { icon: '👋', label: 'GOODBYE', value: badge(goodbyeOn) }
            ]);

            blocks.push(groupFrame);
            blocks.push(`💡 টিপস: \`${prefix}settings safe on/off\` • \`${prefix}settings reload\``);
        } else {
            blocks.push(`💡 টিপস: গ্রুপের সেটিংস দেখতে গ্রুপের ভেতরে \`${prefix}settings\` লেখো। রিফ্রেশ করতে: \`${prefix}settings reload\``);
        }

        const bodyText = blocks.join('\n\n');

        const buttons = [
            { text: 'SUDO AUDIT 🛡️', id: `${prefix}sudo status`, type: 'quick_reply' },
            { text: 'ALIVE ⚡', id: `${prefix}alive`, type: 'quick_reply' },
            { text: 'PING ⚟', id: `${prefix}ping`, type: 'quick_reply' },
            { text: 'MENU 📚', id: `${prefix}menu`, type: 'quick_reply' }
        ];

        await sendInteractiveCard(sock, chatId, {
            body: bodyText,
            footer: settings.maya?.ui?.footerText || `Powered By ${botTitle} • Mahiru v${settings.version || '3.0.8'}`,
            headerTitle: `${botTitle} • SETTINGS`,
            headerSubtitle: `⚙️ ${toSmallCaps(isGroup ? 'GROUP & GLOBAL PANEL' : 'GLOBAL CONTROL PANEL')}`,
            headerType: 'location',
            buttons,
            quoted: message
        });
    } catch (error) {
        console.error('❌ [settings] Error in settings command:', error?.message || error);
        try {
            await sock.sendMessage(
                chatId,
                { text: '❌ সেটিংস লোড করতে সমস্যা হয়েছে। একটু পর আবার চেষ্টা করো।' },
                { quoted: message }
            );
        } catch {}
    }
}

module.exports = settingsCommand;
