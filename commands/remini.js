const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadImage } = require('../lib/uploadImage');

async function getQuotedOrOwnImageUrl(sock, message) {
    // 1) Quoted image (highest priority)
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) {
        const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        return await uploadImage(buffer);
    }

    // 2) Image in the current message
    if (message.message?.imageMessage) {
        const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        return await uploadImage(buffer);
    }

    return null;
}

async function reminiCommand(sock, chatId, message, args) {
    try {
        let imageUrl = null;
        
        // Check if args contain a URL
        if (args.length > 0) {
            const url = args.join(' ');
            if (isValidUrl(url)) {
                imageUrl = url;
            } else {
                return sock.sendMessage(chatId, { 
                    text: '❌ ভুল URL দেওয়া হয়েছে।\n\nব্যবহার: `.remini <ছবির লিংক>`' 
                }, { quoted: message });
            }
        } else {
            // Try to get image from message or quoted message
            imageUrl = await getQuotedOrOwnImageUrl(sock, message);
            
            if (!imageUrl) {
                return sock.sendMessage(chatId, { 
                    text: '📸 *Remini AI দিয়ে ছবি উন্নত করুন*\n\nব্যবহার:\n• `.remini <ছবির লিংক>`\n• কোনো ছবিতে রিপ্লাই দিয়ে `.remini` লিখুন\n• `.remini` ক্যাপশন দিয়ে ছবি পাঠান' 
                }, { quoted: message });
            }
        }

        // Call the Remini API
        const apiUrl = `https://api.princetechn.com/api/tools/remini?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(imageUrl)}`;
        
        const response = await axios.get(apiUrl, {
            timeout: 60000, // 60 second timeout (AI processing takes longer)
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });


        if (response.data && response.data.success && response.data.result) {
            const result = response.data.result;
            
            if (result.image_url) {
                // Download the enhanced image
                const imageResponse = await axios.get(result.image_url, {
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
                
                if (imageResponse.status === 200 && imageResponse.data) {
                    // Send the enhanced image
                    await sock.sendMessage(chatId, {
                        image: imageResponse.data,
                        caption: '✨ *ছবির মান সফলভাবে উন্নত করা হয়েছে!*\n\n𝗘𝗡𝗛𝗔𝗡𝗖𝗘𝗗 𝗕𝗬 *Mahiru*'
                    }, { quoted: message });
                } else {
                    throw new Error('Failed to download enhanced image');
                }
            } else {
                throw new Error(result.message || 'Failed to enhance image');
            }
        } else {
            throw new Error('API returned invalid response');
        }

    } catch (error) {
        console.error('Remini Error:', error.message);
        
        let errorMessage = '❌ ছবির মান উন্নত করা যায়নি।';
        
        if (error.response?.status === 429) {
            errorMessage = '⏰ অনুরোধের সীমা শেষ হয়েছে। পরে আবার চেষ্টা করুন।';
        } else if (error.response?.status === 400) {
            errorMessage = '❌ Invalid image URL or format.';
        } else if (error.response?.status === 500) {
            errorMessage = '🔧 সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।';
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = '⏰ অনুরোধের সময় শেষ হয়েছে। আবার চেষ্টা করুন।';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            errorMessage = '🌐 নেটওয়ার্কে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করুন।';
        } else if (error.message.includes('Error processing image')) {
            errorMessage = '❌ ছবিটি প্রক্রিয়া করা যায়নি। অন্য ছবি দিয়ে চেষ্টা করুন।';
        }
        
        await sock.sendMessage(chatId, { 
            text: errorMessage 
        }, { quoted: message });
    }
}

// Helper function to validate URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = { reminiCommand };
