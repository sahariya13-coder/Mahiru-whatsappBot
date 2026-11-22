const { setAntiBadword, getAntiBadword, removeAntiBadword, incrementWarningCount, resetWarningCount } = require('../lib/index');
const fs = require('fs');
const path = require('path');

// Load antibadword config
function loadAntibadwordConfig(groupId) {
    try {
        const configPath = path.join(__dirname, '../data/userGroupData.json');
        if (!fs.existsSync(configPath)) {
            return {};
        }
        const data = JSON.parse(fs.readFileSync(configPath));
        return data.antibadword?.[groupId] || {};
    } catch (error) {
        console.error('❌ Error loading antibadword config:', error.message);
        return {};
    }
}

async function handleAntiBadwordCommand(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIBADWORD SETUP*\n\n*.antibadword on*\nTurn on antibadword\n\n*.antibadword set <action>*\nSet action: delete/kick/warn\n\n*.antibadword off*\nDisables antibadword in this group`
        }, { quoted: message });
    }

    if (match === 'on') {
        const existingConfig = await getAntiBadword(chatId, 'on');
        if (existingConfig?.enabled) {
            return sock.sendMessage(chatId, { text: '*AntiBadword is already enabled for this group*' });
        }
        await setAntiBadword(chatId, 'on', 'delete');
        return sock.sendMessage(chatId, { text: '*AntiBadword has been enabled. Use .antibadword set <action> to customize action*' }, { quoted: message });
    }

    if (match === 'off') {
        const config = await getAntiBadword(chatId, 'on');
        if (!config?.enabled) {
            return sock.sendMessage(chatId, { text: '*AntiBadword is already disabled for this group*' }, { quoted: message } );
        }
        await removeAntiBadword(chatId);
        return sock.sendMessage(chatId, { text: '*AntiBadword has been disabled for this group*' }, { quoted: message } );
    }

    if (match.startsWith('set')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, { text: '*Invalid action. Choose: delete, kick, or warn*' }, { quoted: message } );
        }
        await setAntiBadword(chatId, 'on', action);
        return sock.sendMessage(chatId, { text: `*AntiBadword action set to: ${action}*` }, { quoted: message } );
    }

    return sock.sendMessage(chatId, { text: '*Invalid command. Use .antibadword to see usage*' }, { quoted: message } );
}

async function detectProfanityWithAI(userMessage, chatId) {
    const text = String(userMessage || '').trim().slice(0, 1500);
    if (!text) return false;
    try {
        const { chatWithMahiruAI } = require('./mahiruAI');
        const system = [
            'You are a multilingual WhatsApp group profanity and abuse moderation classifier.',
            'Judge meaning and intent, not a fixed word list. Understand Bengali script, Banglish, transliterated Bengali, English, Hindi/Urdu, mixed languages, slang, phonetic misspellings, character substitutions, spacing, and creative spellings.',
            'Detect clear profanity, vulgar sexual insults, degrading slurs, and targeted abusive language even with unfamiliar or incorrect spelling.',
            'Do NOT flag harmless phrases, ordinary criticism, friendly non-abusive banter, neutral discussion, educational explanations, or suspicious-looking substrings without abusive meaning.',
            'Return only JSON: {"is_abusive":true|false,"confidence":0.0,"reason":"short explanation"}.',
            'Set is_abusive=true only for clearly abusive/profane meaning. Require confidence >= 0.82.'
        ].join(' ');
        const answer = await chatWithMahiruAI({
            uid: 'antibadword-' + chatId,
            text: 'Classify this WhatsApp group message:\n' + text,
            system
        });
        const match = String(answer).match(/\{[\s\S]*\}/);
        if (!match) return false;
        const result = JSON.parse(match[0]);
        const confidence = Number(result.confidence);
        const detected = result.is_abusive === true && Number.isFinite(confidence) && confidence >= 0.82;
        if (detected) console.log('[ANTIBADWORD AI] Abusive message detected:', String(result.reason || ''));
        return detected;
    } catch (error) {
        console.error('[ANTIBADWORD AI] Detection failed:', error.message);
        return false;
    }
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    const config = loadAntibadwordConfig(chatId);
    if (!config.enabled || !chatId.endsWith('@g.us') || message.key.fromMe) return;

    const antiBadwordConfig = await getAntiBadword(chatId, 'on');
    if (!antiBadwordConfig?.enabled) return;

    const cleanMessage = String(userMessage || '').toLowerCase()
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ').trim();

    const badWords = [
        'gandu','madarchod','bhosdike','bsdk','fucker','bhosda','lauda','laude',
        'betichod','chutiya','maa ki chut','behenchod','behen ki chut',
        'tatto ke saudagar','machar ki jhant','jhant ka baal','randi','chuchi',
        'boobs','boobies','tits','idiot','nigga','fuck','dick','bitch','bastard',
        'asshole','asu','awyu','teri ma ki chut','teri maa ki','lund',
        'lund ke baal','mc','lodu','benchod','shit','damn','hell','piss','crap',
        'slut','whore','prick','motherfucker','cock','cunt','pussy','twat',
        'wanker','douchebag','jackass','moron','retard','scumbag','skank',
        'slutty','arse','bugger','sod off','chut','laude ka baal','madar',
        'behen ke lode','chodne','sala kutta','harami','randi ki aulad',
        'gaand mara','chodu','lund le','gandu saala','kameena','haramzada',
        'chamiya','chodne wala','chudai','chutiye ke baap','fck','fckr','fcker',
        'fuk','fukk','fcuk','btch','bch','assclown','f@ck','b!tch','d!ck',
        'n!gga','l0du','lund69','spic','chink','cracker','towelhead','gook',
        'kike','paki','honky','wetback','raghead','jungle bunny','sand nigger',
        'beaner','blowjob','handjob','cum','cumshot','jizz','deepthroat','fap',
        'hentai','milf','anal','orgasm','dildo','vibrator','gangbang',
        'threesome','porn','sex','xxx','fag','faggot','dyke','tranny','homo',
        'sissy','fairy','lesbo','weed','pot','coke','heroin','meth','crack',
        'dope','bong','kush','hash','trip','rolling',
        'শালা','হারামজাদা','হারামি','মাদারচোদ','বাল','খানকির পোলা',
        'চোদনা','কুত্তার বাচ্চা','চুতমারানি'
    ];

    const words = cleanMessage.split(' ');
    let containsBadWord = words.some(word => word.length >= 2 && badWords.includes(word));
    if (!containsBadWord) containsBadWord = badWords.some(word => word.includes(' ') && cleanMessage.includes(word));
    if (!containsBadWord) containsBadWord = await detectProfanityWithAI(userMessage, chatId);
    if (!containsBadWord) return;

    const groupMetadata = await sock.groupMetadata(chatId);
    const normalizeJid = value => typeof value === 'string' ? value.replace(/:\d+@/, '@') : '';
    const senderCandidates = new Set([senderId, message.key?.participant, message.key?.participantAlt].map(normalizeJid).filter(Boolean));
    const participant = groupMetadata.participants.find(p =>
        [p.id, p.lid, p.phoneNumber].some(id => senderCandidates.has(normalizeJid(id)))
    );
    const botIds = new Set([sock.user?.id, sock.user?.lid, sock.decodeJid?.(sock.user?.id), sock.decodeJid?.(sock.user?.lid)].map(normalizeJid).filter(Boolean));
    const bot = groupMetadata.participants.find(p =>
        [p.id, p.lid, p.phoneNumber].some(id => botIds.has(normalizeJid(id)))
    );
    if (!bot?.admin || participant?.admin) return;

    const targetId = participant?.id || senderId;
    try {
        await sock.sendMessage(chatId, { delete: message.key });
    } catch (error) {
        console.error('Error deleting abusive message:', error);
        return;
    }

    switch (antiBadwordConfig.action) {
        case 'delete':
            await sock.sendMessage(chatId, {
                text: '@' + targetId.split('@')[0] + ' অশালীন ভাষা ব্যবহার করা যাবে না।',
                mentions: [targetId]
            });
            break;
        case 'kick':
            try {
                await sock.groupParticipantsUpdate(chatId, [targetId], 'remove');
                await sock.sendMessage(chatId, {
                    text: '@' + targetId.split('@')[0] + ' অশালীন ভাষা ব্যবহারের জন্য গ্রুপ থেকে সরানো হয়েছে।',
                    mentions: [targetId]
                });
            } catch (error) {
                console.error('Error kicking user:', error);
            }
            break;
        case 'warn': {
            const warningCount = await incrementWarningCount(chatId, targetId);
            if (warningCount >= 3) {
                try {
                    await sock.groupParticipantsUpdate(chatId, [targetId], 'remove');
                    await resetWarningCount(chatId, targetId);
                    await sock.sendMessage(chatId, {
                        text: '@' + targetId.split('@')[0] + ' ৩টি Warning পাওয়ায় গ্রুপ থেকে সরানো হয়েছে।',
                        mentions: [targetId]
                    });
                } catch (error) {
                    console.error('Error kicking user after warnings:', error);
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: '@' + targetId.split('@')[0] + ' অশালীন ভাষার জন্য Warning ' + warningCount + '/3',
                    mentions: [targetId]
                });
            }
            break;
        }
    }
}
module.exports = {
    handleAntiBadwordCommand,
    handleBadwordDetection
}; 