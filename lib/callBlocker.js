const path = require('path');
const {
    BOT_NAME,
    OWNER_NAME,
    loadJson,
    saveJson,
    normalizePhone,
    resolvePhone,
    isOwnerMessage,
    getContactRole,
    getEffectivePronounStyle,
    buildPremiumRichCard,
    generateWithFailover,
    safeSend,
    sendOwnerAlert,
    logActivity
} = require('./mayaCore');
const { sendVoiceReply } = require('./voiceReply');

const CALLBLOCK_FILE = path.join(process.cwd(), 'data', 'callblocker.json');

let state = loadJson(CALLBLOCK_FILE, {
    enabled: false,
    note: 'আমি এখন একটু ব্যস্ত আছি, পরে কল দেবেন। জরুরি হলে মেসেজ বা ভয়েস নোট দিয়ে রাখুন।',
    expiresAt: 0,
    voiceReply: true,
    vipNumbers: []
});

const recentCallMap = new Map();

function saveState() { saveJson(CALLBLOCK_FILE, state); }

function bnToEn(str = '') {
    const map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return String(str).replace(/[০-৯]/g, d => map[d] || d);
}

function parseDurationMs(input = '') {
    const clean = bnToEn(input).trim();
    const m = clean.match(/^(\d+)\s*(m|min|মিনিট|h|hr|ঘণ্টা|ঘন্টা)\b/i);
    if (!m) return { ms: 0, rest: input.trim() };
    const val = parseInt(m[1], 10);
    const isHour = ['h', 'hr', 'ঘণ্টা', 'ঘন্টা'].includes(m[2].toLowerCase());
    return { ms: val * (isHour ? 60 : 1) * 60 * 1000, rest: clean.slice(m[0].length).trim() };
}

function checkAutoExpiry() {
    if (state.enabled && state.expiresAt && Date.now() >= state.expiresAt) {
        state.enabled = false;
        state.expiresAt = 0;
        saveState();
        console.log(`⏰ ${BOT_NAME} Call Blocker auto-disabled.`);
    }
}

function getCallBlockState() {
    checkAutoExpiry();
    return state;
}

function setCallBlocker(enabled, note = '', durationStr = '') {
    state.enabled = Boolean(enabled);
    if (!state.enabled) {
        state.expiresAt = 0;
    } else {
        let finalNote = note ? note.trim() : '';
        let durationMs = 0;
        if (durationStr) {
            durationMs = parseDurationMs(durationStr).ms;
        } else if (finalNote) {
            const parsed = parseDurationMs(finalNote);
            if (parsed.ms > 0) {
                durationMs = parsed.ms;
                finalNote = parsed.rest;
            }
        }
        state.expiresAt = durationMs > 0 ? Date.now() + durationMs : 0;
        if (finalNote) state.note = finalNote;
    }
    saveState();
    return state;
}

function setCallBlockerVoice(enabled) {
    state.voiceReply = Boolean(enabled);
    saveState();
    return state.voiceReply;
}

function manageCallBlockerVip(phone, add = true) {
    const num = normalizePhone(phone);
    if (!num) return null;
    if (add) {
        if (!state.vipNumbers.includes(num)) state.vipNumbers.push(num);
    } else {
        state.vipNumbers = state.vipNumbers.filter(n => n !== num);
    }
    saveState();
    return num;
}

