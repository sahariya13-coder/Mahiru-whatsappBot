/**
 * Mahiru owner backup and restore.
 * Exports persistent data/ files and the lightweight WhatsApp store.
 * WhatsApp authentication/session secrets are excluded; bot configuration is included.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const settings = require('../settings');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { sendToBotInboxAndOwner, notifyOwner } = require('../lib/ownerNotify');

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

// Only persistent application data is backed up. Media, generated files,
// caches and temporary files are intentionally excluded to keep backups small.
const BACKUP_DATA_EXTENSIONS = new Set([
    '.json', '.json5', '.jsonl', '.db', '.sqlite', '.sqlite3',
    '.txt', '.csv', '.yaml', '.yml', '.ini', '.conf', '.xml'
]);
const EXCLUDED_DATA_DIRS = new Set([
    'cache', 'caches', 'tmp', 'temp', 'media', 'images', 'image',
    'audio', 'voice', 'voices', 'video', 'videos', 'uploads',
    'downloads', 'thumbnails'
]);

function shouldBackupDataFile(filePath) {
    return BACKUP_DATA_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function collectFiles(dir, relative = 'data') {
    const output = {};
    if (!fs.existsSync(dir)) return output;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.posix.join(relative, entry.name);

        if (entry.isDirectory()) {
            if (!EXCLUDED_DATA_DIRS.has(entry.name.toLowerCase())) {
                Object.assign(output, collectFiles(full, rel));
            }
        } else if (entry.isFile() && shouldBackupDataFile(entry.name)) {
            output[rel] = fs.readFileSync(full).toString('base64');
        } else if (entry.isSymbolicLink() && shouldBackupDataFile(entry.name)) {
            const stat = fs.statSync(full);
            if (stat.isFile()) output[rel] = fs.readFileSync(full).toString('base64');
        }
    }
    return output;
}

function createBackupBuffer() {
    try { require('../lib/lightweight_store').writeToFile(); }
    catch (error) { console.warn('[BACKUP] Store flush warning:', error.message); }

    const files = collectFiles(DATA_DIR);
    for (const configFile of ['settings.js', 'config.js', '.env']) {
        const fullPath = path.join(ROOT, configFile);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            files[configFile] = fs.readFileSync(fullPath).toString('base64');
        }
    }
    if (fs.existsSync(STORE_FILE)) files['baileys_store.json'] = fs.readFileSync(STORE_FILE).toString('base64');
    const payload = {
        app: 'Mahiru WhatsApp Bot',
        format: 1,
        createdAt: new Date().toISOString(),
        files
    };
    return zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 });
}

async function sendBackup(sock, destination = null, label = 'ম্যানুয়াল') {
    // Push the latest persistent data to Redis before producing the WhatsApp archive.
    try { await require('../lib/persistent_data').syncActiveToRedis(); }
    catch (error) { console.warn('[BACKUP] Redis sync warning:', error.message); }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const buffer = createBackupBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = 'Mahiru-Backup-' + stamp + '.json.gz';
    fs.writeFileSync(path.join(BACKUP_DIR, fileName), buffer);
    const backupDocument = {
        document: buffer,
        mimetype: 'application/gzip',
        fileName,
        caption: 'Mahiru ' + label + ' ব্যাকআপ\\nতৈরির সময়: ' +
            new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }) +
            '\\nযা রয়েছে: ব্যবহারকারী, গ্রুপ, ইনবক্স ও বটের তথ্য'
    };
    let delivery;
    if (destination) {
        delivery = await sock.sendMessage(destination, backupDocument);
    } else {
        delivery = await sendToBotInboxAndOwner(sock, backupDocument);
        if (!delivery.sent.length) throw new Error('Backup could not be delivered to either inbox.');
    }
    return { fileName, size: buffer.length, delivery };
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
    if (!payload || !payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) {
        throw new Error('Invalid Mahiru backup file');
    }

    let entries;
    // Current native format: { app, format, files: { "data/name.json": "<base64>" } }
    if (payload.app === 'Mahiru WhatsApp Bot' && payload.format === 1) {
        entries = Object.entries(payload.files);
    // Legacy Mahiru export format: { meta: { bot, version, createdAt }, files: { "name.json": <JSON value> } }
    } else if (payload.meta && typeof payload.meta === 'object' &&
        typeof payload.meta.bot === 'string' && payload.meta.bot.toLowerCase().includes('মাহিরু')) {
        entries = Object.entries(payload.files).map(([name, value]) => {
            if (typeof name !== 'string' || path.basename(name) !== name ||
                !shouldBackupDataFile(name) || name.startsWith('.')) {
                throw new Error('Backup contains an unsupported data filename');
            }
            return ['data/' + name, Buffer.from(JSON.stringify(value), 'utf8').toString('base64')];
        });
        payload.createdAt = payload.createdAt || payload.meta.createdAt;
    } else {
        throw new Error('Invalid Mahiru backup file format');
    }

    if (!entries.length) throw new Error('Backup is empty');

    const decoded = [];
    for (const [relative, encoded] of entries) {
        if (typeof relative !== 'string' ||
            !(relative === 'baileys_store.json' || relative === 'settings.js' ||
              relative === 'config.js' || relative === '.env' || relative.startsWith('data/')) ||
            relative.includes('..') || path.isAbsolute(relative) || typeof encoded !== 'string' ||
            (relative.startsWith('data/') && !shouldBackupDataFile(relative))) {
            throw new Error('Backup contains an unsafe file path');
        }
        const bytes = Buffer.from(encoded, 'base64');
        if (relative.endsWith('.json') || relative.endsWith('.json5') || relative.endsWith('.jsonl')) {
            JSON.parse(bytes.toString('utf8'));
        }
        decoded.push({ relative, bytes });
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const safetyName = 'pre-restore-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json.gz';
    fs.writeFileSync(path.join(BACKUP_DIR, safetyName), createBackupBuffer());

    const stageRoot = path.join(BACKUP_DIR, 'restore-stage-' + process.pid);
    const stageData = path.join(stageRoot, 'data');
    fs.rmSync(stageRoot, { recursive: true, force: true });
    fs.mkdirSync(stageData, { recursive: true });
    for (const item of decoded) {
        const staged = path.resolve(stageRoot, item.relative);
        if (!staged.startsWith(stageRoot + path.sep)) throw new Error('Unsafe restore destination');
        fs.mkdirSync(path.dirname(staged), { recursive: true });
        fs.writeFileSync(staged, item.bytes);
    }

    const oldData = path.join(BACKUP_DIR, 'pre-restore-data-' + process.pid);
    fs.rmSync(oldData, { recursive: true, force: true });
    if (fs.existsSync(DATA_DIR)) fs.renameSync(DATA_DIR, oldData);
    try {
        fs.renameSync(stageData, DATA_DIR);
    } catch (error) {
        if (fs.existsSync(oldData) && !fs.existsSync(DATA_DIR)) fs.renameSync(oldData, DATA_DIR);
        throw error;
    }

    for (const item of decoded.filter(entry => entry.relative !== 'data/' && !entry.relative.startsWith('data/'))) {
        const target = path.resolve(ROOT, item.relative);
        const temp = target + '.restore-' + process.pid;
        fs.writeFileSync(temp, item.bytes);
        fs.renameSync(temp, target);
    }
    fs.rmSync(stageRoot, { recursive: true, force: true });

    try {
        fs.rmSync(path.join(BACKUP_DIR, 'data'), { recursive: true, force: true });
        fs.rmSync(path.join(BACKUP_DIR, 'baileys_store.json'), { force: true });
        require('../lib/persistent_data').backup();
    } catch (error) {
        console.warn('[BACKUP] Runtime snapshot refresh warning:', error.message);
    }
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
                const result = await sendBackup(activeSock, null, 'দৈনিক');
                console.log('[BACKUP] Daily backup sent:', result.fileName);
            } catch (error) {
                console.error('[BACKUP] Daily backup failed:', error.message);
                try { await notifyOwner(activeSock, 'Mahiru-র দৈনিক ব্যাকআপ ব্যর্থ হয়েছে: ' + error.message); }
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
