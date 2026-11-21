const isAdmin = require('../lib/isAdmin');

async function promoteCommand(sock, chatId, mentionedJids, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'এই কমান্ডটি শুধু গ্রুপে ব্যবহার করা যাবে।' }, { quoted: message });
        return;
    }

    const senderId = message?.key?.participant || message?.key?.remoteJid;
    const adminStatus = await isAdmin(sock, chatId, senderId);

    if (!adminStatus.isBotAdmin) {
        await sock.sendMessage(chatId, { text: 'প্রথমে Mahiru-কে গ্রুপ অ্যাডমিন করুন।' }, { quoted: message });
        return;
    }
    if (!adminStatus.isSenderAdmin && !message?.key?.fromMe) {
        await sock.sendMessage(chatId, { text: 'শুধু গ্রুপ অ্যাডমিন এই কমান্ড ব্যবহার করতে পারবেন।' }, { quoted: message });
        return;
    }

    const context = message?.message?.extendedTextMessage?.contextInfo || {};
    const targets = [...new Set(
        (Array.isArray(mentionedJids) ? mentionedJids : []).concat(context.participant ? [context.participant] : [])
    )].filter(jid => typeof jid === 'string' && jid.includes('@'));

    if (!targets.length) {
        await sock.sendMessage(chatId, { text: 'যাকে Promote করতে চান তাকে Mention করুন অথবা তার মেসেজে Reply দিন।' }, { quoted: message });
        return;
    }

    try {
        const result = await sock.groupParticipantsUpdate(chatId, targets, 'promote');
        const actor = senderId || sock.user?.id || '';
        const names = targets.map(jid => '@' + jid.split('@')[0]);
        await sock.sendMessage(chatId, {
            text: '✅ *Group Promotion সম্পন্ন*\n\n' +
                '*Promoted:* ' + names.join(', ') + '\n' +
                '*করা হয়েছে:* @' + (actor.split('@')[0] || 'Unknown'),
            mentions: [...targets, ...(actor ? [actor] : [])]
        }, { quoted: message });
        return result;
    } catch (error) {
        console.error('[Promote] Error:', error);
        await sock.sendMessage(chatId, { text: '❌ Promote করা যায়নি। Bot-এর Admin permission এবং target member-এর status পরীক্ষা করুন।' }, { quoted: message });
    }
}

async function handlePromotionEvent(sock, groupId, participants, author) {
    try {
        if (!Array.isArray(participants) || !participants.length) return;
        const targets = participants.map(item => typeof item === 'string' ? item : item?.id).filter(Boolean);
        const actor = typeof author === 'string' ? author : author?.id;
        const mentions = [...targets, ...(actor ? [actor] : [])];
        await sock.sendMessage(groupId, {
            text: '⬆️ *Group Promotion*\n' + targets.map(jid => '@' + jid.split('@')[0]).join(', ') +
                '\nকরা হয়েছে: ' + (actor ? '@' + actor.split('@')[0] : 'System'),
            mentions
        });
    } catch (error) {
        console.error('[Promotion Event] Error:', error);
    }
}

module.exports = { promoteCommand, handlePromotionEvent };
