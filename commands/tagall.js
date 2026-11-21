const isAdmin = require('../lib/isAdmin');  // Move isAdmin to helpers

async function tagAllCommand(sock, chatId, senderId, message) {
    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: 'আগে বটকে গ্রুপ অ্যাডমিন করুন।' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: 'শুধু গ্রুপ অ্যাডমিনরা .tagall কমান্ড ব্যবহার করতে পারবেন।' }, { quoted: message });
            return;
        }

        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants;

        if (!participants || participants.length === 0) {
            await sock.sendMessage(chatId, { text: 'গ্রুপে কোনো সদস্য পাওয়া যায়নি।' });
            return;
        }

        // Create message with each member on a new line
        let messageText = '🔊 *Hello Everyone:*\n\n';
        participants.forEach(participant => {
            messageText += `@${participant.id.split('@')[0]}\n`; // Add \n for new line
        });

        // Send message with mentions
        await sock.sendMessage(chatId, {
            text: messageText,
            mentions: participants.map(p => p.id)
        });

    } catch (error) {
        console.error('Error in tagall command:', error);
        await sock.sendMessage(chatId, { text: 'সব সদস্যকে ট্যাগ করা যায়নি।' });
    }
}

module.exports = tagAllCommand;  // Export directly
