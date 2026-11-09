
const {
    addWelcome,
    delWelcome,
    isWelcomeOn,
    addGoodbye,
    delGoodBye,
    isGoodByeOn
} = require('../lib/index');

const DEFAULT_WELCOME = `🎉 Welcome to the {Group}! 💗

🌸 স্বাগতম {user}!

🌸 সবাইকে সম্মান করবে।
🚫 কোনো Spam বা অশালীন আচরণ করা যাবে না।
⚠️ Group-এর Rules মেনে চলবে।

🥰 Stay Active & Enjoy! ❤️`;

async function isGroupAdmin(sock, chatId, message) {
    try {
        const sender =
            message.key?.participant ||
            message.participant ||
            message.sender;

        if (!sender) return false;

        const metadata = await sock.groupMetadata(chatId);

        const user = metadata.participants.find(
            p => p.id === sender
        );

        return !!(user &&
            (user.admin === 'admin' ||
             user.admin === 'superadmin'));
    } catch (error) {
        console.error('Admin check error:', error);
        return false;
    }
}

async function handleWelcome(sock, chatId, message, match) {
    if (!chatId.endsWith('@g.us')) return;

    if (!match) {
        const status = await isWelcomeOn(chatId);

        return sock.sendMessage(chatId, {
            text: `🎉 *MAHIRU WELCOME SYSTEM*

Status: ${status ? '✅ ON' : '❌ OFF'}

Commands:
✅ .welcome on
🚫 .welcome off
🛠️ .welcome set Your message

Variables:
{user} - Member mention
{group} - Group name
{description} - Group description

Default: ON`,
            quoted: message
        });
    }

    const isAdmin = await isGroupAdmin(
        sock,
        chatId,
        message
    );

    if (!isAdmin) {
        return sock.sendMessage(chatId, {
            text: '❌ Only Group Admins can manage Welcome System.',
            quoted: message
        });
    }

    const [command, ...args] = match.trim().split(' ');
    const action = command.toLowerCase();
    const customMessage = args.join(' ').trim();

    if (action === 'on') {
        await addWelcome(chatId, true);

        return sock.sendMessage(chatId, {
            text: '✅ Welcome System is now ON! 🎉',
            quoted: message
        });
    }

    if (action === 'off') {
        await delWelcome(chatId);

        return sock.sendMessage(chatId, {
            text: '❌ Welcome System is now OFF.',
            quoted: message
        });
    }

    if (action === 'set') {
        if (!customMessage) {
            return sock.sendMessage(chatId, {
                text: '⚠️ Please provide a welcome message.',
                quoted: message
            });
        }

        await addWelcome(chatId, true, customMessage);

        return sock.sendMessage(chatId, {
            text: '✅ Custom Welcome Message saved!',
            quoted: message
        });
    }

    return sock.sendMessage(chatId, {
        text: '❌ Invalid command!\n\n.welcome on\n.welcome off\n.welcome set Your message',
        quoted: message
    });
}

async function handleGoodbye(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `📤 *Goodbye Message Setup*

.goodbye on
.goodbye off
.goodbye set Your message`,
            quoted: message
        });
    }

    if (!await isGroupAdmin(sock, chatId, message)) {
        return sock.sendMessage(chatId, {
            text: '❌ Only Group Admins can manage Goodbye System.',
            quoted: message
        });
    }

    const lower = match.toLowerCase();

    if (lower === 'on') {
        await addGoodbye(chatId, true, 'Goodbye {user} 👋');

        return sock.sendMessage(chatId, {
            text: '✅ Goodbye System enabled!',
            quoted: message
        });
    }

    if (lower === 'off') {
        await delGoodBye(chatId);

        return sock.sendMessage(chatId, {
            text: '❌ Goodbye System disabled!',
            quoted: message
        });
    }

    if (lower.startsWith('set ')) {
        const customMessage = match.substring(4).trim();

        if (!customMessage) return;

        await addGoodbye(chatId, true, customMessage);

        return sock.sendMessage(chatId, {
            text: '✅ Custom Goodbye Message saved!',
            quoted: message
        });
    }

    return sock.sendMessage(chatId, {
        text: '❌ Invalid command!',
        quoted: message
    });
}

module.exports = {
    handleWelcome,
    handleGoodbye,
    DEFAULT_WELCOME
};
