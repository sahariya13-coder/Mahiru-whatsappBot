async function clearCommand(sock, chatId) {
    try {
        const message = await sock.sendMessage(chatId, { text: 'বটের মেসেজগুলো মুছে ফেলা হচ্ছে...' });
        const messageKey = message.key; // Get the key of the message the bot just sent
        
        // Now delete the bot's message
        await sock.sendMessage(chatId, { delete: messageKey });
        
    } catch (error) {
        console.error('Error clearing messages:', error);
        await sock.sendMessage(chatId, { text: 'মেসেজ মুছতে সমস্যা হয়েছে।' });
    }
}

module.exports = { clearCommand };
