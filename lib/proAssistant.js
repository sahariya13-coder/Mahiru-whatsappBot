const fs = require('fs');
const path = require('path');

// ইউজার প্রতি স্টিকার কুলডাউন ট্র্যাকার (৬ ঘণ্টা)
const stickerCooldown = new Map();
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

// ১. AI-এর টেক্সটকে হোয়াটসঅ্যাপ ফরম্যাটে অটো-কনভার্ট করা
function formatWhatsAppText(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '*$1*')       // **bold** -> *bold*
        .replace(/^###\s*(.*)$/gm, '*$1*')       // ### Heading -> *Heading*
        .replace(/^##\s*(.*)$/gm, '*$1*')        // ## Heading -> *Heading*
        .replace(/^\*\s+/gm, '🔹 ')              // * list -> 🔹 list
        .replace(/^-\s+/gm, '• ')                // - list -> • list
        .trim();
}

// ২. মেসেজের ধরন বুঝে স্মার্ট ইমোজি রিঅ্যাকশন বাছাই
function getSmartReaction(userMsg = '') {
    const msg = userMsg.toLowerCase();
    if (/(hi|hello|salam|assalamu|হাই|হ্যালো|সালাম)/.test(msg)) return '👋';
    if (/(root|rom|magisk|kernelsu|web|app|bot|code|রুট|ওয়েবসাইট|সফটওয়্যার)/.test(msg)) return '⚡';
    if (/(thanks|thank|ধন্যবাদ|ভালো|nice|good|awesome)/.test(msg)) return '🤍';
    if (/(urgent|emergency|জরুরি|কল|call)/.test(msg)) return '📌';
    return '✨';
}

// ৩. অটো-সিআরএম: কাজের ক্লায়েন্ট বা জরুরি মেসেজ data/leads.json-এ সেভ করা
function saveLeadIfImportant(senderJid, pushName, userMsg) {
    const isImportant = /(root|rom|website|web|app|bot|software|price|tk|taka|urgent|রুট|ওয়েবসাইট|সফটওয়্যার|দাম|কাজ|জরুরি)/i.test(userMsg);
    if (!isImportant) return false;

    const leadsPath = path.join(__dirname, '../data/leads.json');
    let leads = [];
    if (fs.existsSync(leadsPath)) {
        try { leads = JSON.parse(fs.readFileSync(leadsPath, 'utf-8')); } catch {}
    }

    leads.push({
        name: pushName || 'Unknown',
        number: senderJid.split('@')[0],
        message: userMsg,
        time: new Date().toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })
    });

    // সর্বশেষ ২০০টি লিড সংরক্ষণ
    if (leads.length > 200) leads = leads.slice(-200);
    fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
    return true;
}

// ৪. মূল প্রিমিয়াম রিপ্লাই সেন্ডার ফাংশন
async function sendProReply(sock, chatId, message, userMessage, aiReplyText) {
    const senderJid = message.key.participant || chatId;
    const pushName = message.pushName || 'User';

    // ক) স্মার্ট রিঅ্যাকশন পাঠানো
    const reactEmoji = getSmartReaction(userMessage);
    await sock.sendMessage(chatId, {
        react: { text: reactEmoji, key: message.key }
    }).catch(() => {});

    // খ) মানুষের মতো টাইপিং এনিমেশন (১.৫ সেকেন্ড)
    await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1500));

    // গ) ফরম্যাট ঠিক করে রিচ কার্ডসহ মেসেজ পাঠানো
    const cleanReply = formatWhatsAppText(aiReplyText);
    const thumbPath = path.join(__dirname, '../assets/bot_image.jpg');
    const thumbnail = fs.existsSync(thumbPath) ? fs.readFileSync(thumbPath) : undefined;

    await sock.sendMessage(chatId, {
        text: cleanReply,
        contextInfo: {
            externalAdReply: {
                title: 'Mahiru Shiina • Personal Assistant',
                body: 'Web, Software & Android Customization',
                mediaType: 1,
                thumbnail: thumbnail,
                sourceUrl: 'https://github.com/sahariya13-coder/Mahiru-whatsappBot',
                renderLargerThumbnail: false
            }
        }
    }, { quoted: message });

    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});

    // ঘ) হাই/সালাম দিলে ৬ ঘণ্টায় একবার অটো স্টিকার পাঠানো
    const lastSent = stickerCooldown.get(senderJid) || 0;
    if (/^(hi|hello|hey|salam|assalamu|হাই|হ্যালো|সালাম)/i.test(userMessage.trim()) && (Date.now() - lastSent > COOLDOWN_MS)) {
        const stickerPath = path.join(__dirname, '../assets/stickintro.webp');
        if (fs.existsSync(stickerPath)) {
            await sock.sendMessage(chatId, {
                sticker: fs.readFileSync(stickerPath)
            });
            stickerCooldown.set(senderJid, Date.now());
        }
    }

    // ঙ) কাজের বা জরুরি মেসেজ হলে CRM-এ সেভ করা
    saveLeadIfImportant(senderJid, pushName, userMessage);
}

module.exports = { sendProReply, formatWhatsAppText, saveLeadIfImportant };
