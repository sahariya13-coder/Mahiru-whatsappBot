const isAdmin = require('../lib/isAdmin');

async function unmuteCommand(sock, chatId, senderId) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'এই কমান্ডটি শুধু গ্রুপে ব্যবহার করা যাবে।' });
        return;
    }

    try {
        const status = await isAdmin(sock, chatId, senderId);
        if (!status.isBotAdmin) {
            await sock.sendMessage(chatId, { text: 'প্রথমে Mahiru-কে গ্রুপ অ্যাডমিন করুন।' });
            return;
        }
        if (!status.isSenderAdmin) {
            await sock.sendMessage(chatId, { text: 'শুধু গ্রুপ অ্যাডমিনরা গ্রুপের মিউট খুলতে পারবেন।' });
            return;
        }

        await sock.groupSettingUpdate(chatId, 'not_announcement');
        await sock.sendMessage(chatId, { text: '✅ গ্রুপের মিউট তুলে নেওয়া হয়েছে। এখন সবাই মেসেজ পাঠাতে পারবেন।' });
    } catch (error) {
        console.error('[Unmute] Error:', error);
        await sock.sendMessage(chatId, { text: '❌ গ্রুপের মিউট তোলা যায়নি। বটের অ্যাডমিন অনুমতি পরীক্ষা করুন।' });
    }
}

module.exports = unmuteCommand;
