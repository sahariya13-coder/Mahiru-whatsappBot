const settings = require('../settings');

function getOwnerInbox(sock) {
    const configured = String(settings.ownerNumber || '').replace(/\D/g, '');
    if (configured) return configured + '@s.whatsapp.net';
    const connected = String(sock?.user?.id || '').split(':')[0];
    return connected.includes('@') ? connected : (connected ? connected + '@s.whatsapp.net' : '');
}

async function notifyOwner(sock, text, extra = {}) {
    const inbox = getOwnerInbox(sock);
    if (!inbox) {
        console.error('[OWNER NOTICE] Owner inbox could not be resolved.');
        return false;
    }
    try {
        await sock.sendMessage(inbox, { text, ...extra });
        return true;
    } catch (error) {
        console.error('[OWNER NOTICE] Could not send notice:', error?.message || error);
        return false;
    }
}

module.exports = { getOwnerInbox, notifyOwner };
