const settings = require('../settings');

function normalizeJid(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw.split(':')[0];
    const digits = raw.replace(/\\D/g, '');
    return digits ? digits + '@s.whatsapp.net' : '';
}

function getBotInbox(sock) {
    const raw = String(sock?.user?.id || sock?.user?.jid || '').trim();
    if (!raw) return '';
    const normalized = raw.split(':')[0];
    return normalized.includes('@') ? normalized : normalizeJid(normalized);
}

function getOwnerInbox(sock) {
    const configured = normalizeJid(settings.ownerNumber || '');
    if (configured) return configured;

    const connected = getBotInbox(sock);
    return connected;
}

async function sendToBotInboxAndOwner(sock, content, options = {}) {
    const botInbox = getBotInbox(sock);
    const ownerInbox = getOwnerInbox(sock);
    const targets = [...new Set([botInbox, ownerInbox].filter(Boolean))];

    if (!targets.length) {
        console.error('[NOTICE MIRROR] Bot and owner inboxes could not be resolved.');
        return { sent: [], failed: [] };
    }

    const sent = [];
    const failed = [];
    for (const target of targets) {
        try {
            await sock.sendMessage(target, content, options);
            sent.push(target);
        } catch (error) {
            failed.push({ target, error: error?.message || String(error) });
            console.error('[NOTICE MIRROR] Could not send to', target, error?.message || error);
        }
    }
    return { sent, failed };
}

async function notifyOwner(sock, text, extra = {}) {
    const result = await sendToBotInboxAndOwner(sock, { text, ...extra });
    return result.sent.length > 0;
}

async function notifyBothInboxes(sock, text, extra = {}) {
    const result = await sendToBotInboxAndOwner(sock, { text, ...extra });
    return result.sent.length > 0;
}

module.exports = {
    normalizeJid,
    getBotInbox,
    getOwnerInbox,
    sendToBotInboxAndOwner,
    notifyOwner,
    notifyBothInboxes
};
