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

module.exports = {
    name: 'removebg',
    alias: ['rmbg', 'nobg'],
    category: 'general',
    desc: 'Remove background from images',
    async exec(sock, message, args) {
        try {
            const chatId = message.key.remoteJid;
            let imageUrl = null;
            
            // Check if args contain a URL
            if (args.length > 0) {
                const url = args.join(' ');
                if (isValidUrl(url)) {
                    imageUrl = url;
                } else {
                    return sock.sendMessage(chatId, { 
                        text: '❌ ভুল URL দেওয়া হয়েছে।\n\nব্যবহার: `.removebg <ছবির লিংক>`' 
                    }, { quoted: message });
                }
            } else {
                // Try to get image from message or quoted message
                imageUrl = await getQuotedOrOwnImageUrl(sock, message);
                
                if (!imageUrl) {
                    return sock.sendMessage(chatId, { 
                        text: '📸 *ছবির ব্যাকগ্রাউন্ড সরান*\n\nব্যবহার:\n• `.removebg <ছবির লিংক>`\n• কোনো ছবিতে রিপ্লাই দিয়ে `.removebg` লিখুন\n• `.removebg` ক্যাপশন দিয়ে ছবি পাঠান' 
                    }, { quoted: message });
                }
            }

        
            // Call the remove background API
            const apiUrl = `https://api.siputzx.my.id/api/iloveimg/removebg?image=${encodeURIComponent(imageUrl)}`;
            
            const response = await axios.get(apiUrl, {
                responseType: 'arraybuffer',
                timeout: 30000, // 30 second timeout
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.status === 200 && response.data) {
                // Send the processed image
                await sock.sendMessage(chatId, {
                    image: response.data,
                    caption: '✨ *ছবির ব্যাকগ্রাউন্ড সফলভাবে সরানো হয়েছে!*\n\n𝗣𝗥𝗢𝗖𝗘𝗦𝗦𝗘𝗗 𝗕𝗬 *Mahiru*'
                }, { quoted: message });
            } else {
                throw new Error('Failed to process image');
            }

        } catch (error) {
            console.error('RemoveBG Error:', error.message);
            
            let errorMessage = '❌ ছবির ব্যাকগ্রাউন্ড সরানো যায়নি।';
            
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
            }
            
            await sock.sendMessage(chatId, { 
                text: errorMessage 
            }, { quoted: message });
        }
    }
};

// Helper function to validate URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}