async function rewriteNoteWithMahiru(rawNote, role, style, callerName) {
    const styleLabel = {
        tui: 'তুই (কাছের বন্ধু)',
        tumi: 'তুমি (আন্তরিক ও নরম)',
        apni: 'আপনি (ভদ্র ও প্রফেশনাল)',
        tumi_tui: 'তুমি ও তুই মিশিয়ে'
    }[style] || 'আপনি';

    const prompt = `তুমি "${BOT_NAME}"—${OWNER_NAME}-এর মিষ্টি ও বুদ্ধিমতী অ্যাসিস্ট্যান্ট।
কেউ হোয়াটসঅ্যাপে কল দিয়েছিল কিন্তু কল ব্লকার অন থাকায় কলটি রিসিভ করা যায়নি।
${OWNER_NAME}-এর নোট: "${rawNote}"
কলার: ${callerName || 'অজানা'} | রোল: ${role} | সম্বোধন: ${styleLabel}

নিয়ম: নোটের মূল কথা ঠিক রেখে ${styleLabel} ও ${role} অনুযায়ী খুব সুন্দর ও মিষ্টি বাংলায় ২ লাইনের মধ্যে গুছিয়ে বলো যে ${OWNER_NAME} এখন কল ধরতে পারছেন না, তাই মেসেজ বা ভয়েস নোট দিয়ে রাখতে বলো। নিজের নাম ${BOT_NAME} বলবে।`;

    const { text } = await generateWithFailover(prompt, [{ role: 'user', text: 'কল কেটে যাওয়ার পর রিপ্লাই লিখে দাও।' }]);
    if (text) return text.replace(/\*\*(.*?)\*\*/g, '*$1*').trim();

    if (role === 'gf') return `জান, মনির এখন একটু ব্যস্ত (${rawNote}) 🥺 তাই কল ধরতে পারলো না—মেসেজ বা ভয়েস দিয়ে রাখো, ফ্রি হয়েই কল দিবে ❤️`;
    if (style === 'tui') return `দোস্ত, আমি *${BOT_NAME}* বলছি—মনির এখন ব্যস্ত (${rawNote})। মেসেজ বা ভয়েস দিয়ে রাখ, ফ্রি হইলেই কল দিবে! 😎`;
    return `আসসালামু আলাইকুম, আমি *${BOT_NAME}* বলছি। ${OWNER_NAME} এখন ব্যস্ত আছেন:\n> ${rawNote}\n\nমেসেজ বা ভয়েস নোট দিয়ে রাখুন, ফ্রি হলেই যোগাযোগ করবেন। 😊`;
}

async function handleIncomingCall(sock, calls = []) {
    checkAutoExpiry();
    if (!state.enabled || !Array.isArray(calls) || !calls.length) return false;

    let handledAny = false;
    for (const call of calls) {
        if (call.status && call.status !== 'offer') continue;
        const callerJid = call.from || call.peerJid || call.chatId;
        if (!callerJid) continue;

        const callerNum = resolvePhone(callerJid) || callerJid;
        if (state.vipNumbers.includes(callerNum)) continue;

        handledAny = true;

        try {
            if (typeof sock.rejectCall === 'function' && call.id) await sock.rejectCall(call.id, callerJid);
            else if (typeof sock.sendCallOfferAck === 'function' && call.id) await sock.sendCallOfferAck(call.id, callerJid, 'reject');
        } catch {}

        const callerName = sock.contacts?.[callerJid]?.notify || '';
        logActivity('call', `${callerName || 'Caller'} (+${callerNum})`, `কল ব্লকড (${state.note.slice(0, 50)})`);

        const now = Date.now();
        const tracker = recentCallMap.get(callerNum) || { count: 0, lastAt: 0, lastReplyAt: 0 };
        if (now - tracker.lastAt > 3 * 60 * 1000) tracker.count = 0;
        tracker.count += 1;
        tracker.lastAt = now;

        if (tracker.count >= 2) {
            await sendOwnerAlert(
                sock,
                'জরুরি কল অ্যালার্ট',
                `👤 *কলার:* ${callerName || 'Unknown'} (+${callerNum})\n📞 ৩ মিনিটে *${tracker.count} বার* কল দিয়েছেন!\n📝 *স্ট্যাটাস:* ${state.note}`
            );
        }

        if (now - tracker.lastReplyAt < 45 * 1000) {
            recentCallMap.set(callerNum, tracker);
            continue;
        }
        tracker.lastReplyAt = now;
        recentCallMap.set(callerNum, tracker);

        const role = getContactRole(callerJid, callerJid);
        const style = getEffectivePronounStyle(callerJid, callerJid, role);
        const polishedText = await rewriteNoteWithMaya(state.note, role, style, callerName);

        const badge = /(গেম|game|free fire|pubg)/i.test(state.note)
            ? '🎮 GAMING MODE • NO CALLS'
            : /(গোসল|shower)/i.test(state.note)
                ? '🚿 SHOWER MODE • BRB'
                : /(ঘুম|sleep)/i.test(state.note)
                    ? '🌙 SLEEPING MODE • DND'
                    : '📵 BUSY MODE • CALL REJECTED';

        const sent = await safeSend(sock, callerJid, {
            text: `📵 *কল রিসিভ করা সম্ভব হয়নি*\n──────────────\n${polishedText}`,
            contextInfo: buildPremiumRichCard('callblock', { badge, subtitle: `${OWNER_NAME} • মেসেজ বা ভয়েস দিন` })
        }).catch(() => null);

        if (state.voiceReply) {
            await sendVoiceReply(sock, callerJid, sent || undefined, polishedText, role, style).catch(() => null);
        }
    }
    return handledAny;
}

