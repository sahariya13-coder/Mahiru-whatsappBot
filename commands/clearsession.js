
const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

async function clearSessionCommand(sock, chatId, msg) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ This command can only be used by the owner!'
            });
            return;
        }

        // Define session directory
        const sessionDir = path.join(__dirname, '../session');

        if (!fs.existsSync(sessionDir)) {
            await sock.sendMessage(chatId, {
                text: '❌ Session directory not found!'
            });
            return;
        }

        let filesCleared = 0;
        let errors = 0;
        const errorDetails = [];

        // Send initial status
        await sock.sendMessage(chatId, {
            text: '🔍 Optimizing session files for better performance...'
        });

        const files = fs.readdirSync(sessionDir);

        // Count files by type
        let appStateSyncCount = 0;
        let preKeyCount = 0;

        for (const file of files) {
            if (file.startsWith('app-state-sync-')) {
                appStateSyncCount++;
            }

            if (file.startsWith('pre-key-')) {
                preKeyCount++;
            }
        }

        // Delete session files except creds.json
        for (const file of files) {
            if (file === 'creds.json') {
                continue;
            }

            try {
                const filePath = path.join(sessionDir, file);
                const stats = fs.lstatSync(filePath);

                // Delete files only, not directories
                if (stats.isFile()) {
                    fs.unlinkSync(filePath);
                    filesCleared++;
                }
            } catch (error) {
                errors++;
                errorDetails.push(
                    `Failed to delete ${file}: ${error.message}`
                );
            }
        }

        // Completion message
        const resultMessage =
            `✅ Session files cleared successfully!\n\n` +
            `📊 Statistics:\n` +
            `• Total files cleared: ${filesCleared}\n` +
            `• App state sync files: ${appStateSyncCount}\n` +
            `• Pre-key files: ${preKeyCount}\n` +
            (
                errors > 0
                    ? `\n⚠️ Errors encountered: ${errors}\n${errorDetails.join('\n')}`
                    : ''
            );

        await sock.sendMessage(chatId, {
            text: resultMessage
        });

    } catch (error) {
        console.error('Error in clearsession command:', error);

        await sock.sendMessage(chatId, {
            text: '❌ Failed to clear session files!'
        });
    }
}

module.exports = clearSessionCommand;
