/**
 * MSK • Mahiru v1.0 ULTIMATE — Precision Latency & Cloud Telemetry Engine
 * Fixes: Zero Dangling Timer Leak + Cached CPU Core Count + PRIME CLOUD Branding (Zero LINUX Leak)
 * Features: Zero-Spam Reaction RTT Probe + Event Loop Lag Meter + 256MB RAM Profiler + MAHIRU Banner
 * Security: 100% Link-Free (Group Anti-Link Shield Safe) | Zero Disk I/O
 */
const { getResourceSnapshot } = require('../lib/hostingResources');
const settings = require('../settings');
const buttonEngine = require('../lib/buttonEngine');

const {
    toSmallCaps,
    getDhakaTimeInfo,
    formatUptime,
    getRamUsageText,
    getRuntimeLabel,
    buildInfoFrame,
    sendInteractiveCard
} = buttonEngine;

// CPU/RAM/ডিস্ক সীমা কন্টেইনারের cgroup ও filesystem থেকে শনাক্ত করা হয়।
function measureEventLoopLagMs() {
    return new Promise((resolve) => {
        const startNs = process.hrtime.bigint();
        setImmediate(() => {
            const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
            resolve(Number(elapsedMs.toFixed(2)));
        });
    });
}

async function measureWhatsAppRttMs(sock, chatId, message) {
    const startNs = process.hrtime.bigint();
    let timer = null;
    try {
        if (sock && message?.key) {
            const timeoutPromise = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('rtt_timeout')), 4000);
                timer.unref?.();
            });
            await Promise.race([
                sock.sendMessage(chatId, { react: { text: '⚡', key: message.key } }),
                timeoutPromise
            ]);
            return { rttMs: Math.max(1, Math.round(Number(process.hrtime.bigint() - startNs) / 1e6)), liveProbe: true };
        }
    } catch {} finally { if (timer) clearTimeout(timer); }
    return { rttMs: Math.max(1, Math.round(Number(process.hrtime.bigint() - startNs) / 1e6)), liveProbe: false };
}

function getSpeedGrade(rttMs) {
    if (rttMs <= 250) return '🟢 ULTRA FAST';
    if (rttMs <= 650) return '🟡 GOOD';
    return '🟠 MODERATE';
}

function getCpuLoadText() {
    const resources = getResourceSnapshot();
    const load = Number(require('os').loadavg()?.[0] || 0).toFixed(2);
    return `${resources.cpu.label} vCPU allocated | host load ${load}`;
}

function getMemoryTelemetry() {
    const mem = process.memoryUsage();
    const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const buffers = ((mem.arrayBuffers || 0) / 1024 / 1024).toFixed(1);
    return {
        ramMain: getRamUsageText(),
        heapDetail: `${heapUsed}/${heapTotal} MB (Buf ${buffers}MB)`
    };
}

// ==================================================
// ২. মূল পিং কমান্ড হ্যান্ডলার (.ping / .p)
// ==================================================
async function pingCommand(sock, chatId, message) {
    const prefix = settings.prefix || '.';
    const botName = settings.botName || 'Mahiru Shiina';
    const botTitle = toSmallCaps(botName);
    const versionClean = String(settings.version || '1.0.0-ULTIMATE').replace(/^v/i, '');

    try {
        const [{ rttMs, liveProbe }, loopLagMs] = await Promise.all([
            measureWhatsAppRttMs(sock, chatId, message),
            measureEventLoopLagMs()
        ]);

        const timeInfo = getDhakaTimeInfo();
        const memInfo = getMemoryTelemetry();
        const speedBadge = getSpeedGrade(rttMs);

        const pingCard = buildInfoFrame('Speed & Telemetry', [
            { raw: `⚡ *${toSmallCaps('PONG! MAHIRU ENGINE RESPONSIVE')}*` },
            { icon: '🚀', label: 'LATENCY', value: `${rttMs} ms (${toSmallCaps(speedBadge)})` },
            { icon: '⚙️', label: 'LOOP LAG', value: `${loopLagMs} ms` },
            { icon: '📡', label: 'PROBE', value: liveProbe ? 'Live WhatsApp RTT' : 'Local Runtime' },
            { icon: '⏱️', label: 'UPTIME', value: formatUptime() },
            { icon: '🐏', label: 'RAM', value: memInfo.ramMain },
            { icon: '📦', label: 'HEAP', value: memInfo.heapDetail },
            { icon: '💾', label: 'DISK', value: (() => { const d = getResourceSnapshot().disk; return `${d.used} project estimate / ${d.total} allocated | ${d.free} estimated free`; })() },
            { icon: '☁️', label: 'HOST', value: getRuntimeLabel() },
            { icon: '⚙️', label: 'CPU', value: getCpuLoadText() },
            { icon: '🕒', label: 'TIME', value: `${timeInfo.time} (${timeInfo.date})` },
            { icon: '🏷️', label: 'VERSION', value: `v${versionClean}` }
        ]);

        const buttons = [
            { text: 'ALIVE ⚡', id: `${prefix}alive`, type: 'quick_reply' },
            { text: 'MENU 📚', id: `${prefix}menu`, type: 'quick_reply' },
            { text: 'OWNER 👑', id: `${prefix}owner`, type: 'quick_reply' },
            { text: 'SETTINGS ⚙️', id: `${prefix}settings`, type: 'quick_reply' }
        ];

        await sendInteractiveCard(sock, chatId, {
            body: pingCard,
            footer: settings.mahiru?.ui?.footerText || `Powered By ${botTitle} • Mahiru v${versionClean}`,
            headerTitle: `${botTitle} • SPEED`,
            headerSubtitle: `🚀 ${rttMs} ms • ${toSmallCaps('ONLINE')}`,
            headerType: 'location',
            useVerifiedQuote: true,
            buttons,
            quoted: message
        });
    } catch (error) {
        console.error('❌ [ping] Error in ping command:', error?.message || error);
        try {
            await sock.sendMessage(
                chatId,
                { text: `⚡ *${botName} Pong!*\n⏱️ Uptime: ${formatUptime()}\n🐏 RAM: ${getRamUsageText()}` },
                { quoted: message }
            );
        } catch {}
    }
}

module.exports = pingCommand;
