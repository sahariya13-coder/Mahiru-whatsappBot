const axios = require('axios');
const settings = require('../settings'); // Assuming the API key is stored here

async function gifCommand(sock, chatId, query) {
    const apiKey = settings.giphyApiKey; // Replace with your Giphy API Key

    if (!apiKey) {
        await sock.sendMessage(chatId, { text: 'GIF সার্চ চালু করতে Hosting Panel-এ GIPHY_API_KEY যোগ করুন।' });
        return;
    }

    if (!query) {
        await sock.sendMessage(chatId, { text: 'GIF খুঁজতে একটি শব্দ লিখুন।' });
        return;
    }

    try {
        const response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
            params: {
                api_key: apiKey,
                q: query,
                limit: 1,
                rating: 'g'
            }
        });

        const gifUrl = response.data.data[0]?.images?.downsized_medium?.url;

        if (gifUrl) {
            await sock.sendMessage(chatId, { video: { url: gifUrl }, caption: `আপনার GIF: "${query}"` });
        } else {
            await sock.sendMessage(chatId, { text: 'আপনার দেওয়া শব্দে কোনো GIF পাওয়া যায়নি।' });
        }
    } catch (error) {
        console.error('Error fetching GIF:', error);
        await sock.sendMessage(chatId, { text: 'GIF আনা যায়নি। পরে আবার চেষ্টা করুন।' });
    }
}

module.exports = gifCommand;
