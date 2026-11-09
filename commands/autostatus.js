
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
                text: '❌ This command can only be used by the owner!'
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
            const status = config.enabled ? 'enabled' : 'disabled';
            const reactStatus = config.reactOn ? 'enabled' : 'disabled';

            await sock.sendMessage(chatId, {
                text:
                    `🔄 *Auto Status Settings*\n\n` +
                    `📱 *Auto Status View:* ${status}\n` +
                    `💫 *Status Reactions:* ${reactStatus}\n\n` +
                    `*Commands:*\n` +
                    `.autostatus on - Enable auto status view\n` +
                    `.autostatus off - Disable auto status view\n` +
                    `.autostatus react on - Enable status reactions\n` +
                    `.autostatus react off - Disable status reactions`
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
                    '✅ Auto status view has been enabled!\n' +
                    'Bot will now automatically view all contact statuses.'
            });

        } else if (command === 'off') {
            config.enabled = false;

            fs.writeFileSync(
                configPath,
                JSON.stringify(config, null, 2)
            );

            await sock.sendMessage(chatId, {
                text:
                    '❌ Auto status view has been disabled!\n' +
                    'Bot will no longer automatically view statuses.'
            });

        } else if (command === 'react') {
            // Handle react subcommand
            if (!args[1]) {
                await sock.sendMessage(chatId, {
                    text:
                        '❌ Please specify on/off for reactions!\n' +
                        'Use: .autostatus react on/off'
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
                        '💫 Status reactions have been enabled!\n' +
                        'Bot will now react to status updates.'
                });

            } else if (reactCommand === 'off') {
                config.reactOn = false;

                fs.writeFileSync(
                    configPath,
                    JSON.stringify(config, null, 2)
                );

                await sock.sendMessage(chatId, {
                    text:
                        '❌ Status reactions have been disabled!\n' +
                        'Bot will no longer react to status updates.'
                });

            } else {
                await sock.sendMessage(chatId, {
                    text:
                        '❌ Invalid reaction command! Use: ' +
                        '.autostatus react on/off'
                });
            }

        } else {
            await sock.sendMessage(chatId, {
                text:
                    '❌ Invalid command! Use:\n' +
                    '.autostatus on/off - Enable/disable auto status view\n' +
                    '.autostatus react on/off - Enable/disable status reactions'
            });
        }

    } catch (error) {
        console.error('Error in autostatus command:', error);

        await sock.sendMessage(chatId, {
            text: '❌ Error occurred while managing auto status!\n' + error.message
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
