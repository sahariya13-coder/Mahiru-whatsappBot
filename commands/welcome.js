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

    const matchText = text.trim().split(/\\s+/).slice(1).join(' ');

    await handleWelcome(sock, chatId, message, matchText);
}

// Remove the device part from Baileys JIDs before comparing them.
function normalizeJid(jid) {
    return String(jid || '').replace(/:\\d+(?=@)/, '');
}

// A phone number is not a display name. Do not show it as the fallback.
function isPhoneNumber(value) {
    const digits = String(value || '').replace(/\\D/g, '');
    return digits.length >= 7 && digits.length <= 15 &&
        digits.length === String(value || '').replace(/\\D/g, '').length;
}

async function getMemberName(sock, jid, participant, metadata) {
    const normalizedJid = normalizeJid(jid);

    const metadataParticipant = metadata?.participants?.find(
        item => normalizeJid(item.id || item.jid) === normalizedJid
    );

    // Prefer names supplied by WhatsApp's group/contact information.
    const candidates = [
        participant && typeof participant === 'object' ? participant.notify : '',
        participant && typeof participant === 'object' ? participant.name : '',
        metadataParticipant?.notify,
        metadataParticipant?.name,
        metadataParticipant?.verifiedName
    ];

    // sock.getName() reads the bot's contact store when available.
    if (typeof sock.getName === 'function') {
        try {
            candidates.push(await sock.getName(jid));
        } catch (error) {
            console.error('Welcome contact name lookup error:', error.message);
        }
    }

    for (const candidate of candidates) {
        const name = String(candidate || '').trim();
        if (!name || isPhoneNumber(name) || name.includes('@s.whatsapp.net')) {
            continue;
        }
        return name;
    }

    return 'Member';
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

            const memberName = await getMemberName(
                sock,
                jid,
                participant,
                groupMetadata
            );

            // Keep the real WhatsApp JID in mentions so the member is tagged.
            const finalMessage = String(customMessage || '')
                .replace(/{user}/gi, `@${memberName}`)
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
