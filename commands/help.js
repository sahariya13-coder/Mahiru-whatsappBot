
const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, message) {
    const helpMessage = `
╔═══════════════════╗
   *🤖 ${settings.botName || 'Mahiru Shiina'}*
   Version: *${settings.version || '3.0.0'}*
   by ${settings.botOwner || 'MSK'}
╚═══════════════════╝

*Available Commands:*

╔═══════════════════╗
🌐 *General Commands*:
║ ➤ .help or .menu
║ ➤ .ping
║ ➤ .alive
║ ➤ .tts <text>
║ ➤ .owner
║ ➤ .joke
║ ➤ .quote
║ ➤ .fact
║ ➤ .weather <city>
║ ➤ .news
║ ➤ .attp <text>
║ ➤ .lyrics <song_title>
║ ➤ .8ball <question>
║ ➤ .groupinfo
║ ➤ .staff or .admins
║ ➤ .vv
║ ➤ .trt <text> <lang>
║ ➤ .ss <link>
║ ➤ .jid
║ ➤ .uid (reply/mention someone to view their UID)
║ ➤ .url
╚═══════════════════╝

╔═══════════════════╗
👮‍♂️ *Admin Commands*:
║ ➤ .ban @user
║ ➤ .promote @user
║ ➤ .demote @user
║ ➤ .mute <minutes>
║ ➤ .unmute
║ ➤ .delete or .del
║ ➤ .kick @user
║ ➤ .warnings @user
║ ➤ .warn @user
║ ➤ .antilink
║ ➤ .antibadword
║ ➤ .clear
║ ➤ .tag <message>
║ ➤ .tagall
║ ➤ .tagnotadmin
║ ➤ .hidetag <message>
║ ➤ .gai on/off (Group AI: mention/reply to Mahiru)
║ ➤ .chatbot on/off (AI status/settings)
║ ➤ .resetlink
║ ➤ .antitag <on/off>
║ ➤ .welcome <on/off>
║ ➤ .goodbye <on/off>
║ ➤ .setgdesc <description>
║ ➤ .setgname <new name>
║ ➤ .setgpp (reply to image)
╚═══════════════════╝

╔═══════════════════╗
🔒 *Owner Commands*:
║ ➤ .gid (show Group ID; works before activation)
║ ➤ .gact <Group ID> (activate group)
║ ➤ .gdeact <Group ID> (deactivate group)
║ ➤ .iai on/off (Inbox AI চালু/বন্ধ)
║ ➤ .rule add <name> | <rule text> (নতুন Rule default ON)
║ ➤ .rule list (সব Rule ও status দেখুন)
║ ➤ .rule on <name> (Rule চালু)
║ ➤ .rule off <name> (Rule বন্ধ)
║ ➤ .rule edit <name> | <new rule>
║ ➤ .rule del <name> (Rule মুছুন)
║ ➤ AI Rules: Inbox + Group উভয় AI-তে কার্যকর
║ ➤ Rule management: শুধু Owner/Sudo\n║ ➤ Mahiru persona: default ON (.human on/off)\n║ ➤ .mode <public/private>
║ ➤ .clearsession
║ ➤ .antidelete
║ ➤ .cleartmp
║ ➤ .update
║ ➤ .settings
║ ➤ .setpp <reply to image>
║ ➤ .autoreact <on/off>
║ ➤ .autostatus <on/off>
║ ➤ .autostatus react <on/off>
║ ➤ .autotyping <on/off>
║ ➤ .autoread <on/off>
║ ➤ .anticall <on/off>
║ ➤ .pmblocker <on/off/status>
║ ➤ .pmblocker setmsg <text>
║ ➤ .setmention <reply to msg>
║ ➤ .mention <on/off>\n║ ➤ .human (show persona mode)\n║ ➤ .human on/off (Owner only)\n║ ➤ Owner: https://wa.me//${(settings.ownerUsername || settings.botOwner || 'Not set').replace(/^@/, '')}
╚═══════════════════╝

╔═══════════════════╗
🎨 *Image/Sticker Commands*:
║ ➤ .blur <image>
║ ➤ .simage <reply to sticker>
║ ➤ .sticker <reply to image>
║ ➤ .removebg
║ ➤ .remini
║ ➤ .crop <reply to image>
║ ➤ .tgsticker <Link>
║ ➤ .meme
║ ➤ .take <packname>
║ ➤ .emojimix <emj1>+<emj2>
║ ➤ .igs <insta link>
║ ➤ .igsc <insta link>
╚═══════════════════╝

╔═══════════════════╗
🖼️ *Pies Commands*:
║ ➤ .pies <country>
║ ➤ .china
║ ➤ .indonesia
║ ➤ .japan
║ ➤ .korea
║ ➤ .hijab
╚═══════════════════╝

╔═══════════════════╗
🎮 *Game Commands*:
║ ➤ .tictactoe @user
║ ➤ .hangman
║ ➤ .guess <letter>
║ ➤ .trivia
║ ➤ .answer <answer>
║ ➤ .truth
║ ➤ .dare
╚═══════════════════╝

╔═══════════════════╗
🤖 *AI Commands*:
║ ➤ .gpt <question>
║ ➤ .gemini <question>
║ ➤ Inbox AI: private chat-এ auto reply (.iai on/off)
║ ➤ Group AI: Mahiru-কে mention/reply করলে উত্তর দেবে (.gai on/off)
║ ➤ Chatbot default: ON (Group + Inbox)
║ ➤ Owner AI Rules: enabled Rules Inbox + Group উভয় জায়গায় মানবে
║ ➤ .imagine <prompt>
║ ➤ .flux <prompt>
║ ➤ .sora <prompt>
╚═══════════════════╝

╔═══════════════════╗
🎯 *Fun Commands*:
║ ➤ .compliment @user
║ ➤ .insult @user
║ ➤ .flirt
║ ➤ .shayari
║ ➤ .goodnight
║ ➤ .roseday
║ ➤ .character @user
║ ➤ .wasted @user
║ ➤ .ship @user
║ ➤ .simp @user
║ ➤ .stupid @user [text]
╚═══════════════════╝

╔═══════════════════╗
🔤 *Textmaker*:
║ ➤ .metallic <text>
║ ➤ .ice <text>
║ ➤ .snow <text>
║ ➤ .impressive <text>
║ ➤ .matrix <text>
║ ➤ .light <text>
║ ➤ .neon <text>
║ ➤ .devil <text>
║ ➤ .purple <text>
║ ➤ .thunder <text>
║ ➤ .leaves <text>
║ ➤ .1917 <text>
║ ➤ .arena <text>
║ ➤ .hacker <text>
║ ➤ .sand <text>
║ ➤ .blackpink <text>
║ ➤ .glitch <text>
║ ➤ .fire <text>
╚═══════════════════╝

╔═══════════════════╗
📥 *Downloader*:
║ ➤ .play <song_name>
║ ➤ .song <song_name>
║ ➤ .spotify <query>
║ ➤ .instagram <link>
║ ➤ .facebook <link>
║ ➤ .tiktok <link>
║ ➤ .video <song name>
║ ➤ .ytmp4 <Link>
╚═══════════════════╝

╔═══════════════════╗
🧩 *MISC*:
║ ➤ .heart
║ ➤ .horny
║ ➤ .circle
║ ➤ .lgbt
║ ➤ .lolice
║ ➤ .its-so-stupid
║ ➤ .namecard
║ ➤ .oogway
║ ➤ .tweet
║ ➤ .ytcomment
║ ➤ .comrade
║ ➤ .gay
║ ➤ .glass
║ ➤ .jail
║ ➤ .passed
║ ➤ .triggered
╚═══════════════════╝

╔═══════════════════╗
🖼️ *ANIME*:
║ ➤ .nom
║ ➤ .poke
║ ➤ .cry
║ ➤ .kiss
║ ➤ .pat
║ ➤ .hug
║ ➤ .wink
║ ➤ .facepalm
╚═══════════════════╝

╔═══════════════════╗
💻 *Github Commands:*
║ ➤ .git
║ ➤ .github
║ ➤ .sc
║ ➤ .script
║ ➤ .repo
╚═══════════════════╝
`;

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');

        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);

            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage
            }, { quoted: message });

        } else {
            console.error('Bot image not found at:', imagePath);

            await sock.sendMessage(chatId, {
                text: helpMessage
            }, { quoted: message });
        }

    } catch (error) {
        console.error('Error in help command:', error);

        await sock.sendMessage(chatId, {
            text: helpMessage
        }, { quoted: message });
    }
}

module.exports = helpCommand;
