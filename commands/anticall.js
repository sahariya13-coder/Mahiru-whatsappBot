const fs = require('fs');

const ANTICALL_PATH = './data/anticall.json';

function readState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) return { enabled: false };
        const raw = fs.readFileSync(ANTICALL_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return { enabled: !!data.enabled };
    } catch {
        return { enabled: false };
    }
}

function writeState(enabled) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync(ANTICALL_PATH, JSON.stringify({ enabled: !!enabled }, null, 2));
    } catch {}
}

async function anticallCommand(sock, chatId, message, args) {
    const state = readState();
    const sub = (args || '').trim().toLowerCase();

    if (!sub || (sub !== 'on' && sub !== 'off' && sub !== 'status')) {
        await sock.sendMessage(chatId, { text: '*কল নিয়ন্ত্রণ*\n\n.anticall on — আসা কল স্বয়ংক্রিয়ভাবে কেটে দেবে\n.anticall off — কল নিয়ন্ত্রণ বন্ধ করবে\n.anticall status — বর্তমান অবস্থা দেখাবে' }, { quoted: message });
        return;
    }

    if (sub === 'status') {
        await sock.sendMessage(chatId, { text: `কল নিয়ন্ত্রণ বর্তমানে *${state.enabled ? 'চালু' : 'বন্ধ'}*।` }, { quoted: message });
        return;
    }

    const enable = sub === 'on';
    writeState(enable);
    await sock.sendMessage(chatId, { text: `কল নিয়ন্ত্রণ *${enable ? 'চালু' : 'বন্ধ'}* করা হয়েছে।` }, { quoted: message });
}

module.exports = { anticallCommand, readState };


