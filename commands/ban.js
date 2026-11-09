const fs = require('fs');
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');

async function banCommand(sock, chatId, message) {
    const isGroup = chatId.endsWith('@g.us');

    if (isGroup) {
        const senderId = message.key.participant || message.key.remoteJid;
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: 'Please make the bot an admin to use .ban'
            }, { quoted: message });
            return;
        }

        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, {
                text: 'Only group admins can use .ban'
            }, { quoted: message });
            return;
        }
    } else {
        const senderId = message.key.participant || message.key.remoteJid;
        const senderIsSudo = await isSudo(senderId);

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, {
                text: 'Only owner/sudo can use .ban in private chat'
            }, { quoted: message });
            return;
        }
    }

    let userToBan;

    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToBan = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToBan = message.message.extendedTextMessage.contextInfo.participant;
    }

    if (!userToBan) {
        await sock.sendMessage(chatId, {
            text: 'Please mention the user or reply to their message to ban!'
        }, { quoted: message });
        return;
    }

    try {
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        if (
            userToBan === botId ||
            userToBan === botId.replace('@s.whatsapp.net', '@lid')
        ) {
            await sock.sendMessage(chatId, {
                text: 'You cannot ban the bot account.'
            }, { quoted: message });
            return;
        }
    } catch {}

    try {
        const bannedUsers = JSON.parse(fs.readFileSync('./data/banned.json', 'utf8'));

        if (!bannedUsers.includes(userToBan)) {
            bannedUsers.push(userToBan);

            fs.writeFileSync(
                './data/banned.json',
                JSON.stringify(bannedUsers, null, 2)
            );

            await sock.sendMessage(chatId, {
                text: `Successfully banned @${userToBan.split('@')[0]}!`,
                mentions: [userToBan]
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: `${userToBan.split('@')[0]} is already banned!`,
                mentions: [userToBan]
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in ban command:', error);

        await sock.sendMessage(chatId, {
            text: 'Failed to ban user!'
        }, { quoted: message });
    }
}

module.exports = banCommand;
