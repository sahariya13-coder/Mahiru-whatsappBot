const settings = require('../settings');
const { addSudo, removeSudo, getSudoList } = require('../lib/index');
const { isConfiguredOwner } = require('../lib/isOwner');

function extractMentionedJid(message) {
    const context = message?.message?.extendedTextMessage?.contextInfo || {};
    const mentioned = Array.isArray(context.mentionedJid) ? context.mentionedJid : [];
    if (mentioned.length) return mentioned[0];

    const rawText = message?.message?.conversation || message?.message?.extendedTextMessage?.text || '';
    const match = rawText.match(/\b(\d{7,15})\b/);
    return match ? match[1] + '@s.whatsapp.net' : null;
}

async function sudoCommand(sock, chatId, message) {
    const senderJid = message?.key?.participant || message?.key?.remoteJid || '';
    const rawText = message?.message?.conversation || message?.message?.extendedTextMessage?.text || '';
    const args = rawText.trim().split(/\s+/).slice(1);
    const sub = (args[0] || '').toLowerCase();

    // Only the configured Owner may manage privileged sudo access.
    const verifiedOwner = Boolean(message?.key?.fromMe) ||
        await isConfiguredOwner(senderJid, sock, chatId, message);

    if (!sub || !['add', 'del', 'remove', 'list'].includes(sub)) {
        await sock.sendMessage(chatId, {
            text: 'ব্যবহার:\n.sudo add <@ব্যবহারকারী|নম্বর>\n.sudo del <@ব্যবহারকারী|নম্বর>\n.sudo list'
        }, { quoted: message });
        return;
    }

    if (!verifiedOwner) {
        await sock.sendMessage(chatId, {
            text: '❌ শুধু বটের মালিক Sudo ব্যবহারকারী যোগ বা বাদ দিতে পারবেন।'
        }, { quoted: message });
        return;
    }

    if (sub === 'list') {
        const list = await getSudoList();
        if (!list.length) {
            await sock.sendMessage(chatId, { text: 'কোনো Sudo ব্যবহারকারী নির্ধারণ করা নেই।' }, { quoted: message });
            return;
        }
        await sock.sendMessage(chatId, {
            text: '*Sudo ব্যবহারকারীরা*\n' + list.map((jid, index) => (index + 1) + '. @' + jid.split('@')[0]).join('\n'),
            mentions: list
        }, { quoted: message });
        return;
    }

    const targetJid = extractMentionedJid(message);
    if (!targetJid) {
        await sock.sendMessage(chatId, { text: 'কাউকে মেনশন করুন অথবা সঠিক ফোন নম্বর দিন।' }, { quoted: message });
        return;
    }

    const ownerNumber = String(settings.ownerNumber || '').replace(/\D/g, '');
    const targetNumber = targetJid.split('@')[0].split(':')[0].replace(/\D/g, '');
    if ((ownerNumber && targetNumber === ownerNumber) || targetJid.endsWith('@lid') && targetJid === settings.ownerLid) {
        await sock.sendMessage(chatId, { text: 'বটের মালিককে Sudo তালিকা থেকে বাদ দেওয়া যাবে না।' }, { quoted: message });
        return;
    }

    if (sub === 'add') {
        const ok = await addSudo(targetJid);
        await sock.sendMessage(chatId, {
            text: ok ? '✅ @' + targetJid.split('@')[0] + ' Sudo ব্যবহারকারী হিসেবে যোগ করা হয়েছে।' : '❌ Sudo ব্যবহারকারী যোগ করা যায়নি।',
            mentions: [targetJid]
        }, { quoted: message });
        return;
    }

    const ok = await removeSudo(targetJid);
    await sock.sendMessage(chatId, {
        text: ok ? '✅ @' + targetJid.split('@')[0] + ' Sudo তালিকা থেকে বাদ দেওয়া হয়েছে।' : '❌ Sudo ব্যবহারকারীকে Sudo তালিকা থেকে বাদ দেওয়া যায়নি।',
        mentions: [targetJid]
    }, { quoted: message });
}

module.exports = sudoCommand;
