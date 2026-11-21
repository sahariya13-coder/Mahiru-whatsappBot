const fetch = require('node-fetch');

async function handleSsCommand(sock, chatId, message, match) {
    if (!match) {
        await sock.sendMessage(chatId, {
            text: `*ওয়েবসাইটের স্ক্রিনশট*\n\n*.ss <লিংক>*\n*.ssweb <লিংক>*\n*.screenshot <লিংক>*\n\nযেকোনো ওয়েবসাইটের স্ক্রিনশট নিন।\n\nউদাহরণ:\n.ss https://google.com\n.ssweb https://google.com\n.screenshot https://google.com`,
            quoted: message
        });
        return;
    }

    try {
        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        // Extract URL from command
        const url = match.trim();
        
        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return sock.sendMessage(chatId, {
                text: '❌ http:// অথবা https:// দিয়ে শুরু হওয়া সঠিক লিংক দিন।',
                quoted: message
            });
        }

        // Call the API
        const apiUrl = `https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(url)}&theme=light&device=desktop`;
        const response = await fetch(apiUrl, { headers: { 'accept': '*/*' } });
        
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        // Get the image buffer
        const imageBuffer = await response.buffer();

        // Send the screenshot
        await sock.sendMessage(chatId, {
            image: imageBuffer,
        }, {
            quoted: message
        });

    } catch (error) {
        console.error('❌ Error in ss command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ স্ক্রিনশট নেওয়া যায়নি। কয়েক মিনিট পর আবার চেষ্টা করুন।\n\nসম্ভাব্য কারণ:\n• ভুল লিংক\n• ওয়েবসাইট স্ক্রিনশট নেওয়া বন্ধ রেখেছে\n• ওয়েবসাইটটি বন্ধ\n• API সেবা সাময়িকভাবে অচল',
            quoted: message
        });
    }
}

module.exports = {
    handleSsCommand
}; 