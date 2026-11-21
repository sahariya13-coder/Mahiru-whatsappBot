const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const warningsFilePath = path.join(process.cwd(), 'data', 'warnings.json');

function loadWarnings() {
    try {
        fs.mkdirSync(path.dirname(warningsFilePath), { recursive: true });
        if (!fs.existsSync(warningsFilePath)) {
            fs.writeFileSync(warningsFilePath, '{}', 'utf8');
        }
        const raw = fs.readFileSync(warningsFilePath, 'utf8');
        const parsed = raw.trim() ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.error('[Warnings] Database read error:', error);
        return {};
    }
}

async function warningsCommand(sock, chatId, mentionedJidList = [], message = null) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'এই কমান্ডটি শুধু গ্রুপে ব্যবহার করা যাবে।' }, message ? { quoted: message } : {});
        return;
    }

    const senderId = message?.key?.participant || message?.key?.remoteJid || '';
    const adminStatus = await isAdmin(sock, chatId, senderId);
    if (!adminStatus.isSenderAdmin) {
        await sock.sendMessage(chatId, { text: 'শুধু গ্রুপ অ্যাডমিন Warning-এর তালিকা দেখতে পারবেন।' }, message ? { quoted: message } : {});
        return;
    }

    const context = message?.message?.extendedTextMessage?.contextInfo || {};
    const target = (Array.isArray(mentionedJidList) ? mentionedJidList[0] : null) || context.participant;

    if (!target) {
        await sock.sendMessage(chatId, { text: 'যার Warning দেখতে চান তাকে Mention করুন অথবা তার মেসেজে Reply দিন।' }, message ? { quoted: message } : {});
        return;
    }

    const warnings = loadWarnings();
    const groupWarnings = warnings[chatId] && typeof warnings[chatId] === 'object' ? warnings[chatId] : {};
    const count = Number(groupWarnings[target] || 0);

    await sock.sendMessage(chatId, {
        text: '⚠️ *Warning তথ্য*\nব্যবহারকারী: @' + target.split('@')[0] +
            '\nএই গ্রুপে Warning: ' + count + '/3',
        mentions: [target]
    }, message ? { quoted: message } : {});
}

module.exports = warningsCommand;
