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
                text: ' .ban ব্যবহার করতে আগে বটকে গ্রুপ অ্যাডমিন করুন।'
            }, { quoted: message });
            return;
        }

        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, {
                text: 'শুধু গ্রুপ অ্যাডমিনরা .ban ব্যবহার করতে পারবেন।'
            }, { quoted: message });
            return;
        }
    } else {
        const senderId = message.key.participant || message.key.remoteJid;
        const senderIsSudo = await isSudo(senderId);

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, {
                text: 'শুধু Owner/Sudo ব্যক্তিগত চ্যাটে .ban ব্যবহার করতে পারবেন।'
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
            text: 'যাকে নিষিদ্ধ করতে চান তাকে মেনশন করুন অথবা তার মেসেজে রিপ্লাই দিন!'
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
                text: 'বট অ্যাকাউন্টকে নিষিদ্ধ করা যাবে না।'
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
                text: `@${userToBan.split('@')[0]}-কে সফলভাবে নিষিদ্ধ করা হয়েছে!`,
                mentions: [userToBan]
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: `${userToBan.split('@')[0]} আগে থেকেই নিষিদ্ধ!`,
                mentions: [userToBan]
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in ban command:', error);

        await sock.sendMessage(chatId, {
            text: 'ব্যবহারকারীকে নিষিদ্ধ করা যায়নি!'
        }, { quoted: message });
    }
}

module.exports = banCommand;
