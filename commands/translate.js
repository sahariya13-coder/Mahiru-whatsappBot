const fetch = require('node-fetch');

async function handleTranslateCommand(sock, chatId, message, match) {
    try {
        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        let textToTranslate = '';
        let lang = '';

        // Check if it's a reply
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage) {
            // Get text from quoted message
            textToTranslate = quotedMessage.conversation || 
                            quotedMessage.extendedTextMessage?.text || 
                            quotedMessage.imageMessage?.caption || 
                            quotedMessage.videoMessage?.caption || 
                            '';

            // Get language from command
            lang = match.trim();
        } else {
            // Parse command arguments for direct message
            const args = match.trim().split(' ');
            if (args.length < 2) {
                return sock.sendMessage(chatId, {
                    text: `*অনুবাদক*\n\nব্যবহার:\n১. কোনো মেসেজে রিপ্লাই দিয়ে লিখুন: .translate <ভাষার কোড> অথবা .trt <ভাষার কোড>\n২. অথবা লিখুন: .translate <লেখা> <ভাষার কোড>\n\nউদাহরণ:\n.translate hello bn\n.trt hello bn\n\nভাষার কোড:\nbn — বাংলা\nen — ইংরেজি\nes — স্প্যানিশ\nde — জার্মান\nit — ইতালিয়ান\npt — পর্তুগিজ\nru — রুশ\nja — জাপানি\nko — কোরিয়ান\nzh — চীনা\nar — আরবি\nhi — হিন্দি`,
                    quoted: message
                });
            }

            lang = args.pop(); // Get language code
            textToTranslate = args.join(' '); // Get text to translate
        }

        if (!textToTranslate) {
            return sock.sendMessage(chatId, {
                text: '❌ অনুবাদের জন্য কোনো লেখা পাওয়া যায়নি। লেখা দিন অথবা কোনো মেসেজে রিপ্লাই করুন।',
                quoted: message
            });
        }

        // Try multiple translation APIs in sequence
        let translatedText = null;
        let error = null;

        // Try API 1 (Google Translate API)
        try {
            const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(textToTranslate)}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data[0] && data[0][0] && data[0][0][0]) {
                    translatedText = data[0][0][0];
                }
            }
        } catch (e) {
            error = e;
        }

        // If API 1 fails, try API 2
        if (!translatedText) {
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=auto|${lang}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.responseData && data.responseData.translatedText) {
                        translatedText = data.responseData.translatedText;
                    }
                }
            } catch (e) {
                error = e;
            }
        }

        // If API 2 fails, try API 3
        if (!translatedText) {
            try {
                const response = await fetch(`https://api.dreaded.site/api/translate?text=${encodeURIComponent(textToTranslate)}&lang=${lang}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.translated) {
                        translatedText = data.translated;
                    }
                }
            } catch (e) {
                error = e;
            }
        }

        if (!translatedText) {
            throw new Error('All translation APIs failed');
        }

        // Send translation
        await sock.sendMessage(chatId, {
            text: `${translatedText}`,
        }, {
            quoted: message
        });

    } catch (error) {
        console.error('❌ Error in translate command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ লেখা অনুবাদ করা যায়নি। পরে আবার চেষ্টা করুন।\n\nব্যবহার:\n১. কোনো মেসেজে রিপ্লাই দিয়ে .translate <ভাষার কোড> লিখুন\n২. অথবা .translate <লেখা> <ভাষার কোড> লিখুন',
            quoted: message
        });
    }
}

module.exports = {
    handleTranslateCommand
}; 