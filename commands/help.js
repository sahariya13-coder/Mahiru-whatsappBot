const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

async function getMenuRole(sock, chatId, message) {
    if (message?.key?.fromMe === true) return 'owner';

    const key = message?.key || {};
    const candidates = [
        key.participant,
        key.participantAlt,
        key.remoteJid,
        key.remoteJidAlt,
        key.senderPn,
        message?.participant,
        message?.participantAlt,
        message?.senderPn
    ].filter((value, index, list) =>
        typeof value === 'string' &&
        value &&
        !value.endsWith('@g.us') &&
        list.indexOf(value) === index
    );

    for (const senderId of candidates) {
        try {
            if (await isOwnerOrSudo(senderId, sock, chatId, message)) return 'privileged';
        } catch (error) {
            console.error('[MENU] Role check failed:', error.message);
        }
    }

    return 'user';
}

async function helpCommand(sock, chatId, message) {
    const role = await getMenuRole(sock, chatId, message);
    const isPrivileged = role !== 'user';
    const menuTitle = isPrivileged ? '*OWNER / SUDO MENU*' : '*USER MENU*';

    const helpMessage = `
╔══════════════════════════╗
       *🤖 ${settings.botName || 'Mahiru Shiina'}*
       Version: *${settings.version || '3.0.0'}*
       Creator: *${settings.botOwner || 'MSK'}*
╚══════════════════════════╝

${menuTitle}

╭───「 🌐 সাধারণ কমান্ড 」 
│ .menu / .help
│ .ping
│ .alive
│ .owner
│ .jid
│ .uid (reply/mention)
│ .groupinfo
│ .staff / .admins
│ .topmembers
│ .weather <city>
│ .news
│ .joke
│ .quote
│ .fact
│ .8ball <question>
│ .lyrics <song>
│ .tts <text>
│ .attp <text>
│ .translate <text> <language>
│ .trt <text> <language>
│ .ss <link>
│ .url
╰──────────────────────────

╭───「 🎨 ছবি ও স্টিকার 」 
│ .blur (reply to image)
│ .simage (reply to sticker)
│ .sticker (reply to image)
│ .stickercrop (reply to sticker)
│ .crop (reply to image)
│ .removebg
│ .remini
│ .meme
│ .take <packname>
│ .emojimix <emoji>+<emoji>
│ .igs <Instagram link>
│ .igsc <Instagram link>
╰──────────────────────────

╭───「 🤖 AI কমান্ড 」 
│ .gpt <question>
│ .gemini <question>
│ .imagine <prompt>
│ .flux <prompt>
│ .sora <description>
│ Inbox AI: ব্যক্তিগত চ্যাটে স্বয়ংক্রিয় উত্তর
│ Group AI: Mahiru-কে mention/reply করলে উত্তর
╰──────────────────────────

╭───「 📥 Download 」 
│ .play <song>
│ .song <song>
│ .spotify <query>
│ .video <link/name>
│ .ytmp4 <link>
│ .instagram <link>
│ .facebook <link>
│ .tiktok <link>
╰──────────────────────────

╭───「 🎮 Game 」 
│ .tictactoe @user
│ .hangman
│ .guess <letter>
│ .trivia
│ .answer <answer>
│ .truth
│ .dare
╰──────────────────────────

╭───「 🎭 Entertainment 」 
│ .compliment @user
│ .insult @user
│ .flirt
│ .shayari
│ .goodnight
│ .roseday
│ .character @user
│ .wasted @user
│ .ship @user
│ .simp @user
│ .stupid @user
│ .pies <country>
│ .china / .japan / .korea
│ .nom / .poke / .cry / .kiss
│ .pat / .hug / .wink
╰──────────────────────────

╭───「 🔤 Text Design 」 
│ .metallic / .ice / .snow
│ .impressive / .matrix / .light
│ .neon / .devil / .purple
│ .thunder / .leaves / .1917
│ .arena / .hacker / .sand
│ .blackpink / .glitch / .fire
╰──────────────────────────

${isPrivileged ? `╭───「 👮 Group Admin Commands 」 
│ .ban / .unban @user
│ .promote / .demote @user
│ .kick @user
│ .mute <minutes> / .unmute
│ .warn @user / .warnings @user
│ .antilink <on/off>
│ .antibadword <on/off>
│ .antitag <on/off>
│ .welcome <on/off>
│ .goodbye <on/off>
│ .chatbot <on/off> (এই গ্রুপের AI)
│ .gai / .iai <on/off>
│ .tag <text> / .tagall
│ .tagnotadmin / .hidetag <text>
│ .clear / .delete
│ .resetlink
│ .setgdesc <text>
│ .setgname <name>
│ .setgpp (reply to image)
╰──────────────────────────

╭───「 🔐 Owner / Sudo Only 」 
│ .mode group public/private
│ .mode inbox public/private
│ .mode public/private (both)
│ .gid (show group ID)
│ .gact <group ID> (activate)
│ .gdeact <group ID> (deactivate)
│ .gdelete <group ID> (bot leaves group)
│ .chatbot <group ID> on/off
│ .antilink <group ID> on/off
│ .antitag <group ID> on/off
│ .antibadword <group ID> on/off
│ .welcome <group ID> on/off
│ .goodbye <group ID> on/off
│ .gset <group ID> <feature> <on/off>
│ .rule add/list/on/off/edit/del
│ .human on/off
│ .sudo add/remove/list
│ .backup
│ .settings
│ .update
│ .setpp (reply to image)
│ .clearsession / .cleartmp
│ .antidelete
│ .autoreact <on/off>
│ .autostatus <on/off>
│ .autotyping <on/off>
│ .autoread <on/off>
│ .anticall <on/off>
│ .pmblocker <on/off/status>
│ .pmblocker setmsg <text>
│ .mention <on/off>
│ .setmention (reply to message)
╰──────────────────────────
` : ''}

*Bot Owner:* ${settings.ownerUsername ? 'https://wa.me/' + settings.ownerUsername.replace(/^@/, '') : (settings.botOwner || 'Not set')}
`;

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
        if (fs.existsSync(imagePath)) {
            await sock.sendMessage(chatId, {
                image: fs.readFileSync(imagePath),
                caption: helpMessage
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: helpMessage }, { quoted: message });
        }
    } catch (error) {
        console.error('[MENU] Send failed:', error);
        await sock.sendMessage(chatId, { text: helpMessage }, { quoted: message });
    }
}

module.exports = helpCommand;
