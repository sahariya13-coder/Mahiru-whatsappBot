/**
 * MSK • Mahiru v1.0 ULTIMATE — Hybrid Interactive Popup Menu & Category Command Hub
 * Features: Zero-Upload MAHIRU Banner Header + 10-Category single_select Popup + Quick Action Buttons
 * Security: 100% Link-Free (Group Anti-Link Shield Safe) + Zero MSK/Mahiru Leak | 256MB RAM Optimized
 */
const settings = require('../settings');
const buttonEngine = require('../lib/buttonEngine');
const isOwnerOrSudo = require('../lib/isOwner');

async function isPrivilegedMenuRequest(sock, chatId, message) {
    const senderId =
        message?.key?.participant ||
        message?.key?.participantAlt ||
        message?.key?.remoteJid ||
        chatId;
    return isOwnerOrSudo(senderId, sock, chatId, message);
}

const {
    READ_MORE,
    toSmallCaps,
    getDhakaTimeInfo,
    formatUptime,
    getRamUsageText,
    getRuntimeLabel,
    buildInfoFrame,
    buildCommandSection,
    sendInteractiveCard,
    extractInteractiveCommand
} = buttonEngine;

// ==================================================
// ১. ১০টি সাজানো আল্টিমেট কমান্ড ক্যাটাগরি (শর্টকাটসহ)
// ==================================================
const MENU_CATEGORIES = Object.freeze({
    shortcuts: {
        id: 'shortcuts',
        icon: '⚡',
        title: 'PRO SHORTCUTS',
        subtitle: 'প্রতিদিনের কাজের সরাসরি শর্টকাট',
        commands: [
            { cmd: 'menu / help', desc: 'মেইন ইন্টারঅ্যাক্টিভ মেনু' },
            { cmd: 'alive', desc: 'বটের লাইভ স্ট্যাটাস' },
            { cmd: 'ping', desc: 'রেসপন্স টাইম ও স্পিড' },
            { cmd: 'owner', desc: 'বট Owner-এর তথ্য' },
            { cmd: 'jid / uid', desc: 'চ্যাট বা ইউজারের আইডি' }
        ]
    },
    group: {
        id: 'group',
        icon: '👥',
        title: 'MASTER GROUP CONTROL',
        subtitle: 'গ্রুপ কিল-সুইচ, অ্যাডমিন ও শিল্ড',
        commands: [
            { cmd: 'gai on / off', desc: 'গ্রুপ AI চালু বা বন্ধ' },
            { cmd: 'tagall / hidetag', desc: 'সবার কাছে মেনশন/মেসেজ' },
            { cmd: 'kick / ban / unban', desc: 'মেম্বার রিমুভ ও ব্যান' },
            { cmd: 'promote / demote', desc: 'অ্যাডমিন বানানো বা সরানো' },
            { cmd: 'mute / unmute', desc: 'গ্রুপ লক বা আনলক' },
            { cmd: 'antilink / antibadword / antitag', desc: 'গ্রুপ প্রোটেকশন শিল্ড' },
            { cmd: 'welcome / goodbye / groupinfo', desc: 'গ্রুপ ওয়েলকাম ও তথ্য' }
        ]
    },
    ai: {
        id: 'ai',
        icon: '🧠',
        title: 'MAHIRU AI & VOICE STUDIO',
        subtitle: 'এআই চ্যাট, রিসার্চ ও স্টুডিও ভয়েস',
        commands: [
            { cmd: 'gpt <প্রশ্ন> / gemini <প্রশ্ন>', desc: 'AI প্রশ্নের উত্তর' },
            { cmd: 'imagine <প্রম্পট>', desc: 'AI ইমেজ জেনারেটর' },
            { cmd: 'tts <টেক্সট>', desc: 'টেক্সট থেকে অডিও' },
            { cmd: 'remini / removebg', desc: 'ফটো Enhance ও Background remove' },
        ]
    },
    owner: {
        id: 'owner',
        icon: '👑',
        title: 'ROOT OWNER & SECURITY',
        subtitle: 'সুপার-ওনার ফায়ারওয়াল ও পাওয়ার OS',
        commands: [
            { cmd: 'adm add / del / list / status / purge', desc: 'Owner-only Sudo কন্ট্রোল' },
            { cmd: 'chatbot on / off / status', desc: 'Mahiru AI কন্ট্রোল' },
            { cmd: 'gai on / off / iai on / off', desc: 'Group ও Inbox AI কন্ট্রোল' },
            { cmd: 'iai on / off', desc: 'Inbox AI কন্ট্রোল' },
            { cmd: 'human on / off', desc: 'Human persona কন্ট্রোল' },
            { cmd: 'voice test <কথা>', desc: 'ভয়েস রিপ্লাই পরীক্ষা' },
            { cmd: 'role <নম্বর> gf|friend|family|client', desc: 'চ্যাটের AI রোল সেট' },
            { cmd: 'style tui|tumi|apni|auto', desc: 'AI সম্বোধনের ধরন সেট' },
            { cmd: 'cmd list / off / on', desc: 'কমান্ড চালু বা বন্ধ' },
            { cmd: 'summary', desc: 'সিস্টেম ও AI রিপোর্ট' },
            { cmd: 'rules', desc: 'AI-এর Owner-defined নিয়ম' },
            { cmd: 'orule add / del / list', desc: 'স্থায়ী Owner নিয়ম' },
            { cmd: 'guard on / off', desc: 'Anti-abuse সুরক্ষা' },
            { cmd: 'resetapi', desc: 'AI API cooldown reset' },
            { cmd: 'lang bn|banglish|en|auto', desc: 'AI ভাষা মোড সেট' },
            { cmd: 'research <বিষয়>', desc: 'লাইভ ওয়েব রিসার্চ' },
            { cmd: 'mode public / private', desc: 'বটের Public/Private মোড' },
            { cmd: 'settings / update', desc: 'সেটিংস ও আপডেট' },
            { cmd: 'doc / bk / clearsession / cleartmp', desc: 'Health, Backup ও Cleanup' },
            { cmd: 'sch / remind / tasks', desc: 'Scheduler ও Reminder' },
            { cmd: 'anticall / pmblocker / antidelete', desc: 'কল ও ইনবক্স সুরক্ষা' },
            { cmd: 'autoread / autotyping / autostatus', desc: 'অটোমেশন কন্ট্রোল' }
        ]
    },
    media: {
        id: 'media',
        icon: '📥',
        title: 'MEDIA & DOWNLOADER',
        subtitle: 'গান, ভিডিও ও সোশ্যাল মিডিয়া',
        commands: [
            { cmd: 'play <নাম> / song <নাম>', desc: 'হাই-কোয়ালিটি অডিও গান' },
            { cmd: 'video <নাম> / ytmp4 <লিংক>', desc: 'ইউটিউব ভিডিও ডাউনলোড' },
            { cmd: 'tiktok <লিংক>', desc: 'ওয়াটারমার্ক ছাড়া টিকটক' },
            { cmd: 'fb <লিংক>', desc: 'ফেসবুক HD ভিডিও' },
            { cmd: 'ig <লিংক> / igs <লিংক>', desc: 'ইনস্টাগ্রাম রিলস ও স্টোরি' },
            { cmd: 'spotify <নাম>', desc: 'স্পটিফাই ট্র্যাক ডাউনলোড' },
            { cmd: 'lyrics <গানের নাম>', desc: 'যেকোনো গানের লিরিক্স' }
        ]
    },
    tools: {
        id: 'tools',
        icon: '🛠️',
        title: 'SMART UTILITIES',
        subtitle: 'দৈনন্দিন কাজের স্মার্ট টুলস',
        commands: [
            { cmd: 'vv (রিপ্লাই দিয়ে)', desc: 'View-Once ছবি/ভিডিও আনলক' },
            { cmd: 'vv2 (রিপ্লাই দিয়ে)', desc: 'View-Once মিডিয়া নিজের ইনবক্সে পাঠানো' },
            { cmd: 'trt <টেক্সট> <ভাষা>', desc: 'যেকোনো ভাষায় অনুবাদ' },
            { cmd: 'ss <লিংক>', desc: 'ওয়েবসাইট লাইভ স্ক্রিনশট' },
            { cmd: 'weather <শহর>', desc: 'লাইভ আবহাওয়া আপডেট' },
            { cmd: 'news', desc: 'সর্বশেষ সংবাদ' },
            { cmd: 'url (ছবিতে রিপ্লাই)', desc: 'ছবি থেকে ডাইরেক্ট লিংক' },
            { cmd: 'jid / uid', desc: 'চ্যাট বা ইউজারের আইডি দেখা' },

        ]
    },
    sticker: {
        id: 'sticker',
        icon: '🎨',
        title: 'STICKER & IMAGE STUDIO',
        subtitle: 'স্টিকার, ক্রপ ও ফটো এডিট',
        commands: [
            { cmd: 'sticker (রিপ্লাই)', desc: 'ছবি/ভিডিও থেকে স্টিকার' },
            { cmd: 'crop (রিপ্লাই)', desc: 'স্কয়ার ক্রপ স্টিকার' },
            { cmd: 'simage (স্টিকারে রিপ্লাই)', desc: 'স্টিকার থেকে ছবি' },
            { cmd: 'take <প্যাক নাম>', desc: 'স্টিকারের প্যাক নাম বদলানো' },
            { cmd: 'attp <টেক্সট>', desc: 'অ্যানিমেটেড টেক্সট স্টিকার' },
            { cmd: 'emojimix <ইমোজি১>+<ইমোজি২>', desc: 'দুটি ইমোজি মিক্স' },
            { cmd: 'blur (ছবিতে রিপ্লাই)', desc: 'ছবি ব্লার ইফেক্ট' },
            { cmd: 'removebg / remini', desc: 'Background remove ও photo enhance' }
        ]
    },
    textmaker: {
        id: 'textmaker',
        icon: '🔤',
        title: '3D TEXTMAKER LOGOS',
        subtitle: 'স্টাইলিশ টেক্সট আর্ট ও লোগো',
        commands: [
            { cmd: 'metallic / ice / snow <টেক্সট>', desc: 'মেটালিক, বরফ ও স্নো ইফেক্ট' },
            { cmd: 'impressive / matrix / light <টেক্সট>', desc: 'স্টাইলিশ টেক্সট ইফেক্ট' },
            { cmd: 'neon / devil / purple <টেক্সট>', desc: 'নিয়ন ও কালার ইফেক্ট' },
            { cmd: 'thunder / leaves / 1917 <টেক্সট>', desc: 'স্পেশাল টেক্সট ইফেক্ট' },
            { cmd: 'arena / hacker / sand <টেক্সট>', desc: 'আর্ট ও লোগো ইফেক্ট' },
            { cmd: 'blackpink / glitch / fire <টেক্সট>', desc: 'স্টাইলিশ ব্যানার ও গ্লিচ' }
        ]
    },
    games: {
        id: 'games',
        icon: '🎮',
        title: 'GAMES & FUN ARENA',
        subtitle: 'গ্রুপ গেম, মিম ও এন্টারটেইনমেন্ট',
        commands: [
            { cmd: 'ttt @user', desc: 'টিক-ট্যাক-টো গেম' },
            { cmd: 'hangman / guess <অক্ষর>', desc: 'শব্দ খোঁজার গেম' },
            { cmd: 'trivia / answer <উত্তর>', desc: 'কুইজ চ্যালেঞ্জ' },
            { cmd: 'truth / dare / 8ball', desc: 'ট্রুথ অ্যান্ড ডেয়ার ও ম্যাজিক বল' },
            { cmd: 'meme / joke / quote / fact', desc: 'মজার মিম, জোকস ও ফ্যাক্ট' },
            { cmd: 'ship / flirt / shayari / compliment', desc: 'আড্ডা ও ফান কমান্ড' }
        ]
    },
    all: {
        id: 'all',
        icon: '📚',
        title: 'FULL COMMAND INDEX',
        subtitle: 'সব কমান্ড এক নজরে'
    }
});

