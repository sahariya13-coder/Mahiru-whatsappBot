
const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

// Path to store auto status configuration
const configPath = path.join(__dirname, '../data/autoStatus.json');

// Initialize config file if it doesn't exist
if (!fs.existsSync(configPath)) {
    const dir = path.dirname(configPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
        configPath,
        JSON.stringify({
            enabled: false,
            reactOn: false
        }, null, 2)
    );
}

async function autoStatusCommand(sock, chatId, msg, args) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ এই কমান্ডটি শুধু বটের মালিক ব্যবহার করতে পারবেন।'
            });
            return;
        }

        // Read current config
        let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (!config || typeof config !== 'object') {
            config = { enabled: false, reactOn: false };
        }

        if (typeof config.enabled !== 'boolean') {
            config.enabled = false;
        }

        if (typeof config.reactOn !== 'boolean') {
            config.reactOn = false;
        }

        // If no arguments, show current status
        if (!args || args.length === 0) {
            const status = config.enabled ? 'চালু' : 'বন্ধ';
            const reactStatus = config.reactOn ? 'চালু' : 'বন্ধ';

            await sock.sendMessage(chatId, {
                text:
                    `🔄 *স্বয়ংক্রিয় স্ট্যাটাস সেটিংস*\n\n` +
                    `📱 *স্বয়ংক্রিয় স্ট্যাটাস দেখা:* ${status}\n` +
                    `💫 *স্ট্যাটাসে রিঅ্যাকশন:* ${reactStatus}\n\n` +
                    `*কমান্ডসমূহ:*\n` +
                    `.autostatus on — স্বয়ংক্রিয়ভাবে স্ট্যাটাস দেখা চালু\n` +
                    `.autostatus off — স্বয়ংক্রিয়ভাবে স্ট্যাটাস দেখা বন্ধ\n` +
                    `.autostatus react on — স্ট্যাটাসে রিঅ্যাকশন চালু\n` +
                    `.autostatus react off — স্ট্যাটাসে রিঅ্যাকশন বন্ধ`
            });
            return;
        }

        // Handle on/off commands
        const command = String(args[0]).toLowerCase();

        if (command === 'on') {
            config.enabled = true;

            fs.writeFileSync(
                configPath,
                JSON.stringify(config, null, 2)
            );

            await sock.sendMessage(chatId, {
                text:
                    '✅ স্বয়ংক্রিয় স্ট্যাটাস দেখা চালু হয়েছে!\n' +
                    'এখন থেকে বট স্বয়ংক্রিয়ভাবে সবার স্ট্যাটাস দেখবে।'
            });

        } else if (command === 'off') {
            config.enabled = false;

            fs.writeFileSync(
                configPath,
                JSON.stringify(config, null, 2)
            );

            await sock.sendMessage(chatId, {
                text:
                    '❌ স্বয়ংক্রিয় স্ট্যাটাস দেখা বন্ধ হয়েছে!\n' +
                    'এখন থেকে বট আর স্বয়ংক্রিয়ভাবে স্ট্যাটাস দেখবে না।'
            });

        } else if (command === 'react') {
            // Handle react subcommand
            if (!args[1]) {
                await sock.sendMessage(chatId, {
                    text:
                        '❌ রিঅ্যাকশন চালু বা বন্ধ নির্ধারণ করুন!\n' +
                        'ব্যবহার: .autostatus react on/off'
                });
                return;
            }

            const reactCommand = String(args[1]).toLowerCase();

            if (reactCommand === 'on') {
                config.reactOn = true;

                fs.writeFileSync(
                    configPath,
                    JSON.stringify(config, null, 2)
                );

                await sock.sendMessage(chatId, {
                    text:
                        '💫 স্ট্যাটাসে রিঅ্যাকশন চালু হয়েছে!\n' +
                        'এখন থেকে বট স্ট্যাটাসে রিঅ্যাকশন দেবে।'
                });

            } else if (reactCommand === 'off') {
                config.reactOn = false;

                fs.writeFileSync(
                    configPath,
                    JSON.stringify(config, null, 2)
                );

                await sock.sendMessage(chatId, {
                    text:
                        '❌ স্ট্যাটাসে রিঅ্যাকশন বন্ধ হয়েছে!\n' +
                        'এখন থেকে বট স্ট্যাটাসে রিঅ্যাকশন দেবে না।'
                });

            } else {
                await sock.sendMessage(chatId, {
                    text:
                        '❌ ভুল রিঅ্যাকশন কমান্ড! ব্যবহার করুন: ' +
                        '.autostatus react on/off'
                });
            }

        } else {
            await sock.sendMessage(chatId, {
                text:
                    '❌ ভুল কমান্ড! ব্যবহার করুন:\n' +
                    '.autostatus on/off — স্বয়ংক্রিয় স্ট্যাটাস দেখা চালু/বন্ধ\n' +
                    '.autostatus react on/off — স্ট্যাটাসে রিঅ্যাকশন চালু/বন্ধ'
            });
        }

    } catch (error) {
        console.error('Error in autostatus command:', error);

        await sock.sendMessage(chatId, {
            text: '❌ স্বয়ংক্রিয় স্ট্যাটাস পরিচালনায় সমস্যা হয়েছে!\n' + error.message
        });
    }
}

