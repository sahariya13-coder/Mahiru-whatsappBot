/**
 * Mahiru Shiina — Safe 3-hour storage cleanup
 *
 * Only cleans dedicated temporary folders. It never enters session/, data/,
 * backups, cache/, or .cache/. Files younger than 3 hours are preserved.
 */
const fs = require('fs');
const path = require('path');

const CLEAN_INTERVAL_MS = 3 * 60 * 60 * 1000;
const MIN_FILE_AGE_MS = 3 * 60 * 60 * 1000;
const TEMP_DIRS = [
    './temp',
    './tmp',
    './media/temp',
    './downloads/temp'
];

let cleanupTimer = null;
let cleaning = false;

function cleanDirectory(dirPath, now, stats) {
    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[SAFE CLEANUP] Cannot read folder:', dirPath, error.message);
        }
        return;
    }

    for (const entry of entries) {
        if (entry.name === '.gitkeep' || entry.name === '.keep') continue;

        const fullPath = path.join(dirPath, entry.name);
        let info;
        try {
            info = fs.lstatSync(fullPath);
        } catch {
            continue;
        }

        // Never follow symlinks or touch paths outside the approved temp trees.
        if (info.isSymbolicLink()) continue;

        if (info.isDirectory()) {
            cleanDirectory(fullPath, now, stats);

            // Remove only an empty subfolder; keep the approved temp root itself.
            try {
                if (fs.readdirSync(fullPath).length === 0) {
                    fs.rmdirSync(fullPath);
                }
            } catch {}
            continue;
        }

        if (!info.isFile() || (now - info.mtimeMs) < MIN_FILE_AGE_MS) continue;

        try {
            fs.unlinkSync(fullPath);
            stats.files++;
            stats.bytes += info.size;
        } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'EBUSY' && error.code !== 'EPERM') {
                console.warn('[SAFE CLEANUP] Cannot remove file:', fullPath, error.message);
            }
        }
    }
}

function runCleanup(reason = 'scheduled') {
    if (cleaning) return { skipped: true, reason: 'already_running' };
    cleaning = true;

    const stats = { files: 0, bytes: 0 };
    const now = Date.now();

    try {
        for (const configuredDir of TEMP_DIRS) {
            const absoluteDir = path.resolve(process.cwd(), configuredDir);
            if (!fs.existsSync(absoluteDir)) continue;

            try {
                const rootInfo = fs.lstatSync(absoluteDir);
                if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) continue;
                cleanDirectory(absoluteDir, now, stats);
            } catch (error) {
                console.warn('[SAFE CLEANUP] Folder skipped:', configuredDir, error.message);
            }
        }

        const freedMb = (stats.bytes / (1024 * 1024)).toFixed(2);
        console.log(
            '[SAFE CLEANUP] ' + reason + ': removed ' + stats.files +
            ' old temp file(s), freed ' + freedMb + ' MB.'
        );
        return { ...stats, freedMb: Number(freedMb) };
    } finally {
        cleaning = false;
    }
}

function start() {
    if (cleanupTimer) return;
    // Run once after startup, then repeat every 3 hours.
    runCleanup('startup');
    cleanupTimer = setInterval(() => runCleanup('3-hour schedule'), CLEAN_INTERVAL_MS);
    if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

function stop() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = null;
}

module.exports = { start, stop, runCleanup };
