
const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

async function helpCommand(sock, chatId, message) {
    const senderId = message?.key?.participant || message?.key?.remoteJid || '';
    const isPrivileged = Boolean(message?.key?.fromMe) || await isOwnerOrSudo(senderId, sock, chatId, message);
    const menuTitle = isPrivileged ? '*OWNER / SUDO MENU*' : '*USER MENU*';
    const helpMessage = `
╔═══════════════════╗
   *🤖 ${settings.botName || 'Mahiru Shiina'}*
   সংস্করণ: *${settings.version || '3.0.0'}*
   নির্মাতা: ${settings.botOwner || 'MSK'}
╚═══════════════════╝

${menuTitle}\n\n*ব্যবহারযোগ্য কমান্ডসমূহ:*\n
╔═══════════════════╗
🌐 *সাধারণ কমান্ড:*
║ ➤ .help / .menu / .bot / .list
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
║ ➤ .topmembers
║ ➤ .translate <text> <language>
║ ➤ .pair
║ ➤ .savestatus
║ ➤ .viewonce
╚═══════════════════╝

${isPrivileged ? `╔═══════════════════╗
👮‍♂️ *অ্যাডমিন কমান্ড:*
║ ➤ .ban @user
║ ➤ .unban @user
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
║ ➤ .antibot <on/off>
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
║ ➤ .topmembers
╚═══════════════════╝

╔═══════════════════╗
🔒 *মালিকের কমান্ড:*
║ ➤ .gid (গ্রুপ আইডি দেখুন; চালু করার আগেও কাজ করবে)
║ ➤ .gact <গ্রুপ আইডি> (গ্রুপ চালু করুন)
║ ➤ .gdeact <গ্রুপ আইডি> (গ্রুপ বন্ধ করুন)
║ ➤ .iai on/off (Inbox AI চালু/বন্ধ)
║ ➤ .rule add <নাম> | <নিয়ম> (নতুন নিয়ম ডিফল্টভাবে চালু)
║ ➤ .rule list (সব নিয়ম ও অবস্থা দেখুন)
║ ➤ .rule on <নাম> (নিয়ম চালু)
║ ➤ .rule off <নাম> (নিয়ম বন্ধ)
║ ➤ .rule edit <নাম> | <নতুন নিয়ম>
║ ➤ .rule del <নাম> (নিয়ম মুছুন)
║ ➤ AI নিয়ম: ইনবক্স ও গ্রুপ—উভয় AI-তে কার্যকর
║ ➤ নিয়ম পরিচালনা: শুধু Owner/Sudo\n║ ➤ Mahiru-র ব্যক্তিত্ব: ডিফল্টভাবে চালু (.human on/off)\n║ ➤ .mode <সবার জন্য/ব্যক্তিগত>
║ ➤ .clearsession
║ ➤ .antidelete
║ ➤ .cleartmp
║ ➤ .update
║ ➤ .settings
║ ➤ .sudo add/remove/list (Sudo ব্যবহারকারী পরিচালনা)
║ ➤ .backup (ব্যাকআপ/রিস্টোর)
║ ➤ .pair
║ ➤ .update
║ ➤ .setpp <ছবিতে রিপ্লাই দিন>
║ ➤ .autoreact <on/off>
║ ➤ .autostatus <on/off>
║ ➤ .autostatus react <on/off>
║ ➤ .autotyping <on/off>
║ ➤ .autoread <on/off>
║ ➤ .anticall <on/off>
║ ➤ .pmblocker <on/off/status>
║ ➤ .pmblocker setmsg <text>
║ ➤ .setmention <মেসেজে রিপ্লাই দিন>
║ ➤ .mention <on/off>\n║ ➤ .human (show persona mode)\n║ ➤ .human on/off (Owner only)\n║ ➤ বটের মালিক: https://wa.me//${(settings.ownerUsername || settings.botOwner || 'Not set').replace(/^@/, '')}
╚═══════════════════╝

` : ''}

╔═══════════════════╗
🎨 *ছবি ও স্টিকার কমান্ড:*
║ ➤ .blur <image>
║ ➤ .simage <reply to sticker>
║ ➤ .sticker <reply to image>
║ ➤ .sticker-alt <reply to image>
║ ➤ .stickercrop <reply to sticker>
║ ➤ .gif <query>
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
🖼️ *পাই কমান্ড:*
║ ➤ .pies <country>
║ ➤ .china
║ ➤ .indonesia
║ ➤ .japan
║ ➤ .korea
║ ➤ .hijab
╚═══════════════════╝

╔═══════════════════╗
🎮 *গেম কমান্ড:*
║ ➤ .tictactoe @user
║ ➤ .hangman
║ ➤ .guess <letter>
║ ➤ .trivia
║ ➤ .answer <answer>
║ ➤ .truth
║ ➤ .dare
╚═══════════════════╝

╔═══════════════════╗
🤖 *কৃত্রিম বুদ্ধিমত্তা (AI) কমান্ড:*
║ ➤ .gpt <question>
║ ➤ .gemini <question>
║ ➤ ইনবক্স AI: ব্যক্তিগত চ্যাটে স্বয়ংক্রিয় উত্তর (.iai on/off)
║ ➤ গ্রুপ AI: Mahiru-কে মেনশন বা রিপ্লাই করলে উত্তর দেবে (.gai on/off)
║ ➤ চ্যাটবট ডিফল্ট: চালু (গ্রুপ + ইনবক্স)
║ ➤ মালিকের AI নিয়ম: চালু করা নিয়ম ইনবক্স ও গ্রুপ—দুই জায়গাতেই মানবে
║ ➤ .imagine <ছবির বর্ণনা>
║ ➤ .flux <prompt>
║ ➤ .sora <ভিডিওর বর্ণনা>
╚═══════════════════╝

╔═══════════════════╗
🎯 *বিনোদনমূলক কমান্ড:*
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
🔤 *লেখা থেকে ডিজাইন কমান্ড:*
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
📥 *ডাউনলোড কমান্ড:*
║ ➤ .play <song_name>
║ ➤ .song <song_name>
║ ➤ .spotify <query>
║ ➤ .instagram <link>
║ ➤ .facebook <link>
║ ➤ .tiktok <link>
║ ➤ .video <song name>
║ ➤ .ytmp4 <Link>
║ ➤ .twitter <link>
╚═══════════════════╝

╔═══════════════════╗
🧩 *অন্যান্য কমান্ড:*
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
🖼️ *অ্যানিমে কমান্ড:*
║ ➤ .nom
║ ➤ .poke
║ ➤ .cry
║ ➤ .kiss
║ ➤ .pat
║ ➤ .hug
║ ➤ .wink
║ ➤ .facepalm
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
