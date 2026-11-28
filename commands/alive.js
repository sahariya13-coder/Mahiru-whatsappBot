/**
 * Mahiru Shiina • Mahiru v1.0 ULTIMATE — Live System Status, AI Cores & Health Card (.alive / .a)
 * Fixes: Removed Raw LINUX Leak (Now PRIME CLOUD) + Real Event-Loop Lag + Removed Unused os Import
 * Features: Zero-Upload MAHIRU Banner + Dual-Gemini/Backup AI Status + Quick Action Buttons
 * RAM Profile: Zero Disk I/O (256MB Cloud Optimized) | 100% Group Anti-Link Shield Safe
 */
const settings = require('../settings');
const buttonEngine = require('../lib/buttonEngine');
const { getResourceSnapshot } = require('../lib/hostingResources');

const {
    toSmallCaps,
    getDhakaTimeInfo,
    formatUptime,
    getRamUsageText,
    getRuntimeLabel,
    buildInfoFrame,
    sendInteractiveCard
} = buttonEngine;

function measureRealLoopLagMs() {
    return new Promise((resolve) => {
        const startNs = process.hrtime.bigint();
        setImmediate(() => {
            const diffMs = Number(process.hrtime.bigint() - startNs) / 1e6;
            resolve(Number(diffMs.toFixed(2)));
        });
    });
}

function getRamHealthBadge() {
    const mem = process.memoryUsage();
    const resources = getResourceSnapshot();
    const rssMb = resources.ram.usedBytes / 1024 / 1024;
    const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const limitMb = Number.isFinite(resources.memoryLimitBytes) && resources.memoryLimitBytes > 0
        ? resources.memoryLimitBytes / 1024 / 1024
        : null;
    const soft = limitMb ? limitMb * 0.70 : null;
    const crit = limitMb ? limitMb * 0.85 : null;

    let indicator = '🟢 OPTIMAL';
    if (limitMb === null) indicator = '⚪ LIMIT UNKNOWN';
    else if (rssMb >= crit) indicator = '🔴 CRITICAL';
    else if (rssMb >= soft) indicator = '🟡 MODERATE';

    return {
        ramText: `${getRamUsageText()} (Heap ${heapMb}MB)`,
        healthText: indicator
    };
}

function getAiSummaryText() {
    try {
        if (typeof settings.getAIKeys === 'function') {
            const keys = settings.getAIKeys();
            const g = keys?.geminiKeys?.length || 0;
            const q = keys?.groqKeys?.length || 0;
            const or = keys?.openrouterKeys?.length || 0;
            const bk = settings.mahiru?.backupAI?.enabled !== false ? ' • BK:ON' : '';
            return `G:${g} • Q:${q} • OR:${or}${bk}`;
        }
    } catch {}
    return 'Active';
}

async function aliveCommand(sock, chatId, message) {
    const prefix = settings.prefix || '.';
    const timeInfo = getDhakaTimeInfo();
    const { ramText, healthText } = getRamHealthBadge();
    const loopLagMs = await measureRealLoopLagMs();
    const resources = getResourceSnapshot();

    const userName = String(message?.pushName || 'Friend').trim();
    const botName = settings.botName || 'Mahiru Shiina';
    const botTitle = toSmallCaps(botName);
    const ownerTitle = settings.ownerDisplayName || settings.botOwner || 'MSK';
    const modeText = toSmallCaps(String(settings.commandMode || 'public').toUpperCase());
    const versionClean = String(settings.version || '1.0.0-ULTIMATE').replace(/^v/i, '');
    const securityText = settings.mahiru?.security?.strictOwnerChatbotLock !== false
        ? '🛡️ Root Firewall Active'
        : '⚙️ Standard';
    const takeoverMin = settings.mahiru?.takeover?.defaultWaitMin || 2;

    const statusCard = buildInfoFrame('Mahiru System Status', [
        { raw: `${timeInfo.greetEmoji} *${toSmallCaps(timeInfo.greeting)}*, ${userName}!` },
        { icon: '⚡', label: 'STATUS', value: `ONLINE • ${toSmallCaps(healthText)}` },
        { icon: '🤖', label: 'ENGINE', value: `${botTitle} • Mahiru` },
        { icon: '👑', label: 'OWNER', value: ownerTitle },
        { icon: '🕒', label: 'TIME', value: `${timeInfo.time} (${timeInfo.date})` },
        { icon: '⏱️', label: 'UPTIME', value: formatUptime() },
        { icon: '⚙️', label: 'LOOP LAG', value: `${loopLagMs} ms` },
        { icon: '🐏', label: 'RAM', value: ramText },
        { icon: '⚙️', label: 'CPU', value: `${resources.cpu.label} vCPU allocated` },
        { icon: '💾', label: 'DISK', value: `${resources.disk.used} project estimate / ${resources.disk.total} allocated | ${resources.disk.free} estimated free` },
        { icon: '🧠', label: 'AI CORES', value: getAiSummaryText() },
        { icon: '🤝', label: 'TAKEOVER', value: `Presence Smart (${takeoverMin}m)` },
        { icon: '🔓', label: 'MODE', value: `${modeText} | Prefix: \`${prefix}\`` },
        { icon: '🛡️', label: 'SHIELD', value: securityText },
        { icon: '☁️', label: 'HOST', value: getRuntimeLabel() },
        { icon: '🏷️', label: 'VERSION', value: `v${versionClean}` }
    ]);

    const highlights = [
        '╭━━━〔 🌟 *ULTIMATE CAPABILITIES* 〕━━━••○',
        '│❖│ 🧠 *Dual-Gemini (AIza/AQ) + Backup AI*',
        '│❖│ 🎙️ *Crystal Human Voice v1.0*',
        '│❖│ 🛡️ *Immutable Root Lock & Group Kill-Switch*',
        '╰━━━━━━━━━━━━━━━━━━━━━••○',
        `💡 নিচের বাটনে ট্যাপ করো অথবা \`${prefix}menu\` লেখো।`
    ].join('\n');

    const bodyText = `${statusCard}\n\n${highlights}`;

    const buttons = [
        { text: 'MENU 📚', id: `${prefix}menu`, type: 'quick_reply' },
        { text: 'PING 🚀', id: `${prefix}ping`, type: 'quick_reply' },
        { text: 'OWNER 👑', id: `${prefix}owner`, type: 'quick_reply' },
        { text: 'SETTINGS ⚙️', id: `${prefix}settings`, type: 'quick_reply' }
    ];

    try {
        await sendInteractiveCard(sock, chatId, {
            body: bodyText,
            footer: settings.mahiru?.ui?.footerText || `Powered By ${botTitle} • Mahiru`,
            headerTitle: `${botTitle} • ALIVE`,
            headerSubtitle: `⚡ ${toSmallCaps('MAHIRU ONLINE')}`,
            headerType: 'location',
            useVerifiedQuote: true,
            buttons,
            quoted: message
        });
    } catch (error) {
        console.error('❌ [alive] Error in alive command:', error?.message || error);
        try {
            await sock.sendMessage(
                chatId,
                { text: `⚡ *${botName} • Mahiru v${versionClean} Online!*\n⏱️ Uptime: ${formatUptime()}\n🐏 RAM: ${ramText}` },
                { quoted: message }
            );
        } catch {}
    }
}

module.exports = aliveCommand;
