const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { isSudo } = require('./index');

const OWNER_IDENTITY_FILE = path.join(__dirname, '../data/ownerIdentity.json');

function cleanNumber(value) {
    if (!value || typeof value !== 'string') return '';
    return value.split(':')[0].split('@')[0].replace(/\D/g, '');
}

function readOwnerIdentity() {
    try {
        if (!fs.existsSync(OWNER_IDENTITY_FILE)) return { ownerLids: [] };
        const data = JSON.parse(fs.readFileSync(OWNER_IDENTITY_FILE, 'utf8'));
        if (!Array.isArray(data.ownerLids)) data.ownerLids = [];
        return data;
    } catch (error) {
        console.error('[Owner ID] Read error:', error.message);
        return { ownerLids: [] };
    }
}

function saveVerifiedOwnerLid(lid) {
    if (!lid || !lid.endsWith('@lid')) return;
    try {
        const data = readOwnerIdentity();
        if (!data.ownerLids.includes(lid)) data.ownerLids.push(lid);
        fs.mkdirSync(path.dirname(OWNER_IDENTITY_FILE), { recursive: true });
        fs.writeFileSync(OWNER_IDENTITY_FILE, JSON.stringify(data, null, 2));
        console.log('[Owner ID] Verified Owner LID saved.');
    } catch (error) {
        console.error('[Owner ID] Save error:', error.message);
    }
}

async function resolvePhoneFromLid(sock, jid) {
    if (!jid || !jid.endsWith('@lid')) return '';
    try {
        const resolver = sock?.signalRepository?.lidMapping?.getPNForLID;
        if (typeof resolver !== 'function') return '';
        const pn = await resolver.call(sock.signalRepository.lidMapping, jid);
        return cleanNumber(pn || '');
    } catch (error) {
        console.log('[Owner ID] LID lookup unavailable:', error.message);
        return '';
    }
}

async function isConfiguredOwner(senderId, sock = null, chatId = null, message = null) {
    const ownerNumber = cleanNumber(String(settings.ownerNumber || ''));
    const configuredLids = String(settings.ownerLid || '').split(/[;,\s]+/).map(value => value.trim()).filter(value => value.endsWith('@lid'));
    if (!ownerNumber && !configuredLids.length) return false;

    const candidates = [
        senderId,
        message?.key?.participant,
        message?.key?.participantAlt,
        message?.key?.remoteJid,
        message?.key?.remoteJidAlt,
        message?.key?.senderPn,
        message?.participant,
        message?.participantAlt,
        message?.senderPn
    ].filter(value => typeof value === 'string' && value);

    const saved = readOwnerIdentity();
    const savedLids = [...new Set([...(saved.ownerLids || []), ...configuredLids])];
    // A configured Owner LID is trusted even if WhatsApp omits the phone JID.
    if (candidates.some(value => value.endsWith('@lid') && configuredLids.includes(value))) {
        return true;
    }


    const directPhone = Boolean(ownerNumber) && candidates.some(value => !value.endsWith('@lid') && cleanNumber(value) === ownerNumber);
    if (directPhone) {
        for (const candidate of candidates) {
            if (candidate.endsWith('@lid')) saveVerifiedOwnerLid(candidate);
        }
        return true;
    }

    // Check a previously verified Owner LID.
    if (candidates.some(value => value.endsWith('@lid') && savedLids.includes(value))) {
        return true;
    }

    // Ask Baileys' internal PN/LID mapping store to resolve the sender.
    for (const candidate of candidates) {
        if (!candidate.endsWith('@lid')) continue;
        const resolvedNumber = await resolvePhoneFromLid(sock, candidate);
        if (ownerNumber && resolvedNumber && resolvedNumber === ownerNumber) {
            saveVerifiedOwnerLid(candidate);
            return true;
        }
    }

    // Group metadata can expose both PN and LID for the same participant.
    if (sock && chatId && chatId.endsWith('@g.us')) {
        try {
            const metadata = await sock.groupMetadata(chatId);
            const candidateLids = candidates.filter(value => value.endsWith('@lid'));
            const participant = (metadata.participants || []).find(p => {
                const ids = [p.id, p.lid, p.phoneNumber, p.phone_number].filter(Boolean);
                return ids.some(id => candidates.includes(id)) ||
                    ids.some(id => id.endsWith('@lid') && candidateLids.includes(id));
            });
            if (participant) {
                const participantIds = [
                    participant.id,
                    participant.phoneNumber,
                    participant.phone_number
                ].filter(Boolean);
                if (ownerNumber && participantIds.some(id => !id.endsWith('@lid') && cleanNumber(id) === ownerNumber)) {
                    const lid = [participant.lid, ...candidateLids].find(id => id && id.endsWith('@lid'));
                    if (lid) saveVerifiedOwnerLid(lid);
                    return true;
                }
            }
        } catch (error) {
            console.error('[Owner ID] Group lookup error:', error.message);
        }
    }

    return false;
}

async function isOwnerOrSudo(senderId, sock = null, chatId = null, message = null) {
    if (await isConfiguredOwner(senderId, sock, chatId, message)) return true;

    try {
        return await isSudo(senderId);
    } catch (error) {
        console.error('❌ [isOwner] Error checking sudo:', error);
        return false;
    }
}


const unauthorizedNoticeCooldown = new Map();

async function reportUnauthorizedAttempt(sock, { senderId = '', chatId = '', command = '', pushName = '', reason = '' } = {}) {
    try {
        const security = settings.mahiru?.security || {};
        if (security.alertOwnerOnUnauthorizedCommand === false) return false;

        const sender = String(senderId || 'unknown').split(':')[0];
        const key = sender + ':' + String(command || '').toLowerCase();
        const now = Date.now();
        const previous = unauthorizedNoticeCooldown.get(key) || 0;
        if (now - previous < 5 * 60 * 1000) return false;
        unauthorizedNoticeCooldown.set(key, now);
        if (unauthorizedNoticeCooldown.size > 100) {
            for (const [k, ts] of unauthorizedNoticeCooldown) {
                if (now - ts > 10 * 60 * 1000) unauthorizedNoticeCooldown.delete(k);
            }
        }

        const { notifyOwner } = require('./ownerNotify');
        const location = String(chatId).endsWith('@g.us')
            ? 'গ্রুপ: ' + chatId
            : 'প্রাইভেট ইনবক্স';
        const time = new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' });
        await notifyOwner(sock, [
            '🛡️ *MAHIRU SECURITY ALERT*',
            '',
            '⚠️ অননুমোদিত কমান্ড ব্যবহারের চেষ্টা ব্লক করা হয়েছে।',
            '👤 ব্যবহারকারী: ' + (pushName || 'Unknown'),
            '🆔 Sender ID: ' + sender,
            '⌨️ কমান্ড: ' + (command || 'Unknown'),
            '📍 স্থান: ' + location,
            reason ? '🔒 কারণ: ' + reason : '',
            '🕒 সময়: ' + time
        ].filter(Boolean).join('\n'));
        return true;
    } catch (error) {
        console.error('[SECURITY NOTICE] Could not notify owner:', error?.message || error);
        return false;
    }
}

module.exports = isOwnerOrSudo;
module.exports.isConfiguredOwner = isConfiguredOwner;
module.exports.reportUnauthorizedAttempt = reportUnauthorizedAttempt;
