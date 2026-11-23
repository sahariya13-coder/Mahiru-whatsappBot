'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(process.cwd(), 'data', 'takeover_prefs.json');
const MAX_CHATS = 300;

function loadState() {
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        const chats = parsed && typeof parsed.chats === 'object' && !Array.isArray(parsed.chats)
            ? parsed.chats : {};
        const clean = {};
        for (const [chatId, value] of Object.entries(chats).slice(-MAX_CHATS)) {
            if (typeof chatId === 'string' && chatId.endsWith('@s.whatsapp.net') && value === true) clean[chatId] = true;
        }
        return { chats: clean };
    } catch {
        return { chats: {} };
    }
}

let state = loadState();

function saveState() {
    let temp = '';
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        temp = FILE + '.tmp-' + process.pid;
        fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(temp, FILE);
        return true;
    } catch (error) {
        if (temp) { try { fs.unlinkSync(temp); } catch {} }
        console.error('[TAKEOVER] Save failed:', error.message);
        return false;
    }
}

function isEnabled(chatId) {
    return Boolean(chatId && state.chats[chatId] === true);
}

function setEnabled(chatId, enabled) {
    if (!chatId || !chatId.endsWith('@s.whatsapp.net')) {
        return { ok: false, error: 'Takeover শুধু ব্যক্তিগত ইনবক্সে ব্যবহার করা যাবে।' };
    }
    if (enabled) {
        state.chats[chatId] = true;
        const keys = Object.keys(state.chats);
        while (keys.length > MAX_CHATS) delete state.chats[keys.shift()];
    } else {
        delete state.chats[chatId];
    }
    if (!saveState()) return { ok: false, error: 'Takeover setting সংরক্ষণ করা যায়নি।' };
    return { ok: true, enabled: Boolean(enabled) };
}

async function handleTakeoverCommand(sock, chatId, message, rawArgs = '', isRootOwner = false) {
    if (!isRootOwner) {
        await sock.sendMessage(chatId, { text: '🔒 এই কমান্ডটি শুধু মূল Bot Owner ব্যবহার করতে পারবেন।' }, { quoted: message });
        return false;
    }

    const action = String(rawArgs || '').trim().toLowerCase();
    if (action === 'on' || action === 'enable' || action === 'চালু') {
        const result = setEnabled(chatId, true);
        await sock.sendMessage(chatId, {
            text: result.ok
                ? '🧑‍💻 *Human Takeover চালু হয়েছে।*\nএই ইনবক্সে Mahiru AI স্বয়ংক্রিয় উত্তর দেবে না। বন্ধ করতে .takeover off লিখুন।'
                : '❌ ' + result.error
        }, { quoted: message });
        return true;
    }

    if (action === 'off' || action === 'disable' || action === 'বন্ধ') {
        const result = setEnabled(chatId, false);
        await sock.sendMessage(chatId, {
            text: result.ok
                ? '🤖 *Mahiru AI আবার চালু হয়েছে।*\nএই ইনবক্সে স্বয়ংক্রিয় উত্তর পুনরায় সক্রিয়।'
                : '❌ ' + result.error
        }, { quoted: message });
        return true;
    }

    await sock.sendMessage(chatId, {
        text: '🧑‍💻 *HUMAN TAKEOVER STATUS*\n\nবর্তমান ইনবক্স: ' +
            (isEnabled(chatId) ? '*MANUAL MODE — AI PAUSED*' : '*AI MODE — ACTIVE*') +
            '\n\nব্যবহার:\n.takeover on — এই ইনবক্সে AI উত্তর বন্ধ\n.takeover off — AI উত্তর আবার চালু\n.tk — বর্তমান স্ট্যাটাস'
    }, { quoted: message });
    return true;
}

module.exports = { isEnabled, setEnabled, handleTakeoverCommand };