const CATEGORY_ALIASES = Object.freeze({
    short: 'shortcuts', shortcut: 'shortcuts', shortcuts: 'shortcuts', pro: 'shortcuts',
    group: 'group', grp: 'group', g: 'group', admin: 'group',
    ai: 'ai', mahiru: 'ai', voice: 'ai', chatbot: 'ai',
    owner: 'owner', root: 'owner', security: 'owner', sudo: 'owner', adm: 'owner',
    media: 'media', dl: 'media', download: 'media', downloader: 'media', music: 'media',
    tools: 'tools', tool: 'tools', util: 'tools', general: 'tools',
    sticker: 'sticker', img: 'sticker', image: 'sticker',
    textmaker: 'textmaker', text: 'textmaker', logo: 'textmaker',
    games: 'games', game: 'games', fun: 'games',
    all: 'all', full: 'all', list: 'all'
});

function getRequestedCategory(message) {
    let raw = '';
    if (typeof extractInteractiveCommand === 'function') {
        raw = extractInteractiveCommand(message);
    }
    if (!raw) {
        let m = message?.message || {};
        if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
        if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
        raw = String(
            m.conversation ||
            m.extendedTextMessage?.text ||
            m.imageMessage?.caption ||
            ''
        ).trim();
    }
    const parts = raw.split(/\s+/).filter(Boolean);
    const arg = (parts[1] || '').toLowerCase();
    return CATEGORY_ALIASES[arg] || '';
}