async function handleCallBlockCommand(sock, chatId, message, rawArgs = '') {
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
    let configuredOwner = Boolean(message?.key?.fromMe);
    if (!configuredOwner) {
        try {
            configuredOwner = await require('./isOwner').isConfiguredOwner(senderId, sock, chatId, message);
        } catch {}
    }
    if (!configuredOwner) {
        return safeSend(sock, chatId, { text: '❌ এই কমান্ড শুধু Bot Owner ব্যবহার করতে পারবেন।' }, { quoted: message });
    }

    checkAutoExpiry();
    const parts = rawArgs.trim().split(/\s+/).filter(Boolean);
    const sub = (parts[0] || '').toLowerCase();

    if (sub === 'on') {
        setCallBlocker(true, parts.slice(1).join(' ').trim());
        const timerText = state.expiresAt
            ? `\n⏳ *অটো-অফ:* ${new Date(state.expiresAt).toLocaleTimeString('bn-BD', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: true })}`
            : '';
        return safeSend(sock, chatId, {
            text: `📵 *${BOT_NAME} স্মার্ট কল ব্লকার চালু!*\n\n📝 *নোট:*\n> ${state.note}${timerText}\n\n🎙️ *ভয়েস রিপ্লাই:* ${state.voiceReply ? 'চালু ✅' : 'বন্ধ ❌'}`
        }, { quoted: message });
    }
    if (sub === 'off') {
        setCallBlocker(false);
        return safeSend(sock, chatId, { text: '✅ স্মার্ট কল ব্লকার বন্ধ করা হয়েছে।' }, { quoted: message });
    }
    if (sub === 'voice') {
        const v = setCallBlockerVoice((parts[1] || '').toLowerCase() !== 'off');
        return safeSend(sock, chatId, { text: `🎙️ কল ব্লকার ভয়েস রিপ্লাই এখন *${v ? 'চালু ✅' : 'বন্ধ ❌'}*` }, { quoted: message });
    }
    if (sub === 'vip' || sub === 'unvip') {
        const num = manageCallBlockerVip(parts[1] || '', sub === 'vip');
        if (!num) return safeSend(sock, chatId, { text: '❌ নিয়ম: `.callblock vip 017xxxxxxxx`' }, { quoted: message });
        return safeSend(sock, chatId, {
            text: sub === 'vip' ? `⭐ \`${num}\` VIP লিস্টে যুক্ত হয়েছে।` : `🗑️ \`${num}\` VIP লিস্ট থেকে বাদ দেওয়া হয়েছে।`
        }, { quoted: message });
    }

    const help = `📵 *${BOT_NAME} স্মার্ট কল ব্লকার প্যানেল*
──────────────
• *স্ট্যাটাস:* ${state.enabled ? '🟢 চালু আছে' : '⚪ বন্ধ আছে'}
• *নোট:* ${state.note}
• *VIP নম্বর:* ${state.vipNumbers.length ? state.vipNumbers.join(', ') : 'নেই'}

*কমান্ড:* \`.callblock on 1h <নোট>\` | \`.callblock off\` | \`.callblock voice on/off\` | \`.callblock vip 017xxx\``;
    return safeSend(sock, chatId, { text: help }, { quoted: message });
}

module.exports = {
    handleIncomingCall,
    handleCallBlockCommand,
    setCallBlocker,
    setCallBlockerVoice,
    manageCallBlockerVip,
    getCallBlockState
};
