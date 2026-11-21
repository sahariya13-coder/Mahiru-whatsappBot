const axios = require('axios');

module.exports = async function (sock, chatId, message) {
    try {
        const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=bn');
        const fact = response.data.text;
        await sock.sendMessage(chatId, { text: fact },{ quoted: message });
    } catch (error) {
        console.error('Error fetching fact:', error);
        await sock.sendMessage(chatId, { text: 'দুঃখিত, এই মুহূর্তে কোনো তথ্য আনা যাচ্ছে না।' },{ quoted: message });
    }
};
