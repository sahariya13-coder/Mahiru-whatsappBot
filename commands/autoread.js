/**
 * Mahiru Bot - Autoread Command
 * Automatically read all messages
 */

const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

// Path to store the configuration
const configPath = path.join(__dirname, '..', 'data', 'autoread.json');

// Initialize configuration file if it doesn't exist
function initConfig() {
    const dataDir = path.dirname(configPath);

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Toggle autoread feature
async function autoreadCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ এই কমান্ডটি শুধু বটের মালিক ব্যবহার করতে পারবেন।'
            });
            return;
        }

        // Get command arguments
        const args =
            message.message?.conversation?.trim().split(' ').slice(1) ||
            message.message?.extendedTextMessage?.text?.trim().split(' ').slice(1) ||
            [];

        // Initialize or read config
        const config = initConfig();

        // Toggle based on argument or current state
        if (args.length > 0) {
            const action = args[0].toLowerCase();

            if (action === 'on' || action === 'enable') {
                config.enabled = true;
            } else if (action === 'off' || action === 'disable') {
                config.enabled = false;
            } else {
                await sock.sendMessage(chatId, {
                    text: '❌ ভুল অপশন! .autoread on/off ব্যবহার করুন।'
                });
                return;
            }
        } else {
            config.enabled = !config.enabled;
        }

        // Save updated configuration
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        // Send confirmation message
        await sock.sendMessage(chatId, {
            text: `✅ স্বয়ংক্রিয় মেসেজ পড়া ${config.enabled ? 'চালু' : 'বন্ধ'} করা হয়েছে!`
        });

    } catch (error) {
        console.error('Error in autoread command:', error);

        await sock.sendMessage(chatId, {
            text: '❌ কমান্ডটি চালাতে সমস্যা হয়েছে!'
        });
    }
}

// Function to check if autoread is enabled
function isAutoreadEnabled() {
    try {
        const config = initConfig();
        return config.enabled;
    } catch (error) {
        console.error('Error checking autoread status:', error);
        return false;
    }
}

// Function to check if bot is mentioned in a message
function isBotMentionedInMessage(message, botNumber) {
    if (!message.message) return false;

    const messageTypes = [
        'extendedTextMessage',
        'imageMessage',
        'videoMessage',
        'stickerMessage',
        'documentMessage',
        'audioMessage',
        'contactMessage',
        'locationMessage'
    ];

    // Check for explicit mentions
    for (const type of messageTypes) {
        if (message.message[type]?.contextInfo?.mentionedJid) {
            const mentionedJid = message.message[type].contextInfo.mentionedJid;

            if (mentionedJid.some(jid => jid === botNumber)) {
                return true;
            }
        }
    }

    // Check for text mentions
    const textContent =
        message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        message.message.imageMessage?.caption ||
        message.message.videoMessage?.caption ||
        '';

    if (textContent) {
        const botUsername = botNumber.split('@')[0];

        if (textContent.includes(`@${botUsername}`)) {
            return true;
        }

        const botNames = [
            global.botname?.toLowerCase(),
            'bot',
            'mahiru shiina',
            'Mahiru Shiina'
        ];

        const words = textContent.toLowerCase().split(/\s+/);

        if (botNames.some(name => name && words.includes(name))) {
            return true;
        }
    }

    return false;
}

// Function to handle autoread functionality
async function handleAutoread(sock, message) {
    if (isAutoreadEnabled()) {
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        const isBotMentioned = isBotMentionedInMessage(message, botNumber);

        if (isBotMentioned) {
            return false;
        } else {
            const key = {
                remoteJid: message.key.remoteJid,
                id: message.key.id,
                participant: message.key.participant
            };

            await sock.readMessages([key]);

            return true;
        }
    }

    return false;
}

module.exports = {
    autoreadCommand,
    isAutoreadEnabled,
    isBotMentionedInMessage,
    handleAutoread
};
