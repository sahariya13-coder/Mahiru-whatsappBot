const settings = require("../settings");
async function aliveCommand(sock, chatId, message) {
    try {
        const message1 = `*🤖 Mahiru Shiina চালু আছে!*\n\n` +
                       `*সংস্করণ:* ${settings.version}\n` +
                       `*অবস্থা:* অনলাইন\n` +
                       `*মোড:* সবার জন্য উন্মুক্ত\n\n` +
                       `*🌟 সুবিধাসমূহ:*\n` +
                       `• গ্রুপ পরিচালনা\n` +
                       `• লিংক প্রতিরোধ\n` +
                       `• বিনোদনমূলক কমান্ড\n` +
                       `• আরও অনেক কিছু!\n\n` +
                       `সব কমান্ড দেখতে *.menu* লিখুন`;

        await sock.sendMessage(chatId, {
            text: message1,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,}
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: 'বট চালু আছে এবং কাজ করছে!' }, { quoted: message });
    }
}

module.exports = aliveCommand;