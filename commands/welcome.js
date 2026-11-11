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

// Remove the device part from Baileys JIDs before using them as mentions.
function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '');
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
                : participant?.id || participant?.jid;

            if (!jid) continue;

            const mentionJid = normalizeJid(jid);
            const mentionToken = `@${mentionJid.split('@')[0].split(':')[0]}`;

            let finalMessage = String(customMessage || '');

            // {user} is the recommended placeholder. Older custom messages
            // may contain a fixed @Name instead, which is not a real mention.
            if (/{user}/i.test(finalMessage)) {
                finalMessage = finalMessage.replace(/{user}/gi, mentionToken);
            } else if (/@[\w.-]+/.test(finalMessage)) {
                // Turn the first existing @Name into a real mention of the joiner.
                finalMessage = finalMessage.replace(/@[\w.-]+/, mentionToken);
            } else if (/স্বাগতম/i.test(finalMessage)) {
                finalMessage = finalMessage.replace(/(স্বাগতম\s*)/i, `$1${mentionToken}!`);
            } else {
                finalMessage += `\n\n🌸 স্বাগতম ${mentionToken}!`;
            }

            finalMessage = finalMessage
                .replace(/{group}/gi, groupName)
                .replace(/{description}/gi, groupDesc);

            await sock.sendMessage(id, {
                text: finalMessage,
                mentions: [mentionJid]
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
