const fs = require('fs');
const isOwnerOrSudo = require('../lib/isOwner');

const PMBLOCKER_PATH = './data/pmblocker.json';

function readState() {
    try {
        if (!fs.existsSync(PMBLOCKER_PATH)) return { enabled: false, message: '⚠️ ব্যক্তিগত মেসেজ বন্ধ রয়েছে!\nএই বটকে ইনবক্সে মেসেজ পাঠানো যাবে না। শুধু গ্রুপে মালিকের সঙ্গে যোগাযোগ করুন।' };
        const raw = fs.readFileSync(PMBLOCKER_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return {
            enabled: !!data.enabled,
            message: typeof data.message === 'string' && data.message.trim() ? data.message : '⚠️ ব্যক্তিগত মেসেজ বন্ধ রয়েছে!\nএই বটকে ইনবক্সে মেসেজ পাঠানো যাবে না। শুধু গ্রুপে মালিকের সঙ্গে যোগাযোগ করুন।'
        };
    } catch {
        return { enabled: false, message: '⚠️ ব্যক্তিগত মেসেজ বন্ধ রয়েছে!\nএই বটকে ইনবক্সে মেসেজ পাঠানো যাবে না। শুধু গ্রুপে মালিকের সঙ্গে যোগাযোগ করুন।' };
    }
}

function writeState(enabled, message) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        const current = readState();
        const payload = {
            enabled: !!enabled,
            message: typeof message === 'string' && message.trim() ? message : current.message
        };
        fs.writeFileSync(PMBLOCKER_PATH, JSON.stringify(payload, null, 2));
    } catch {}
}

async function pmblockerCommand(sock, chatId, message, args) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!message.key.fromMe && !isOwner) {
        await sock.sendMessage(chatId, { text: 'শুধু বটের মালিক এই কমান্ড ব্যবহার করতে পারবেন!' }, { quoted: message });
        return;
    }
    
    const argStr = (args || '').trim();
    const [sub, ...rest] = argStr.split(' ');
    const state = readState();

    if (!sub || !['on', 'off', 'status', 'setmsg'].includes(sub.toLowerCase())) {
        await sock.sendMessage(chatId, { text: '*ব্যক্তিগত মেসেজ নিয়ন্ত্রণ (শুধু Owner)*\n\n.pmblocker on — ব্যক্তিগত মেসেজ বন্ধ চালু\n.pmblocker off — ব্যক্তিগত মেসেজ নিয়ন্ত্রণ বন্ধ\n.pmblocker status — বর্তমান অবস্থা দেখুন\n.pmblocker setmsg <লেখা> — সতর্কবার্তা নির্ধারণ করুন' }, { quoted: message });
        return;
    }

    if (sub.toLowerCase() === 'status') {
        await sock.sendMessage(chatId, { text: `ব্যক্তিগত মেসেজ নিয়ন্ত্রণ *${state.enabled ? 'চালু' : 'বন্ধ'}*\nবার্তা: ${state.message}` }, { quoted: message });
        return;
    }

    if (sub.toLowerCase() === 'setmsg') {
        const newMsg = rest.join(' ').trim();
        if (!newMsg) {
            await sock.sendMessage(chatId, { text: 'ব্যবহার: .pmblocker setmsg <বার্তা>' }, { quoted: message });
            return;
        }
        writeState(state.enabled, newMsg);
        await sock.sendMessage(chatId, { text: 'সতর্কবার্তা আপডেট হয়েছে।' }, { quoted: message });
        return;
    }

    const enable = sub.toLowerCase() === 'on';
    writeState(enable);
    await sock.sendMessage(chatId, { text: `ব্যক্তিগত মেসেজ নিয়ন্ত্রণ *${enable ? 'চালু' : 'বন্ধ'}* করা হয়েছে।` }, { quoted: message });
}

module.exports = { pmblockerCommand, readState };


