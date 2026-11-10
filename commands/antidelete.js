const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const isOwnerOrSudo = require('../lib/isOwner');

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'antidelete.json');
const STORE_PATH = path.join(DATA_DIR, 'antidelete-store.json');
const MEDIA_DIR = path.join(DATA_DIR, 'antidelete-media');
const MAX_STORED_MESSAGES = 500;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const messageStore = new Map();

// Prevent duplicate WhatsApp revoke events from sending the same report twice.
const processedRevocations = new Set();
const MAX_PROCESSED_REVOCATIONS = 2000;

function markRevocationProcessed(key) {
    if (processedRevocations.has(key)) return false;
    processedRevocations.add(key);

    if (processedRevocations.size > MAX_PROCESSED_REVOCATIONS) {
        const oldest = processedRevocations.values().next().value;
        processedRevocations.delete(oldest);
    }
    return true;
}

function loadJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        console.error('Antidelete JSON read error:', error.message);
        return fallback;
    }
}

function saveJSON(file, value) {
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(value, null, 2));
    fs.renameSync(temp, file);
}

function loadAntideleteConfig() {
    return loadJSON(CONFIG_PATH, { enabled: false });
}

function saveAntideleteConfig(config) {
    try {
        saveJSON(CONFIG_PATH, config);
    } catch (error) {
        console.error('Antidelete config save error:', error);
    }
}

function messageKey(remoteJid, id) {
    return remoteJid + ':' + id;
}

function persistMessageStore() {
    try {
        saveJSON(STORE_PATH, Array.from(messageStore.entries()).slice(-MAX_STORED_MESSAGES));
    } catch (error) {
        console.error('Antidelete store save error:', error);
    }
}

function restoreMessageStore() {
    const entries = loadJSON(STORE_PATH, []);
    if (!Array.isArray(entries)) return;
    for (const [key, value] of entries) {
        if (value && typeof value === 'object') messageStore.set(key, value);
    }
}
restoreMessageStore();

function getMessageContent(message) {
    let content = message?.message || {};
    for (let i = 0; i < 4; i++) {
        const wrapped = content.ephemeralMessage?.message ||
            content.viewOnceMessageV2?.message ||
            content.viewOnceMessage?.message ||
            content.documentWithCaptionMessage?.message;
        if (!wrapped) break;
        content = wrapped;
    }
    return content;
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

function getMediaInfo(content) {
    if (content.imageMessage) return { type: 'image', message: content.imageMessage, extension: 'jpg' };
    if (content.videoMessage) return { type: 'video', message: content.videoMessage, extension: 'mp4' };
    if (content.audioMessage) {
        const mime = content.audioMessage.mimetype || '';
        const extension = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'mp3';
        return { type: 'audio', message: content.audioMessage, extension };
    }
    if (content.stickerMessage) return { type: 'sticker', message: content.stickerMessage, extension: 'webp' };
    return null;
}

async function handleAntideleteCommand(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!message.key.fromMe && !isOwner) {
        return sock.sendMessage(chatId, { text: '*Only the bot owner can use this command.*' }, { quoted: message });
    }

    const config = loadAntideleteConfig();
    const action = (match || '').trim().toLowerCase();

    if (!action) {
        return sock.sendMessage(chatId, {
            text: '*ANTIDELETE SETUP*\n\nCurrent Status: ' +
                (config.enabled ? '✅ Enabled' : '❌ Disabled') +
                '\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable'
        }, { quoted: message });
    }

    if (action !== 'on' && action !== 'off') {
        return sock.sendMessage(chatId, {
            text: '*Invalid command. Use .antidelete on or .antidelete off.*'
        }, { quoted: message });
    }

    config.enabled = action === 'on';
    saveAntideleteConfig(config);

    return sock.sendMessage(chatId, {
        text: config.enabled
            ? '*Antidelete enabled. New incoming messages will now be saved.*'
            : '*Antidelete disabled.*'
    }, { quoted: message });
}

