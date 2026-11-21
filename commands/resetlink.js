async function resetlinkCommand(sock, chatId, senderId) {
    try {
        // Check if sender is admin
        const groupMetadata = await sock.groupMetadata(chatId);
        const isAdmin = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id)
            .includes(senderId);

        // Check if bot is admin
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const isBotAdmin = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id)
            .includes(botId);

        if (!isAdmin) {
            await sock.sendMessage(chatId, { text: '❌ শুধু গ্রুপ অ্যাডমিনরা এই কমান্ড ব্যবহার করতে পারবেন!' });
            return;
        }

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: '❌ গ্রুপের লিংক রিসেট করতে বটকে অ্যাডমিন হতে হবে!' });
            return;
        }

        // Reset the group link
        const newCode = await sock.groupRevokeInvite(chatId);
        
        // Send the new link
        await sock.sendMessage(chatId, { 
            text: `✅ গ্রুপের লিংক সফলভাবে রিসেট হয়েছে\n\n📌 নতুন লিংক:\nhttps://chat.whatsapp.com/${newCode}`
        });

    } catch (error) {
        console.error('Error in resetlink command:', error);
        await sock.sendMessage(chatId, { text: 'গ্রুপের লিংক রিসেট করা যায়নি!' });
    }
}

module.exports = resetlinkCommand; 