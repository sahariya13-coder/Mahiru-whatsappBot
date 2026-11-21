/**
 * Mahiru runtime data protection + Upstash Redis persistence.
 * Active application data is stored without TTL. Only local historical
 * backup archives are pruned after 10 days. Secrets/session files are excluded.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(ROOT, 'baileys_store.json');
const BACKUP_DIR = path.join(ROOT, '.mahiru-backup');
const BACKUP_DATA_DIR = path.join(BACKUP_DIR, 'data');
const BACKUP_STORE_FILE = path.join(BACKUP_DIR, 'baileys_store.json');

const REDIS_PREFIX = 'mahiru:whatsapp:active:';
const DATA_PREFIX = REDIS_PREFIX + 'data:';
const STORE_KEY = REDIS_PREFIX + 'baileys_store';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const ALLOWED_EXTENSIONS = new Set([
    '.json', '.json5', '.jsonl', '.db', '.sqlite', '.sqlite3',
    '.txt', '.csv', '.yaml', '.yml', '.ini', '.conf', '.xml'
]);
const EXCLUDED_DIRS = new Set([
    'cache', 'caches', 'tmp', 'temp', 'media', 'images', 'image',
    'audio', 'voice', 'voices', 'video', 'videos', 'uploads',
    'downloads', 'thumbnails'
]);

let backupTimer = null;
let redisTimer = null;
let started = false;
let redisWarningShown = false;
let redisDisabled = false;

function redisConfig() {
    return {
        // URL and token must belong to the same Upstash database.
        url: String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, ''),
        token: String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
    };
}

async function redisCommand(command, ...args) {
    const { url, token } = redisConfig();
    if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing');
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify([command, ...args]),
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            redisDisabled = true;
            if (!redisWarningShown) {
                console.error('[REDIS DATA] Authentication rejected (HTTP ' + response.status + '). Check that UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are from the same Upstash database. Local backups remain active; Redis retries are paused until restart.');
                redisWarningShown = true;
            }
        }
        throw new Error('Upstash HTTP ' + response.status);
    }
    const body = await response.json();
    if (body.error) throw new Error(body.error);
    return body.result;
}

function isValidJson(file) {
    try {
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
        const raw = fs.readFileSync(file, 'utf8');
        if (!raw.trim()) return false;
        JSON.parse(raw);
        return true;
    } catch (_) {
        return false;
    }
}

function isAllowedRelative(relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('..') ||
        path.isAbsolute(relative) || relative.includes('\\')) return false;
    const parts = relative.split('/');
    if (parts.some(part => !part || EXCLUDED_DIRS.has(part.toLowerCase()))) return false;
    return ALLOWED_EXTENSIONS.has(path.extname(relative).toLowerCase());
}

function copyDirectory(source, destination) {
    if (!fs.existsSync(source)) return;
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(from, to);
        } else if (entry.isFile()) {
            fs.mkdirSync(path.dirname(to), { recursive: true });
            const temp = to + '.tmp-' + process.pid;
            fs.copyFileSync(from, temp);
            fs.renameSync(temp, to);
        }
    }
}

function restoreDirectory(backupDir, targetDir) {
    if (!fs.existsSync(backupDir)) return;
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
        const backupPath = path.join(backupDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            restoreDirectory(backupPath, targetPath);
        } else if (entry.isFile()) {
            if (entry.name.endsWith('.json') && isValidJson(backupPath)) {
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                const temp = targetPath + '.restore-' + process.pid;
                fs.copyFileSync(backupPath, temp);
                fs.renameSync(temp, targetPath);
            } else if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.copyFileSync(backupPath, targetPath);
            }
        }
    }
}

function restoreLocal() {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    restoreDirectory(BACKUP_DATA_DIR, DATA_DIR);
    if (isValidJson(BACKUP_STORE_FILE)) {
        const temp = STORE_FILE + '.restore-' + process.pid;
        fs.copyFileSync(BACKUP_STORE_FILE, temp);
        fs.renameSync(temp, STORE_FILE);
    }
}

function backup() {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        if (fs.existsSync(DATA_DIR)) copyDirectory(DATA_DIR, BACKUP_DATA_DIR);
        if (isValidJson(STORE_FILE)) {
            const temp = BACKUP_STORE_FILE + '.tmp-' + process.pid;
            fs.copyFileSync(STORE_FILE, temp);
            fs.renameSync(temp, BACKUP_STORE_FILE);
        }
        pruneOldArchives();
    } catch (error) {
        console.error('[DATA BACKUP] Backup failed:', error.message);
    }
}

function pruneOldArchives() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return;
        const cutoff = Date.now() - TEN_DAYS_MS;
        for (const entry of fs.readdirSync(BACKUP_DIR, { withFileTypes: true })) {
            const full = path.join(BACKUP_DIR, entry.name);
            if (entry.isFile() && entry.name.endsWith('.json.gz')) {
                try {
                    if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { force: true });
                } catch (_) {}
            }
            if (entry.isDirectory() && /^(restore-stage-|pre-restore-data-)/.test(entry.name)) {
                try {
                    if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true });
                } catch (_) {}
            }
        }
    } catch (error) {
        console.warn('[DATA BACKUP] Old backup cleanup warning:', error.message);
    }
}

function collectActiveFiles(dir = DATA_DIR, relative = '') {
    const output = [];
    if (!fs.existsSync(dir)) return output;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = relative ? relative + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            if (!EXCLUDED_DIRS.has(entry.name.toLowerCase())) {
                output.push(...collectActiveFiles(full, rel));
            }
        } else if (entry.isFile() && isAllowedRelative(rel)) {
            output.push({ relative: rel, full });
        }
    }
    return output;
}

async function syncActiveToRedis() {
    if (redisDisabled) return;
    const config = redisConfig();
    if (!config.url || !config.token) {
        if (!redisWarningShown) {
            console.warn('[REDIS DATA] Redis sync skipped: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
            redisWarningShown = true;
        }
        return;
    }
    const files = collectActiveFiles();
    for (const file of files) {
        const content = fs.readFileSync(file.full, 'utf8');
        await redisCommand('SET', DATA_PREFIX + file.relative, content);
    }
    if (isValidJson(STORE_FILE)) {
        await redisCommand('SET', STORE_KEY, fs.readFileSync(STORE_FILE, 'utf8'));
    }
    console.log('[REDIS DATA] Active data synced:', files.length, 'files. No TTL on active data.');
}

async function restoreActiveFromRedis() {
    if (redisDisabled) return;
    const config = redisConfig();
    if (!config.url || !config.token) return;
    let cursor = '0';
    let restored = 0;
    do {
        const result = await redisCommand('SCAN', cursor, 'MATCH', DATA_PREFIX + '*', 'COUNT', '100');
        cursor = String(result[0]);
        for (const key of result[1] || []) {
            const relative = String(key).slice(DATA_PREFIX.length);
            if (!isAllowedRelative(relative)) continue;
            const content = await redisCommand('GET', key);
            if (typeof content !== 'string') continue;
            const target = path.resolve(DATA_DIR, relative);
            if (!target.startsWith(DATA_DIR + path.sep)) continue;
            if (relative.endsWith('.json')) {
                try { JSON.parse(content); } catch (_) { continue; }
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const temp = target + '.redis-' + process.pid;
            fs.writeFileSync(temp, content);
            fs.renameSync(temp, target);
            restored++;
        }
    } while (cursor !== '0');

    const storeContent = await redisCommand('GET', STORE_KEY);
    if (typeof storeContent === 'string') {
        try {
            JSON.parse(storeContent);
            const temp = STORE_FILE + '.redis-' + process.pid;
            fs.writeFileSync(temp, storeContent);
            fs.renameSync(temp, STORE_FILE);
            restored++;
        } catch (_) {
            console.warn('[REDIS DATA] Ignored invalid WhatsApp store JSON.');
        }
    }
    console.log('[REDIS DATA] Active data restored:', restored, 'items.');
}

async function start() {
    if (started) return;
    started = true;
    // Local recovery first; Redis is newer and therefore takes precedence.
    try { restoreLocal(); }
    catch (error) { console.error('[DATA BACKUP] Local restore failed:', error.message); }

    try {
        await restoreActiveFromRedis();
    } catch (error) {
        console.error('[REDIS DATA] Restore failed:', error.message);
    }

    backup();
    try { await syncActiveToRedis(); }
    catch (error) { console.error('[REDIS DATA] Initial sync failed:', error.message); }

    backupTimer = setInterval(backup, 2000);
    redisTimer = setInterval(() => {
        syncActiveToRedis().catch(error => console.error('[REDIS DATA] Sync failed:', error.message));
    }, 60 * 1000);
    if (typeof backupTimer.unref === 'function') backupTimer.unref();
    if (typeof redisTimer.unref === 'function') redisTimer.unref();

    process.once('beforeExit', backup);
    process.once('SIGINT', () => { backup(); process.exit(0); });
    process.once('SIGTERM', () => { backup(); process.exit(0); });
    console.log('[DATA BACKUP] Runtime protection enabled; Redis active data has no expiry.');
}

module.exports = { start, backup, restore: restoreLocal, syncActiveToRedis };