function getTotalCommandCount(isPrivileged = true) {
    let count = 0;
    for (const [key, cat] of Object.entries(MENU_CATEGORIES)) {
        if (key !== 'all' && (key !== 'owner' || isPrivileged) && Array.isArray(cat.commands)) count += cat.commands.length;
    }
    return count;
}

function buildPopupSections(prefix, isPrivileged = false) {
    const rows = Object.values(MENU_CATEGORIES).filter((cat) => cat.id !== 'owner' || isPrivileged).map((cat) => ({
        header: '',
        title: `${cat.icon} ${cat.title}`,
        description: cat.subtitle,
        id: `${prefix}menu ${cat.id}`
    }));

    return [
        {
            title: '⚡ MAHIRU v1.0 ULTIMATE • কমান্ড ক্যাটাগরি',
            highlight_label: 'PRO HUB',
            rows
        }
    ];
}

// ==================================================
// ২. মূল মেনু কমান্ড হ্যান্ডলার (.menu / .help / .m)
// ==================================================
async function helpCommand(sock, chatId, message) {
    const p = settings.prefix || '.';
    const botName = settings.botName || 'Mahiru Shiina';
    const botTitle = toSmallCaps(botName);
    const ownerName = settings.ownerDisplayName || 'MSK';
    const verClean = String(settings.version || '1.0.0-ULTIMATE').replace(/^v/i, '');
    const footer = settings.mahiru?.ui?.footerText || `Powered By ${botTitle} • মাহিরু v1.0`;
    const timeInfo = getDhakaTimeInfo();
    const userName = message?.pushName || 'Friend';
    const catKey = getRequestedCategory(message);
    const isPrivileged = await isPrivilegedMenuRequest(sock, chatId, message);
    if (catKey === 'owner' && !isPrivileged) {
        await sock.sendMessage(chatId, { text: '❌ এই ক্যাটাগরিটি শুধু Owner/Sudo দেখতে পারবে।' }, { quoted: message });
        return;
    }

    try {
        // ক) নির্দিষ্ট ক্যাটাগরি ভিউ (.menu group / .menu ai / .menu owner ইত্যাদি)
        if (catKey && catKey !== 'all' && MENU_CATEGORIES[catKey]) {
            const cat = MENU_CATEGORIES[catKey];
            const sec = buildCommandSection(`${cat.icon} ${cat.title}`, cat.commands, 1, p);
            const body = [
                `${sec.text}`,
                '',
                `💡 _অন্য ক্যাটাগরি দেখতে নিচের *📋 কমান্ড মেনু* বাটনে ট্যাপ করো।_`
            ].join('\n');

            await sendInteractiveCard(sock, chatId, {
                body,
                footer,
                headerTitle: `${botTitle} • ${cat.title}`,
                headerSubtitle: `${cat.icon} ${cat.subtitle}`,
                headerType: 'location',
                useVerifiedQuote: true,
                buttons: [
                    { text: '📋 অন্য ক্যাটাগরি', type: 'single_select', sections: buildPopupSections(p, isPrivileged) },
                    { text: '🏠 MAIN MENU', id: `${p}menu`, type: 'quick_reply' },
                    { text: '⚡ ALIVE', id: `${p}alive`, type: 'quick_reply' },
                    { text: '👑 OWNER', id: `${p}owner`, type: 'quick_reply' }
                ],
                quoted: message
            });
            return;
        }

        // খ) .menu all — কমপ্যাক্ট ফুল ইনডেক্স (Read More ফোল্ডসহ, ১০০% লিংক-ফ্রি)
        if (catKey === 'all') {
            const headerFrame = buildInfoFrame('Mahiru v1.0 Command Index', [
                { icon: '🤖', label: 'ASSISTANT', value: `মাহিরু v${verClean}` },
                { icon: '👑', label: 'OWNER', value: ownerName },
                { icon: '📦', label: 'MODULES', value: `${getTotalCommandCount(isPrivileged)}+ Active Commands` },
                { icon: '☁️', label: 'RUNTIME', value: getRuntimeLabel() }
            ]);

            const sections = [];
            let idx = 1;
            for (const key of ['shortcuts', 'group', 'ai', ...(isPrivileged ? ['owner'] : []), 'media', 'tools', 'sticker', 'textmaker', 'games']) {
                const cat = MENU_CATEGORIES[key];
                const built = buildCommandSection(`${cat.icon} ${cat.title}`, cat.commands.map((c) => c.cmd), idx, p);
                sections.push(built.text);
                idx = built.nextIndex;
            }

            const body = `${headerFrame}\n${READ_MORE}\n\n${sections.join('\n\n')}`;
            await sendInteractiveCard(sock, chatId, {
                body,
                footer,
                headerTitle: `${botTitle} • FULL INDEX`,
                headerSubtitle: `📚 ${getTotalCommandCount()}+ ${toSmallCaps('COMMANDS')}`,
                headerType: 'location',
                useVerifiedQuote: true,
                buttons: [
                    { text: '📋 ক্যাটাগরি বাছুন', type: 'single_select', sections: buildPopupSections(p, isPrivileged) },
                    { text: '⚡ ALIVE', id: `${p}alive`, type: 'quick_reply' },
                    { text: '🚀 PING', id: `${p}ping`, type: 'quick_reply' },
                    { text: '👑 OWNER', id: `${p}owner`, type: 'quick_reply' }
                ],
                quoted: message
            });
            return;
        }

        // গ) মেইন প্রিমিয়াম হোম মেনু (.menu / .help / .m) — শর্ট, ক্লিন, কখনো Read More কাটবে না!
        const modeText = String(settings.commandMode || 'public').toUpperCase();
        const homeFrame = buildInfoFrame('Mahiru v1.0 Command Hub', [
            { raw: `${timeInfo.greetEmoji} *${toSmallCaps(timeInfo.greeting)}, ${userName}!*` },
            { icon: '🤖', label: 'SYSTEM', value: `মাহিরু v${verClean}` },
            { icon: '👑', label: 'OWNER', value: ownerName },
            { icon: '🕒', label: 'TIME', value: `${timeInfo.time} (${timeInfo.date})` },
            { icon: '⏱️', label: 'UPTIME', value: formatUptime() },
            { icon: '🐏', label: 'RAM', value: getRamUsageText() },
            { icon: '☁️', label: 'HOST', value: getRuntimeLabel() },
            { icon: '🔓', label: 'MODE', value: `${toSmallCaps(modeText)} • Prefix: \`${p}\`` }
        ]);

        const quickHighlights = [
            '╭───「 ⚡ *কুইক শর্টকাট* 」───╮',
            `│ • \`${p}g off / on / chat on\` — গ্রুপ কন্ট্রোল`,
            `│ • \`${p}tk 2\` — স্মার্ট টেকওভার টাইমার`,
            `│ • \`${p}v test\` — ক্রিস্টাল ভয়েস টেস্ট`,
            ...(isPrivileged ? [`│ • \`${p}adm ls\` — রুট সিকিউরিটি প্যানেল`] : []),
            '╰────────────────────╯',
            '',
            '👇 _সব ক্যাটাগরি দেখতে নিচের *📋 কমান্ড মেনু* বাটনে ট্যাপ করো!_'
        ].join('\n');

        const bodyText = `${homeFrame}\n\n${quickHighlights}`;

        await sendInteractiveCard(sock, chatId, {
            body: bodyText,
            footer,
            headerTitle: `${botTitle} • মাহিরু v1.0`,
            headerSubtitle: `⚡ ${toSmallCaps('ULTIMATE AI & BOT ENGINE')}`,
            headerType: 'location',
            useVerifiedQuote: true,
            buttons: [
                { text: '📋 কমান্ড মেনু', type: 'single_select', sections: buildPopupSections(p, isPrivileged) },
                { text: '⚡ ALIVE', id: `${p}alive`, type: 'quick_reply' },
                { text: '🚀 PING', id: `${p}ping`, type: 'quick_reply' },
                { text: '👑 OWNER', id: `${p}owner`, type: 'quick_reply' },
                { text: '⚙️ SETTINGS', id: `${p}settings`, type: 'quick_reply' }
            ],
            quoted: message
        });
    } catch (error) {
        console.error('❌ [help] Error in menu command:', error?.message || error);
        try {
            await sock.sendMessage(
                chatId,
                { text: `🤖 *${botName} • মাহিরু v${verClean}*\nকমান্ড দেখতে লিখো: \`${p}menu all\` • \`${p}alive\` • \`${p}ping\` • \`${p}owner\`` },
                { quoted: message }
            );
        } catch {}
    }
}

module.exports = helpCommand;
