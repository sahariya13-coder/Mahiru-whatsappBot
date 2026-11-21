const fetch = require('node-fetch');

async function rosedayCommand(sock, chatId, message) {
    try {
        
        const res = await fetch(`https://api.princetechn.com/api/fun/roseday?apikey=prince`);
        
        if (!res.ok) {
            throw await res.text();
        }
        
        const json = await res.json();
        const rosedayMessage = json.result;

        // Send the roseday message
        await sock.sendMessage(chatId, { text: rosedayMessage }, { quoted: message });
    } catch (error) {
        console.error('Error in roseday command:', error);
        await sock.sendMessage(chatId, { text: '❌ গোলাপ দিবসের উক্তি পাওয়া যায়নি। পরে আবার চেষ্টা করুন!' }, { quoted: message });
    }
}

module.exports = { rosedayCommand };
