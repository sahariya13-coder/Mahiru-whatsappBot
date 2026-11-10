const { handleWelcome } = require('../lib/welcome');
const { isWelcomeOn, getWelcome } = require('../lib/index');

async function welcomeCommand(sock, chatId, message, match) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, {
            text: '❌ This command can only be used in groups.',
            quoted: message
        });
    }

    const text =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        '';

    const matchText = text.trim().split(/\s+/).slice(1).join(' ');

    await handleWelcome(sock, chatId, message, matchText);
}

async function handleJoinEvent(sock, id, participants) {
    try {
        if (!id.endsWith('@g.us')) return;

        const enabled = await isWelcomeOn(id);
        if (!enabled) return;

        const customMessage = await getWelcome(id);
        const groupMetadata = await sock.groupMetadata(id);

        const groupName = groupMetadata.subject || 'Our Group';
        const groupDesc = groupMetadata.desc || 'No description available';

        for (const participant of participants) {
            const jid = typeof participant === 'string'
                ? participant
                : participant.id;

            if (!jid) continue;

            const user = jid.split('@')[0];
            const displayName = `@${user}`;

            const finalMessage = customMessage
                .replace(/{user}/gi, displayName)
                .replace(/{group}/gi, groupName)
                .replace(/{description}/gi, groupDesc);

            await sock.sendMessage(id, {
                text: finalMessage,
                mentions: [jid]
            });
        }
    } catch (error) {
        console.error('Welcome Join Event Error:', error);
    }
}

module.exports = {
    welcomeCommand,
    handleJoinEvent
};
