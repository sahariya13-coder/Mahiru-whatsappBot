const axios = require('axios');
const { fetchBuffer } = require('../lib/myfunc');

async function imagineCommand(sock, chatId, message) {
    try {
        // Get the prompt from the message
        const prompt = message.message?.conversation?.trim() || 
                      message.message?.extendedTextMessage?.text?.trim() || '';
        
        // Remove the command prefix and trim
        const imagePrompt = prompt.slice(8).trim();
        
        if (!imagePrompt) {
            await sock.sendMessage(chatId, {
                text: 'ছবি তৈরির বর্ণনা দিন।\nউদাহরণ: .imagine পাহাড়ের ওপর সুন্দর সূর্যাস্ত'
            }, {
                quoted: message
            });
            return;
        }

        // Send processing message
        await sock.sendMessage(chatId, {
            text: '🎨 আপনার ছবি তৈরি হচ্ছে... অপেক্ষা করুন।'
        }, {
            quoted: message
        });

        // Enhance the prompt with quality keywords
        const enhancedPrompt = enhancePrompt(imagePrompt);

        // Make API request
        const response = await axios.get(`https://shizoapi.onrender.com/api/ai/imagine?apikey=shizo&query=${encodeURIComponent(enhancedPrompt)}`, {
            responseType: 'arraybuffer'
        });

        // Convert response to buffer
        const imageBuffer = Buffer.from(response.data);

        // Send the generated image
        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption: `🎨 আপনার বর্ণনা অনুযায়ী তৈরি ছবি: "${imagePrompt}"`
        }, {
            quoted: message
        });

    } catch (error) {
        console.error('Error in imagine command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ ছবি তৈরি করা যায়নি। পরে আবার চেষ্টা করুন।'
        }, {
            quoted: message
        });
    }
}

// Function to enhance the prompt
function enhancePrompt(prompt) {
    // Quality enhancing keywords
    const qualityEnhancers = [
        'high quality',
        'detailed',
        'masterpiece',
        'best quality',
        'ultra realistic',
        '4k',
        'highly detailed',
        'professional photography',
        'cinematic lighting',
        'sharp focus'
    ];

    // Randomly select 3-4 enhancers
    const numEnhancers = Math.floor(Math.random() * 2) + 3; // Random number between 3-4
    const selectedEnhancers = qualityEnhancers
        .sort(() => Math.random() - 0.5)
        .slice(0, numEnhancers);

    // Combine original prompt with enhancers
    return `${prompt}, ${selectedEnhancers.join(', ')}`;
}

module.exports = imagineCommand; 