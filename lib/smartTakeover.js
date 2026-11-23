'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'takeover_prefs.json');
const MAX_TRACKED_CHATS = 30;
const OWNER_ACTIVE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_DELAY_MINUTES = 2;

let enabled = true;
let delayMinutes = DEFAULT_DELAY_MINUTES;
const chats = new Map();

function load() {
    try {
        const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (typeof data.enabled === 'boolean') enabled = data.enabled;
        if (Number.isInteger(data.delayMinutes) && data.delayMinutes >= 1 && data.delayMinutes <= 30) {
            delayMinutes = data.delayMinutes;
        }
    } catch {}
}

function save() {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const temp = FILE + '.tmp';
        fs.writeFileSync(temp, JSON.stringify({ enabled, delayMinutes }, null, 2), 'utf8');
        fs.renameSync(temp, FILE);
        return true;
    } catch (error) {
        console.error('[SMART TAKEOVER] Save failed:', error.message);
        return false;
    }
}

function cancel(chatId, remove = false) {
    const entry = chats.get(chatId);
    if (!entry) return false;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.pendingMessage = null;
    entry.pendingText = '';
    entry.pendingSender = '';
    if (remove) chats.delete(chatId);
    return true;
}

function prune() {
    const now = Date.now();
    for (const [chatId, entry] of chats) {
        if (!entry.timer && now - entry.lastOwnerReplyAt > OWNER_ACTIVE_WINDOW_MS) chats.delete(chatId);
    }
}

function recordOwnerManualReply(chatId) {
    if (!chatId || chatId.endsWith('@g.us')) return;
    cancel(chatId);
    prune();
    if (!chats.has(chatId) && chats.size >= MAX_TRACKED_CHATS) {
        const oldest = chats.keys().next().value;
        if (oldest) cancel(oldest, true);
    }
    chats.set(chatId, {
        lastOwnerReplyAt: Date.now(),
        timer: null,
        pendingMessage: null,
        pendingText: '',
        pendingSender: ''
    });
}

function queueSmartTakeoverReply(sock, chatId, message, text, senderId, replyHandler, responseMode = 'text') {
    if (!enabled || !chatId || chatId.endsWith('@g.us') || typeof replyHandler !== 'function') return false;
    const entry = chats.get(chatId);
    if (!entry) return false;
    if (Date.now() - entry.lastOwnerReplyAt > OWNER_ACTIVE_WINDOW_MS && !entry.timer) {
        chats.delete(chatId);
        return false;
    }

    const piece = String(text || '').trim();
    if (piece) entry.pendingText = (entry.pendingText ? entry.pendingText + '\\n' : '') + piece;
    entry.pendingText = entry.pendingText.slice(-1200);
    entry.pendingMessage = message;
    entry.pendingSender = senderId;

    if (!entry.timer) {
        entry.timer = setTimeout(async () => {
            const current = chats.get(chatId);
            if (!current) return;
            const savedMessage = current.pendingMessage;
            const savedText = current.pendingText;
            const savedSender = current.pendingSender;
            chats.delete(chatId);
            if (!savedMessage || !sock?.user) return;
            try {
                await replyHandler(sock, chatId, savedMessage, savedText, savedSender, responseMode);
            } catch (error) {
                console.error('[SMART TAKEOVER] Delayed AI reply failed:', error.message);
            }
        }, delayMinutes * 60 * 1000);
        if (entry.timer.unref) entry.timer.unref();
    }
    return true;
}

function configure(action = '') {
    const value = String(action || '').trim().toLowerCase();
    if (value === 'off' || value === 'disable') {
        enabled = false;
        for (const chatId of chats.keys()) cancel(chatId, true);
        save();
        return getStatus();
    }
    if (value === 'on' || value === 'enable') {
        enabled = true;
        save();
        return getStatus();
    }
    if (/^\\d{1,2}$/.test(value)) {
        delayMinutes = Math.max(1, Math.min(30, Number(value)));
        enabled = true;
        save();
        return getStatus();
    }
    return getStatus();
}

function getStatus() {
    prune();
    let pendingReplies = 0;
    for (const entry of chats.values()) if (entry.timer) pendingReplies++;
    return { enabled, delayMinutes, watchedChats: chats.size, pendingReplies };
}

load();

module.exports = { recordOwnerManualReply, queueSmartTakeoverReply, configure, getStatus };