async function storeMessage(sock, message) {
    try {
        if (!loadAntideleteConfig().enabled) return;
        const key = message?.key;
        if (!key?.id || !key?.remoteJid || key.fromMe) return;

        const content = getMessageContent(message);
        const media = getMediaInfo(content);
        const messageText =
            content.conversation ||
            content.extendedTextMessage?.text ||
            content.imageMessage?.caption ||
            content.videoMessage?.caption ||
            content.documentMessage?.caption ||
            content.buttonsResponseMessage?.selectedDisplayText ||
            content.listResponseMessage?.title ||
            '';

        const record = {
            id: key.id,
            remoteJid: key.remoteJid,
            sender: key.participant || key.remoteJid,
            content: messageText,
            mediaType: media?.type || '',
            mediaPath: '',
            timestamp: Date.now()
        };

        if (media) {
            try {
                const buffer = await streamToBuffer(
                    await downloadContentFromMessage(media.message, media.type)
                );
                const filename = Buffer.from(key.id).toString('hex') + '.' + media.extension;
                const absolutePath = path.join(MEDIA_DIR, filename);
                fs.writeFileSync(absolutePath, buffer);
                record.mediaPath = absolutePath;
            } catch (error) {
                console.error('Antidelete media download error:', error.message);
            }
        }

        messageStore.set(messageKey(key.remoteJid, key.id), record);

        while (messageStore.size > MAX_STORED_MESSAGES) {
            const oldestKey = messageStore.keys().next().value;
            const oldest = messageStore.get(oldestKey);
            if (oldest?.mediaPath && fs.existsSync(oldest.mediaPath)) {
                try { fs.unlinkSync(oldest.mediaPath); } catch {}
            }
            messageStore.delete(oldestKey);
        }

        persistMessageStore();
    } catch (error) {
        console.error('Antidelete storeMessage error:', error);
    }
}

async function handleMessageRevocation(sock, revocationMessage) {
    try {
        if (!loadAntideleteConfig().enabled) return;

        const originalKey = revocationMessage?.message?.protocolMessage?.key;
        if (!originalKey?.id || !originalKey?.remoteJid) return;

        const deletedBy = revocationMessage.key?.participant ||
            revocationMessage.participant ||
            revocationMessage.key?.remoteJid ||
            'Unknown';

        const botJid = (sock.user?.id || '').split(':')[0].split('@')[0] + '@s.whatsapp.net';
        if (revocationMessage.key?.fromMe || deletedBy === botJid) return;

        const storeKey = messageKey(originalKey.remoteJid, originalKey.id);

        // Claim this revoke synchronously before any await. WhatsApp/Baileys can
        // emit the same revoke more than once or in overlapping event handlers.
        if (!markRevocationProcessed(storeKey)) {
            console.log('[ANTIDELETE] Duplicate revoke ignored:', storeKey);
            return;
        }

        const original = messageStore.get(storeKey);
        if (!original) return;

        // Consume and persist the saved message immediately so a second event
        // cannot report it again while metadata or message sending is pending.
        messageStore.delete(storeKey);
        persistMessageStore();

        const sender = original.sender || original.remoteJid;
        const senderNumber = sender.split('@')[0].split(':')[0];
        const deletedByNumber = deletedBy.split('@')[0].split(':')[0];

        let groupName = '';
        if (original.remoteJid.endsWith('@g.us')) {
            try {
                const metadata = await sock.groupMetadata(original.remoteJid);
                groupName = metadata?.subject || '';
            } catch {}
        }

        const time = new Date(original.timestamp).toLocaleString('en-GB', {
            timeZone: 'Asia/Dhaka',
            hour12: true
        });

        let report = '*🔰 ANTIDELETE REPORT 🔰*\n\n' +
            '*🗑️ Deleted By:* @' + deletedByNumber + '\n' +
            '*👤 Sender:* @' + senderNumber + '\n' +
            '*🕒 Message Time:* ' + time + '\n';

        if (groupName) report += '*👥 Group:* ' + groupName + '\n';
        if (original.content) report += '\n*💬 Deleted Message:*\n' + original.content;

        await sock.sendMessage(botJid, {
            text: report,
            mentions: [deletedBy, sender]
        });

        if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
            const caption = '*Deleted ' + original.mediaType + '*\nFrom: @' + senderNumber;
            try {
                if (original.mediaType === 'image') {
                    await sock.sendMessage(botJid, { image: { url: original.mediaPath }, caption, mentions: [sender] });
                } else if (original.mediaType === 'video') {
                    await sock.sendMessage(botJid, { video: { url: original.mediaPath }, caption, mentions: [sender] });
                } else if (original.mediaType === 'audio') {
                    await sock.sendMessage(botJid, {
                        audio: { url: original.mediaPath },
                        mimetype: original.mediaPath.endsWith('.ogg') ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
                        ptt: false
                    });
                } else if (original.mediaType === 'sticker') {
                    await sock.sendMessage(botJid, { sticker: { url: original.mediaPath } });
                }
            } catch (error) {
                await sock.sendMessage(botJid, { text: '⚠️ Antidelete media send error: ' + error.message });
            }
        }

    } catch (error) {
        console.error('Antidelete revocation error:', error);
    }
}

module.exports = { handleAntideleteCommand, handleMessageRevocation, storeMessage };
