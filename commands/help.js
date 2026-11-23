/**
 * PRIME MONIR • Mahiru v1.0 ULTIMATE — Hybrid Interactive Popup Menu & Category Command Hub
 * Features: Zero-Upload MAHIRU Banner Header + 10-Category single_select Popup + Quick Action Buttons
 * Security: 100% Link-Free (Group Anti-Link Shield Safe) + Zero MSK/Mahiru Leak | 256MB RAM Optimized
 */
const settings = require('../settings');
const buttonEngine = require('../lib/buttonEngine');
const isOwnerOrSudo = require('../lib/isOwner');

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
        subtitle: '১-অক্ষরে সুপার ফাস্ট কন্ট্রোল',
        commands: [
            { cmd: 'm', desc: 'মেইন ইন্টারঅ্যাক্টিভ মেনু' },
            { cmd: 'a', desc: 'সিস্টেম অ্যালাইভ কার্ড' },
            { cmd: 'p', desc: 'রিয়েল-টাইম স্পিড ও পিং' },
            { cmd: 'o', desc: 'ভেরিফায়েড ওনার প্রোফাইল' },
            { cmd: 's', desc: 'মাস্টার সেটিংস ড্যাশবোর্ড' },
            { cmd: 'g off / on / chat on', desc: 'গ্রুপ কিল-সুইচ ও চ্যাট কন্ট্রোল' },
            { cmd: 'tk 2 / off', desc: 'স্মার্ট টেকওভার টাইমার (১–১০ মি.)' },
            { cmd: 'adm ls / del / nuke', desc: 'রুট অ্যাডমিন ফায়ারওয়াল' },
            { cmd: 'v auto / on / off / test', desc: 'ক্রিস্টাল ভয়েস কন্ট্রোল' },
            { cmd: 'cl / doc / rb', desc: 'ক্লিন • ডক্টর • রিস্টার্ট' }
        ]
    },
    group: {
        id: 'group',
        icon: '👥',
        title: 'MASTER GROUP CONTROL',
        subtitle: 'গ্রুপ কিল-সুইচ, অ্যাডমিন ও শিল্ড',
        commands: [
            { cmd: 'g off', desc: 'গ্রুপ টোটাল মিউট (কমান্ড+চ্যাট বন্ধ)' },
            { cmd: 'g on', desc: 'শুধু কমান্ড চালু (AI চ্যাট বন্ধ)' },
            { cmd: 'g chat on', desc: 'কমান্ড ও AI চ্যাট দুটোই চালু' },
            { cmd: 'g all off / on', desc: 'সব গ্রুপ একসাথে বন্ধ বা চালু' },
            { cmd: 'g <নাম> off / on', desc: 'ইনবক্স থেকে নির্দিষ্ট গ্রুপ কন্ট্রোল' },
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
            { cmd: 'maya on / off / status', desc: 'মাহিরু AI কন্ট্রোল ও স্ট্যাটাস' },
            { cmd: 'maya voice test <কথা>', desc: 'ক্রিস্টাল ভয়েস লাইভ টেস্ট' },
            { cmd: 'v auto / on / off', desc: 'ভয়েস রিপ্লাই মোড' },
            { cmd: 'maya lang bn|banglish|en|auto', desc: 'রিপ্লাই ভাষা লক' },
            { cmd: 'maya research <বিষয়>', desc: 'লাইভ ওয়েব রিসার্চ রিপোর্ট' },
            { cmd: 'gpt <প্রশ্ন> / gemini <প্রশ্ন>', desc: 'ডাইরেক্ট AI উত্তর' },
            { cmd: 'imagine <প্রম্পট>', desc: 'AI ইমেজ জেনারেটর' },
            { cmd: 'tts <টেক্সট>', desc: 'টেক্সট থেকে অডিও ভয়েস' },
            { cmd: 'remini / removebg', desc: 'HD ফটো এনহ্যান্স ও ব্যাকগ্রাউন্ড রিমুভ' }
        ]
    },
    owner: {
        id: 'owner',
        icon: '👑',
        title: 'ROOT OWNER & SECURITY',
        subtitle: 'সুপার-ওনার ফায়ারওয়াল ও পাওয়ার OS',
        commands: [
            { cmd: 'adm status / ls / add / del', desc: 'রুট অ্যাডমিন ও সুডো কন্ট্রোল' },
            { cmd: 'adm nuke', desc: 'সব অজানা অ্যাডমিন ওয়াইপ (Root)' },
            { cmd: 'settings / settings reload', desc: 'মাস্টার ড্যাশবোর্ড ও লাইভ রিলোড' },
            { cmd: 'settings safe on / off', desc: 'গ্রুপ অ্যান্টি-লিংক শিল্ড' },
            { cmd: 'tk <1-10|off>', desc: 'প্রেজেন্স স্মার্ট টেকওভার সেট' },
            { cmd: 'rb / rb off [2h] / rb on', desc: 'সেফ রিস্টার্ট ও স্লিপ মোড' },
            { cmd: 'doc / health / cl', desc: '১০-পয়েন্ট ডক্টর ও RAM/সেশন ক্লিন' },
            { cmd: 'bk / heal restore', desc: 'সুরক্ষিত Gzip ব্যাকআপ ও রিস্টোর' },
            { cmd: 'mode public / private', desc: 'পাবলিক বা প্রাইভেট মোড' },
            { cmd: 'sch / remind / tasks', desc: 'স্মার্ট শিডিউলার ও রিমাইন্ডার' },
            { cmd: 'anticall / pmblocker / antidelete', desc: 'কল, ইনবক্স ও ডিলিট গার্ড' }
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
            { cmd: 'trt <টেক্সট> <ভাষা>', desc: 'যেকোনো ভাষায় অনুবাদ' },
            { cmd: 'ss <লিংক>', desc: 'ওয়েবসাইট লাইভ স্ক্রিনশট' },
            { cmd: 'weather <শহর>', desc: 'লাইভ আবহাওয়া আপডেট' },
            { cmd: 'news', desc: 'সর্বশেষ সংবাদ' },
            { cmd: 'url (ছবিতে রিপ্লাই)', desc: 'ছবি থেকে ডাইরেক্ট লিংক' },
            { cmd: 'jid / uid', desc: 'চ্যাট বা ইউজারের আইডি দেখা' }
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
            { cmd: 'blur (ছবিতে রিপ্লাই)', desc: 'ছবি ব্লার ইফেক্ট' }
        ]
    },
    textmaker: {
        id: 'textmaker',
        icon: '🔤',
        title: '3D TEXTMAKER LOGOS',
        subtitle: 'স্টাইলিশ টেক্সট আর্ট ও লোগো',
        commands: [
            { cmd: 'neon <টেক্সট>', desc: 'নিয়ন গ্লো লোগো' },
            { cmd: 'glitch <টেক্সট>', desc: 'সাইবার গ্লিচ টেক্সট' },
            { cmd: 'fire <টেক্সট> / thunder <টেক্সট>', desc: 'ফায়ার ও থান্ডার ইফেক্ট' },
            { cmd: 'hacker <টেক্সট> / matrix <টেক্সট>', desc: 'হ্যাকার ও ম্যাট্রিক্স আর্ট' },
            { cmd: 'metallic <টেক্সট> / ice <টেক্সট>', desc: 'মেটালিক ও আইস লোগো' },
            { cmd: 'blackpink <টেক্সট> / purple <টেক্সট>', desc: 'স্টাইলিশ রঙিন ব্যানার' }
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
    ai: 'ai', maya: 'ai', voice: 'ai', chatbot: 'ai',
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

function getTotalCommandCount() {
    let count = 0;
    for (const [key, cat] of Object.entries(MENU_CATEGORIES)) {
        if (key !== 'all' && Array.isArray(cat.commands)) count += cat.commands.length;
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
    const footer = settings.maya?.ui?.footerText || `Powered By ${botTitle} • মাহিরু v1.0`;
    const timeInfo = getDhakaTimeInfo();
    const userName = message?.pushName || 'Friend';
    const catKey = getRequestedCategory(message);\n    const isPrivileged = await isPrivilegedMenuRequest(sock, chatId, message);\n    if (catKey === 'owner' && !isPrivileged) {\n        await sock.sendMessage(chatId, { text: '❌ এই ক্যাটাগরিটি শুধু Owner/Sudo দেখতে পারবে।' }, { quoted: message });\n        return;\n    }

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
                { icon: '📦', label: 'MODULES', value: `${getTotalCommandCount()}+ Active Commands` },
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
