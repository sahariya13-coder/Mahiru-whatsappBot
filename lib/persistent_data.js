/**
 * Mahiru runtime data protection.
 *
 * The backup lives outside tracked source files, so normal git pulls do not
 * overwrite it. The last saved snapshot is restored before bot modules load.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(ROOT, 'baileys_store.json');
const BACKUP_DIR = path.join(ROOT, '.mahiru-backup');
const BACKUP_DATA_DIR = path.join(BACKUP_DIR, 'data');
const BACKUP_STORE_FILE = path.join(BACKUP_DIR, 'baileys_store.json');

let backupTimer = null;
let started = false;

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
            // Backups are authoritative: restore them over tracked JSON files
            // that may have been reset by a source pull/deployment.
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

function restore() {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        restoreDirectory(BACKUP_DATA_DIR, DATA_DIR);

        if (isValidJson(BACKUP_STORE_FILE)) {
            const temp = STORE_FILE + '.restore-' + process.pid;
            fs.copyFileSync(BACKUP_STORE_FILE, temp);
            fs.renameSync(temp, STORE_FILE);
        }
    } catch (error) {
        console.error('[DATA BACKUP] Restore failed:', error.message);
    }
}

function backup() {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        if (fs.existsSync(DATA_DIR)) {
            copyDirectory(DATA_DIR, BACKUP_DATA_DIR);
        }
        if (isValidJson(STORE_FILE)) {
            const temp = BACKUP_STORE_FILE + '.tmp-' + process.pid;
            fs.copyFileSync(STORE_FILE, temp);
            fs.renameSync(temp, BACKUP_STORE_FILE);
        }
    } catch (error) {
        console.error('[DATA BACKUP] Backup failed:', error.message);
    }
}

function start() {
    if (started) return;
    started = true;

    // Restore the previous snapshot first, then keep a fresh local snapshot.
    restore();
    backup();
    backupTimer = setInterval(backup, 2000);
    if (typeof backupTimer.unref === 'function') backupTimer.unref();

    process.once('beforeExit', backup);
    process.once('SIGINT', () => { backup(); process.exit(0); });
    process.once('SIGTERM', () => { backup(); process.exit(0); });

    console.log('[DATA BACKUP] Runtime data protection enabled.');
}

module.exports = { start, backup, restore };