// Function to check if auto status is enabled
function isAutoStatusEnabled() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.enabled === true;
    } catch (error) {
        console.error('Error checking auto status config:', error);
        return false;
    }
}

// Function to check if status reactions are enabled
function isStatusReactionEnabled() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.reactOn === true;
    } catch (error) {
        console.error('Error checking status reaction config:', error);
        return false;
    }
}

// Function to react to status
async function reactToStatus(sock, statusKey) {
    try {
        if (!isStatusReactionEnabled()) {
            return;
        }

        await sock.relayMessage(
            'status@broadcast',
            {
                reactionMessage: {
                    key: {
                        remoteJid: 'status@broadcast',
                        id: statusKey.id,
                        participant: statusKey.participant || statusKey.remoteJid,
                        fromMe: false
                    },
                    text: '💚'
                }
            },
            {
                messageId: statusKey.id,
                statusJidList: [
                    statusKey.remoteJid,
                    statusKey.participant || statusKey.remoteJid
                ]
            }
        );

    } catch (error) {
        console.error('❌ Error reacting to status:', error.message);
    }
}

// Function to handle status updates
async function handleStatusUpdate(sock, status) {
    try {
        if (!isAutoStatusEnabled()) {
            return;
        }

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Handle status from messages.upsert
        if (status.messages && status.messages.length > 0) {
            const msg = status.messages[0];

            if (msg.key && msg.key.remoteJid === 'status@broadcast') {
                try {
                    await sock.readMessages([msg.key]);

                    // React to status if enabled
                    await reactToStatus(sock, msg.key);

                } catch (err) {
                    if (err.message?.includes('rate-overlimit')) {
                        console.log('⚠️ Rate limit hit, waiting before retrying...');

                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await sock.readMessages([msg.key]);
                    } else {
                        throw err;
                    }
                }

                return;
            }
        }

        // Handle direct status updates
        if (status.key && status.key.remoteJid === 'status@broadcast') {
            try {
                await sock.readMessages([status.key]);

                // React to status if enabled
                await reactToStatus(sock, status.key);

            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');

                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.key]);
                } else {
                    throw err;
                }
            }

            return;
        }

        // Handle status in reactions
        if (
            status.reaction &&
            status.reaction.key?.remoteJid === 'status@broadcast'
        ) {
            try {
                await sock.readMessages([status.reaction.key]);

                // React to status if enabled
                await reactToStatus(sock, status.reaction.key);

            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');

                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.reaction.key]);
                } else {
                    throw err;
                }
            }

            return;
        }

    } catch (error) {
        console.error('❌ Error in auto status view:', error.message);
    }
}

module.exports = {
    autoStatusCommand,
    handleStatusUpdate
};
