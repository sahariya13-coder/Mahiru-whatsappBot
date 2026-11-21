/**
 * Mahiru owner backup and restore.
 * Exports persistent data/ files and the lightweight WhatsApp store.
 * Authentication/session secrets and API keys are intentionally excluded.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const settings = require('../settings');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(ROOT, 'baileys_store.json');
const BACKUP_DIR = path.join(ROOT, '.mahiru-backup');
const REQUESTS = new Map();
let dailyStarted = false;
let activeSock = null;

function ownerJid() {
    const number = String(settings.ownerNumber || '').replace(/\D/g, '');
    if (!number) throw new Error('settings.ownerNumber is not configured');
    return number + '@s.whatsapp.net';
}

async function isOwnerMessage(senderId, message, sock, chatId) {
    if (message?.key?.fromMe) return true;
    try {
        return await require('../lib/isOwner').isConfiguredOwner(senderId, sock, chatId, message);
    } catch (error) {
        console.error('[BACKUP] Owner verification failed:', error.message);
        return false;
    }
}

function collectFiles(dir, relative = 'data') {
    const output = {};
    if (!fs.existsSync(dir)) return output;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) Object.assign(output, collectFiles(full, rel));
        else if (entry.isFile() && !/\.tmp-|\.restore-/.test(entry.name)) {
            const stat = fs.statSync(full);
            if (stat.size > 50 * 1024 * 1024) {
                console.warn('[BACKUP] Skipping oversized file:', rel);
                continue;
            }
            output[rel] = fs.readFileSync(full).toString('base64');
        }
    }
    return output;
}

function createBackupBuffer() {
    try { require('../lib/lightweight_store').writeToFile(); }
    catch (error) { console.warn('[BACKUP] Store flush warning:', error.message); }

    const files = collectFiles(DATA_DIR);
    if (fs.existsSync(STORE_FILE)) files['baileys_store.json'] = fs.readFileSync(STORE_FILE).toString('base64');
    const payload = {
        app: 'Mahiru WhatsApp Bot',
        format: 1,
        createdAt: new Date().toISOString(),
        files
    };
    return zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 });
}

async function sendBackup(sock, destination = ownerJid(), label = 'Manual') {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const buffer = createBackupBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = 'Mahiru-Backup-' + stamp + '.json.gz';
    fs.writeFileSync(path.join(BACKUP_DIR, fileName), buffer);
    await sock.sendMessage(destination, {
        document: buffer,
        mimetype: 'application/gzip',
        fileName,
        caption: 'Mahiru ' + label + ' Backup\nCreated: ' +
            new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }) +
            '\nContains: User, Group, Inbox and bot data'
    });
    return { fileName, size: buffer.length };
}

function readDocument(message) {
    const root = message?.message?.ephemeralMessage?.message ||
        message?.message?.viewOnceMessage?.message ||
        message?.message?.viewOnceMessageV2?.message ||
        message?.message;
    return root?.documentMessage || root?.documentWithCaptionMessage?.message?.documentMessage || null;
}

async function downloadDocument(document) {
    const stream = await downloadContentFromMessage(document, 'document');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

function writeRestoreFiles(payload) {
    if (!payload || payload.app !== 'Mahiru WhatsApp Bot' || payload.format !== 1 ||
        !payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) {
        throw new Error('Invalid Mahiru backup file');
    }

    const entries = Object.entries(payload.files);
    if (!entries.length || entries.length > 10000) throw new Error('Backup is empty or contains too many files');

    const decoded = [];
    for (const [relative, encoded] of entries) {
        if (typeof relative !== 'string' ||
            !(relative === 'baileys_store.json' || relative.startsWith('data/')) ||
            relative.includes('..') || path.isAbsolute(relative) || typeof encoded !== 'string') {
            throw new Error('Backup contains an unsafe file path');
        }
        const bytes = Buffer.from(encoded, 'base64');
        if (relative.endsWith('.json')) JSON.parse(bytes.toString('utf8'));
        decoded.push({ relative, bytes });
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const safetyName = 'pre-restore-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json.gz';
    fs.writeFileSync(path.join(BACKUP_DIR, safetyName), createBackupBuffer());

    for (const item of decoded) {
        const target = path.resolve(ROOT, item.relative);
        if (!target.startsWith(ROOT + path.sep)) throw new Error('Unsafe restore destination');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temp = target + '.restore-' + process.pid;
        fs.writeFileSync(temp, item.bytes);
        fs.renameSync(temp, target);
    }

    try { require('../lib/persistent_data').backup(); }
    catch (error) { console.warn('[BACKUP] Runtime snapshot refresh warning:', error.message); }
}

async function handleBackupMessage(sock, message, chatId, senderId, rawText) {
    const text = String(rawText || '').trim();
    const owner = await isOwnerMessage(senderId, message, sock, chatId);
    const requestKey = String(senderId || chatId);
    const document = readDocument(message);

    if (/^\.backup(?:\s|$)/i.test(text)) {
        if (!owner) {
            await sock.sendMessage(chatId, { text: 'এই কমান্ডটি শুধু Bot Owner ব্যবহার করতে পারবেন।' }, { quoted: message });
            return true;
        }
        const action = text.split(/\s+/)[1]?.toLowerCase();
        if (action === 'restore') {
            REQUESTS.set(requestKey, { chatId, requestedAt: Date.now() });
            await sock.sendMessage(chatId, {
                text: 'Restore করার জন্য এখন Mahiru Backup ফাইলটি Document হিসেবে পাঠান অথবা এই মেসেজের রিপ্লাই দিয়ে Backup ফাইল পাঠান।\n\nশুধু Mahiru-র .json.gz Backup ফাইল গ্রহণ করা হবে।'
            }, { quoted: message });
            return true;
        }
        if (action && action !== 'now') {
            await sock.sendMessage(chatId, { text: 'ব্যবহার:\n.backup — এখনই Backup পাঠাবে\n.backup restore — Backup ফাইল চাইবে' }, { quoted: message });
            return true;
        }
        try {
            await sock.sendMessage(chatId, { text: 'Backup তৈরি হচ্ছে...' }, { quoted: message });
            const result = await sendBackup(sock, ownerJid(), 'Manual');
            await sock.sendMessage(chatId, {
                text: 'Backup Owner-এর WhatsApp-এ পাঠানো হয়েছে।\nFile: ' + result.fileName +
                    '\nSize: ' + (result.size / 1024 / 1024).toFixed(2) + ' MB'
            }, { quoted: message });
        } catch (error) {
            console.error('[BACKUP] Manual backup failed:', error);
            await sock.sendMessage(chatId, { text: 'Backup তৈরি বা পাঠানো যায়নি: ' + error.message }, { quoted: message });
        }
        return true;
    }

    const pending = REQUESTS.get(requestKey);
    if (!pending || pending.chatId !== chatId || !document || !owner) return false;

    REQUESTS.delete(requestKey);
    try {
        await sock.sendMessage(chatId, { text: 'Backup ফাইল যাচাই করে Restore করা হচ্ছে...' }, { quoted: message });
        const compressed = await downloadDocument(document);
        const jsonBuffer = zlib.gunzipSync(compressed);
        if (jsonBuffer.length > 100 * 1024 * 1024) throw new Error('Backup file is too large');
        const payload = JSON.parse(jsonBuffer.toString('utf8'));
        writeRestoreFiles(payload);
        await sock.sendMessage(chatId, {
            text: '✅ Restore সফল হয়েছে।\nBackup Date: ' + (payload.createdAt || 'Unknown') +
                '\nনিরাপদে Restore সম্পন্ন করতে বট Restart হচ্ছে।'
        }, { quoted: message });
        setTimeout(() => process.exit(1), 1500);
    } catch (error) {
        console.error('[BACKUP] Restore failed:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Restore ব্যর্থ হয়েছে: ' + error.message + '\nসঠিক Mahiru Backup ফাইল পাঠান।'
        }, { quoted: message });
    }
    return true;
}

function startDailyBackup(sock) {
    activeSock = sock;
    if (dailyStarted) return;
    dailyStarted = true;
    const moment = require('moment-timezone');
    const scheduleNext = () => {
        const nextMidnight = moment.tz('Asia/Dhaka').clone().add(1, 'day').startOf('day');
        const delay = Math.max(1000, nextMidnight.valueOf() - Date.now());
        const timer = setTimeout(async () => {
            try {
                const result = await sendBackup(activeSock, ownerJid(), 'Daily');
                console.log('[BACKUP] Daily backup sent:', result.fileName);
            } catch (error) {
                console.error('[BACKUP] Daily backup failed:', error.message);
                try { await activeSock.sendMessage(ownerJid(), { text: 'Mahiru Daily Backup ব্যর্থ হয়েছে: ' + error.message }); }
                catch (_) {}
            }
            scheduleNext();
        }, delay);
        if (typeof timer.unref === 'function') timer.unref();
    };
    scheduleNext();
    console.log('[BACKUP] Daily backup scheduled for 12:00 AM Asia/Dhaka.');
}

module.exports = { handleBackupMessage, startDailyBackup, sendBackup };
