/**
 * PRIME MONIR • Maya v3.0 ULTRA — System Optimizer, Safe Session Pruner & Anti-Thrash RAM Watchdog
 * Tuned for 256MB-356MB Cloud RAM (Zero-Logout Stale LID/Device Pruning, Smart Backoff, Fast Memory Flush)
 * 100% Backward-Compatible Exports + Live Peak RSS / ArrayBuffer / Event-Loop Lag Telemetry
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let settings = null;
try { settings = require('../settings'); } catch {}

let chalk;
try {
    chalk = require('chalk');
} catch {
    chalk = { cyan: (s) => s, yellow: (s) => s, green: (s) => s, red: (s) => s };
}

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const SEC = 1000;

const optCfg = settings?.maya?.optimizer || {};

const DEFAULT_CONFIG = {
    sessionDir: optCfg.sessionDir || './session',
    dataDir: './data',
    tempDirs: ['./temp', './tmp', './cache', './.cache', './media/temp', './downloads/temp'],
    // সক্রিয় এনক্রিপশন ও ম্যাপিং ফাইল লিমিট (লগআউট-সেফ)
    keepPreKeys: Math.min(Number(optCfg.keepPreKeys || 35), 80),
    keepSessions: Math.min(Number(optCfg.keepSessions || 80), 150),
    keepSenderKeys: Math.min(Number(optCfg.keepSenderKeys || 50), 100),
    keepLidMappings: 120,             // ৬,৪২৫ ফাইল ব্লাউট প্রতিরোধ (সর্বশেষ ১২০টি অ্যাক্টিভ LID ম্যাপিং থাকবে)
    keepDeviceLists: 90,              // সর্বশেষ ৯০টি ডিভাইস লিস্ট থাকবে
    keepTcTokens: 60,                 // সর্বশেষ ৬০টি tctoken থাকবে
    minPreKeysFloor: 15,              // বয়স যাই হোক, সর্বশেষ ১৫টি pre-key কখনো মুছবে না (Bad MAC প্রতিরোধ)
    minSessionsFloor: 20,             // সর্বশেষ ২০টি অ্যাক্টিভ session সুরক্ষিত থাকবে
    minSenderKeysFloor: 12,
    minAuxMappingFloor: 25,           // সর্বশেষ ২৫টি lid/device/tc ফাইল সবসময় সুরক্ষিত
    maxSessionAgeMs: 48 * HOUR,
    maxPreKeyAgeMs: 72 * HOUR,
    maxAuxMappingAgeMs: 7 * 24 * HOUR,
    maxOtherSessionAgeMs: 12 * HOUR,
    runtimeTempMinAgeMs: 15 * MIN,
    manualTempMinAgeMs: 2 * MIN,      // ম্যানুয়াল/মেমোরি ক্লিনে ইন-ফ্লাইট FFmpeg/মিডিয়া ফাইল সুরক্ষা
    orphanTmpMinAgeMs: 5 * MIN,
    sysTmpBootMinAgeMs: 3 * MIN,
    sysTmpRuntimeMinAgeMs: 25 * MIN,
    maxLogSizeBytes: 2 * 1024 * 1024, // ২৫৬MB সার্ভার: ২MB লগ লিমিট
    maxLogAgeMs: 48 * HOUR,
    autoCleanIntervalMs: Number(optCfg.autoCleanIntervalMs || 45 * MIN),
    ramCheckIntervalMs: 45 * SEC,
    ramSoftLimitMb: Number(optCfg.ramSoftLimitMb || 235),
    ramCriticalLimitMb: Number(optCfg.ramCriticalLimitMb || 295),
    ramSweepCooldownMs: Number(optCfg.ramWatchdogCooldownMs || 5 * MIN),
    criticalSweepCooldownMs: 60 * SEC,
    maxSoftBackoffMs: 15 * MIN,       // ০MB ফ্রি হলে অকারণ লুপ ঠেকাতে স্মার্ট ব্যাকঅফ
    maxCriticalBackoffMs: 3 * MIN,
    memoryModeDiskSkipMs: 10 * MIN    // র‍্যাম ক্লিনে ঘনঘন ডিস্ক স্ক্যান প্রতিরোধ
};

// শুধুমাত্র লগইন ও অ্যাপ-স্টেট সিঙ্কের জন্য অপরিহার্য ফাইল (কখনোই ডিলিট হবে না)
function isStrictlyProtectedSessionFile(filename) {
    return (
        filename === 'creds.json' ||
        filename.startsWith('creds.') ||
        filename.startsWith('creds-') ||
        filename.startsWith('app-state-sync-')
    );
}

const SAFE_SYS_TMP_EXTS = new Set([
    '.tmp', '.temp', '.part', '.crdownload',
    '.webp', '.mp4', '.mp3', '.ogg', '.opus',
    '.m4a', '.wav', '.aac', '.jpg', '.jpeg', '.png'
]);

const ROOT_JUNK_EXTS = new Set(['.tmp', '.temp', '.part', '.crdownload']);
const ORPHAN_TMP_RE = /\.tmp(?:[.-]|$)/i;

const MAX_VERIFIED_JSON_CACHE = 200;
const STATS_CACHE_TTL_MS = 10 * SEC;

class SystemOptimizer {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };
        this.isCleaning = false;
        this.autoCleanTimer = null;
        this.ramWatchdogTimer = null;
        this.lagProbeTimer = null;

        this.lastRamSweepAt = 0;
        this.lastDiskCleanAt = 0;
        this.noGainStreak = 0;
        this.cleanupHooks = new Map();
        this.verifiedJsonCache = new Map(); // fullPath -> "mtimeMs:size"

        this.cachedSessionHealth = null;
        this.cachedSessionHealthAt = 0;
        this.cachedTempSizeMb = 0;
        this.cachedTempSizeAt = 0;

        this.lastCleanReport = null;
        this.totalFreedBytesSession = 0;
        this.totalFilesRemovedSession = 0;
        this.gcRuns = 0;
        this.peakRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        this.eventLoopLagMs = 0;
    }

    registerCleanupHook(name, fn) {
        if (name && typeof fn === 'function') {
            this.cleanupHooks.set(name, fn);
        }
    }

    unregisterCleanupHook(name) {
        this.cleanupHooks.delete(name);
    }

    // সিমলিংক-সেফ ও ডেপথ-লিমিটেড ফোল্ডার সাইজ ক্যালকুলেটর
    getTargetSize(targetPath, depth = 0) {
        if (depth > 5) return 0;
        try {
            const st = fs.lstatSync(targetPath);
            if (st.isSymbolicLink()) return 0;
            if (!st.isDirectory()) return st.size;
            let total = 0;
            for (const entry of fs.readdirSync(targetPath)) {
                total += this.getTargetSize(path.join(targetPath, entry), depth + 1);
            }
            return total;
        } catch {
            return 0;
        }
    }

    isCorruptJson(filePath, size, mtimeMs = 0) {
        if (size === 0) return true;
        if (size > 512 * 1024) return false;

        const sig = `${mtimeMs}:${size}`;
        if (mtimeMs && this.verifiedJsonCache.get(filePath) === sig) {
            return false;
        }

        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            if (!raw || !raw.trim()) return true;
            JSON.parse(raw);
            if (mtimeMs) {
                if (this.verifiedJsonCache.size >= MAX_VERIFIED_JSON_CACHE) {
                    this.verifiedJsonCache.delete(this.verifiedJsonCache.keys().next().value);
                }
                this.verifiedJsonCache.set(filePath, sig);
            }
            return false;
        } catch {
            this.verifiedJsonCache.delete(filePath);
            return true;
        }
    }

    isCredsHealthy(filePath, size) {
        if (!size || size > 512 * 1024) return false;
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return Boolean(parsed && typeof parsed === 'object' && parsed.noiseKey && parsed.signedIdentityKey);
        } catch {
            return false;
        }
    }

    /**
     * নিরাপদ ফ্লোরসহ ক্যাটাগরি প্রুনিং: অ্যাক্টিভ ফাইল সুরক্ষিত রেখে পুরোনো/অতিরিক্ত ফাইল সরায়
     */
    pruneCategory(items, keepCount, minFloor, maxAgeMs, now, verifyJson) {
        let removed = 0;
        let corrupt = 0;
        let freed = 0;

        if (!items.length) return { removed, corrupt, freed };

        items.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const safeFloor = Math.min(keepCount, Math.max(0, minFloor));

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const overCap = i >= keepCount;
            const tooOld = (now - item.mtimeMs) > maxAgeMs;

            if (overCap || (tooOld && i >= safeFloor)) {
                try {
                    fs.rmSync(item.fullPath, { force: true });
                    this.verifiedJsonCache.delete(item.fullPath);
                    removed++;
                    freed += item.size;
                } catch {}
                continue;
            }

            if (verifyJson && item.name.endsWith('.json') && this.isCorruptJson(item.fullPath, item.size, item.mtimeMs)) {
                try {
                    fs.rmSync(item.fullPath, { force: true });
                    corrupt++;
                    freed += item.size;
                } catch {}
            }
        }

        return { removed, corrupt, freed };
    }

    /**
     * ./data এবং ./data/snapshots ফোল্ডারের ক্র্যাশ-পরবর্তী অরফান .tmp* ফাইল ক্লিন
     */
    cleanDataOrphanTemps(now, minAgeMs) {
        let removed = 0;
        let freed = 0;
        const dirs = [this.config.dataDir, path.join(this.config.dataDir, 'snapshots')];

        for (const dir of dirs) {
            if (!dir || !fs.existsSync(dir)) continue;
            try {
                for (const entry of fs.readdirSync(dir)) {
                    if (!ORPHAN_TMP_RE.test(entry)) continue;
                    const fullPath = path.join(dir, entry);
                    try {
                        const st = fs.lstatSync(fullPath);
                        if (st.isDirectory() || st.isSymbolicLink()) continue;
                        if ((now - st.mtimeMs) < minAgeMs) continue;
                        fs.rmSync(fullPath, { force: true });
                        removed++;
                        freed += st.size;
                    } catch {}
                }
            } catch {}
        }
        return { removed, freed };
    }

    /**
     * পূর্ণাঙ্গ ডিপ ক্লিন (mode: 'boot' | 'runtime' | 'memory' | 'manual')
     */
    deepClean(mode = 'manual') {
        if (this.isCleaning) {
            return {
                skipped: true,
                mode,
                reason: 'already_running',
                sessionRemoved: 0,
                corruptRemoved: 0,
                tempRemoved: 0,
                logsRemoved: 0,
                totalRemoved: 0,
                freedMb: 0
            };
        }

        this.isCleaning = true;
        const startedAt = Date.now();
        const isBoot = mode === 'boot';
        const isMemoryMode = mode === 'memory';
        const verifyJson = isBoot || mode === 'manual';
        const now = Date.now();

        let sessionRemoved = 0;
        let corruptRemoved = 0;
        let tempRemoved = 0;
        let logsRemoved = 0;
        let freedBytes = 0;
        let hooksFlushed = 0;

        try {
            // ০. মেমোরি মোডে সবার আগে ইন-মেমোরি হুক ও ক্যাশ ফ্লাশ (ডিস্ক I/O ছাড়াই দ্রুত র‍্যাম ফ্রি)
            if (isMemoryMode || mode === 'manual') {
                hooksFlushed = this.flushRegisteredHooks(mode);
                if (isMemoryMode) this.verifiedJsonCache.clear();
            }

            // মেমোরি মোডে সম্প্রতি ডিস্ক ক্লিন হয়ে থাকলে অকারণ ডিস্ক স্ক্যান স্কিপ
            const skipDiskScan = isMemoryMode && (now - this.lastDiskCleanAt) < this.config.memoryModeDiskSkipMs;

            if (!skipDiskScan) {
                // ১. সেশন ফোল্ডার লগআউট-সেফ ডিপ ক্লিন (৬,৪২৫+ ফাইল ব্লাউট প্রতিরোধী)
                const { sessionDir } = this.config;
                if (sessionDir && fs.existsSync(sessionDir)) {
                    try {
                        const files = fs.readdirSync(sessionDir);
                        const preKeys = [];
                        const sessions = [];
                        const senderKeys = [];
                        const lidMappings = [];
                        const deviceLists = [];
                        const tcTokens = [];

                        for (const file of files) {
                            if (isStrictlyProtectedSessionFile(file)) continue;

                            const fullPath = path.join(sessionDir, file);
                            let st;
                            try {
                                st = fs.lstatSync(fullPath);
                                if (st.isDirectory() || st.isSymbolicLink()) continue;
                            } catch {
                                continue;
                            }

                            if (st.size === 0) {
                                try {
                                    fs.rmSync(fullPath, { force: true });
                                    this.verifiedJsonCache.delete(fullPath);
                                    corruptRemoved++;
                                } catch {}
                                continue;
                            }

                            const entry = { name: file, fullPath, mtimeMs: st.mtimeMs, size: st.size };
                            if (file.startsWith('pre-key-')) {
                                preKeys.push(entry);
                            } else if (file.startsWith('session-')) {
                                sessions.push(entry);
                            } else if (file.startsWith('sender-key-')) {
                                senderKeys.push(entry);
                            } else if (file.startsWith('lid-mapping-')) {
                                lidMappings.push(entry);
                            } else if (file.startsWith('device-list-')) {
                                deviceLists.push(entry);
                            } else if (file.startsWith('tctoken-')) {
                                tcTokens.push(entry);
                            } else if ((now - st.mtimeMs) > this.config.maxOtherSessionAgeMs) {
                                try {
                                    fs.rmSync(fullPath, { force: true });
                                    this.verifiedJsonCache.delete(fullPath);
                                    sessionRemoved++;
                                    freedBytes += st.size;
                                } catch {}
                            }
                        }

                        const results = [
                            this.pruneCategory(preKeys, this.config.keepPreKeys, this.config.minPreKeysFloor, this.config.maxPreKeyAgeMs, now, verifyJson),
                            this.pruneCategory(sessions, this.config.keepSessions, this.config.minSessionsFloor, this.config.maxSessionAgeMs, now, verifyJson),
                            this.pruneCategory(senderKeys, this.config.keepSenderKeys, this.config.minSenderKeysFloor, this.config.maxSessionAgeMs, now, verifyJson),
                            this.pruneCategory(lidMappings, this.config.keepLidMappings, this.config.minAuxMappingFloor, this.config.maxAuxMappingAgeMs, now, false),
                            this.pruneCategory(deviceLists, this.config.keepDeviceLists, this.config.minAuxMappingFloor, this.config.maxAuxMappingAgeMs, now, false),
                            this.pruneCategory(tcTokens, this.config.keepTcTokens, this.config.minAuxMappingFloor, this.config.maxAuxMappingAgeMs, now, false)
                        ];

                        for (const r of results) {
                            sessionRemoved += r.removed;
                            corruptRemoved += r.corrupt;
                            freedBytes += r.freed;
                        }
                    } catch {}
                }

                // ২. প্রজেক্টের টেম্প ও ক্যাশ ফোল্ডার ক্লিন (পাথ ডি-ডুপ্লিকেটেড)
                const scannedDirs = new Set();
                const tempMinAge = isBoot
                    ? 0
                    : (mode === 'manual' || isMemoryMode)
                        ? this.config.manualTempMinAgeMs
                        : this.config.runtimeTempMinAgeMs;

                for (const dir of this.config.tempDirs) {
                    if (!dir) continue;
                    const absDir = path.resolve(dir);
                    if (scannedDirs.has(absDir) || !fs.existsSync(absDir)) continue;
                    scannedDirs.add(absDir);

                    try {
                        for (const entry of fs.readdirSync(absDir)) {
                            if (entry === '.gitkeep' || entry === '.keep') continue;
                            const fullPath = path.join(absDir, entry);
                            try {
                                const st = fs.lstatSync(fullPath);
                                if (st.isSymbolicLink()) continue;
                                if (tempMinAge > 0 && (now - st.mtimeMs) < tempMinAge) continue;
                                const size = this.getTargetSize(fullPath);
                                fs.rmSync(fullPath, { recursive: true, force: true });
                                tempRemoved++;
                                freedBytes += size;
                            } catch {}
                        }
                    } catch {}
                }

                // ৩. সিস্টেম /tmp ফোল্ডার ক্লিন (যদি ./temp-এর থেকে আলাদা হয় তবেই)
                const sysTmp = os.tmpdir();
                const absSysTmp = sysTmp ? path.resolve(sysTmp) : '';
                if (absSysTmp && !scannedDirs.has(absSysTmp) && fs.existsSync(absSysTmp)) {
                    try {
                        const minAge = isBoot ? this.config.sysTmpBootMinAgeMs : this.config.sysTmpRuntimeMinAgeMs;
                        for (const entry of fs.readdirSync(absSysTmp)) {
                            const ext = path.extname(entry).toLowerCase();
                            if (!SAFE_SYS_TMP_EXTS.has(ext)) continue;
                            const fullPath = path.join(absSysTmp, entry);
                            try {
                                const st = fs.lstatSync(fullPath);
                                if (st.isDirectory() || st.isSymbolicLink()) continue;
                                if ((now - st.mtimeMs) < minAge) continue;
                                fs.rmSync(fullPath, { force: true });
                                tempRemoved++;
                                freedBytes += st.size;
                            } catch {}
                        }
                    } catch {}
                }

                // ৪. ./data ফোল্ডারের অরফান .tmp* ফাইল ক্লিন
                const dataTmpRes = this.cleanDataOrphanTemps(now, isBoot ? 0 : this.config.orphanTmpMinAgeMs);
                tempRemoved += dataTmpRes.removed;
                freedBytes += dataTmpRes.freed;

                // ৫. রুট ফোল্ডারের জাঙ্ক ফাইল ও বড়/পুরোনো .log ফাইল ক্লিন
                try {
                    for (const entry of fs.readdirSync('.')) {
                        const ext = path.extname(entry).toLowerCase();
                        if (!ROOT_JUNK_EXTS.has(ext) && ext !== '.log') continue;
                        try {
                            const st = fs.lstatSync(entry);
                            if (st.isDirectory() || st.isSymbolicLink()) continue;
                            if (tempMinAge > 0 && (now - st.mtimeMs) < tempMinAge) continue;

                            if (ext === '.log') {
                                const isBigOrOld =
                                    st.size > this.config.maxLogSizeBytes ||
                                    (now - st.mtimeMs) > this.config.maxLogAgeMs;
                                if (!isBigOrOld) continue;
                                fs.rmSync(entry, { force: true });
                                logsRemoved++;
                                freedBytes += st.size;
                            } else {
                                fs.rmSync(entry, { force: true });
                                tempRemoved++;
                                freedBytes += st.size;
                            }
                        } catch {}
                    }
                } catch {}

                this.lastDiskCleanAt = now;
                this.cachedSessionHealthAt = 0;
                this.cachedTempSizeAt = 0;
            }

            const totalRemoved = sessionRemoved + corruptRemoved + tempRemoved + logsRemoved;
            const freedMb = Number((freedBytes / (1024 * 1024)).toFixed(2));
            const durationMs = Date.now() - startedAt;

            this.totalFreedBytesSession += freedBytes;
            this.totalFilesRemovedSession += totalRemoved;

            const report = {
                skipped: false,
                mode,
                diskScanSkipped: skipDiskScan,
                at: new Date().toISOString(),
                durationMs,
                sessionRemoved,
                corruptRemoved,
                tempRemoved,
                logsRemoved,
                totalRemoved,
                hooksFlushed,
                freedBytes,
                freedMb
            };
            this.lastCleanReport = report;

            if (totalRemoved > 0 || mode === 'manual') {
                console.log(
                    chalk.cyan(
                        `🧹 [Optimizer:${mode}] Session: ${sessionRemoved} | Corrupt: ${corruptRemoved} | Temp: ${tempRemoved} | Logs: ${logsRemoved} | Freed: ${freedMb} MB (${durationMs}ms)`
                    )
                );
            }

            return report;
        } finally {
            this.isCleaning = false;
        }
    }

    flushRegisteredHooks(reason = 'memory') {
        let flushed = 0;
        for (const [name, fn] of this.cleanupHooks.entries()) {
            try {
                fn(reason);
                flushed++;
            } catch (err) {
                console.error(chalk.yellow(`⚠️ [Optimizer Hook:${name}]`), err?.message || err);
            }
        }
        return flushed;
    }

    triggerGc() {
        if (typeof global.gc === 'function') {
            try {
                global.gc();
                this.gcRuns++;
                return true;
            } catch {}
        }
        return false;
    }

    emergencyMemoryFlush(reason = 'emergency') {
        const beforeMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        const hooksFlushed = this.flushRegisteredHooks(reason);
        this.verifiedJsonCache.clear();
        const gcRan = this.triggerGc();
        const afterMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        return { beforeMb, afterMb, freedMb: Math.max(0, beforeMb - afterMb), hooksFlushed, gcRan };
    }

    /**
     * অ্যাডাপ্টিভ অ্যান্টি-থ্র্যাশ RAM ওয়াচডগ (জিরো ইনফিনিট লুপ + স্মার্ট ব্যাকঅফ)
     */
    checkMemoryPressure() {
        const mem = process.memoryUsage();
        const rssMb = Math.round(mem.rss / (1024 * 1024));
        if (rssMb > this.peakRssMb) this.peakRssMb = rssMb;

        const softLimit = Number(settings?.maya?.optimizer?.ramSoftLimitMb) || this.config.ramSoftLimitMb;
        const critLimit = Number(settings?.maya?.optimizer?.ramCriticalLimitMb) || this.config.ramCriticalLimitMb;

        if (rssMb < softLimit) {
            this.noGainStreak = 0;
            return { elevated: false, rssMb };
        }

        const isCritical = rssMb >= critLimit;
        const baseCd = isCritical
            ? this.config.criticalSweepCooldownMs
            : (Number(settings?.maya?.optimizer?.ramWatchdogCooldownMs) || this.config.ramSweepCooldownMs);
        const maxCd = isCritical ? this.config.maxCriticalBackoffMs : this.config.maxSoftBackoffMs;
        const effectiveCooldown = Math.min(maxCd, baseCd * Math.pow(2, Math.min(this.noGainStreak, 3)));

        const now = Date.now();
        if (now - this.lastRamSweepAt < effectiveCooldown) {
            return { elevated: true, rssMb, cooledDown: true, isCritical, backoffSec: Math.round(effectiveCooldown / 1000) };
        }

        this.lastRamSweepAt = now;
        const abMb = Math.round((mem.arrayBuffers || 0) / (1024 * 1024));
        console.log(
            chalk.yellow(
                `⚡ [RAM Watchdog] ${isCritical ? 'CRITICAL' : 'HIGH'} RAM (${rssMb} MB | Buffers: ${abMb} MB) — Optimizing...`
            )
        );

        this.deepClean('memory');
        this.triggerGc();

        const afterMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        const deltaMb = rssMb - afterMb;

        if (deltaMb < 3) {
            this.noGainStreak = Math.min(this.noGainStreak + 1, 4);
        } else {
            this.noGainStreak = 0;
        }

        console.log(chalk.green(`✅ [RAM Watchdog] RAM optimized: ${rssMb} MB -> ${afterMb} MB`));
        return { elevated: true, beforeMb: rssMb, afterMb, isCritical };
    }

    /**
     * সেশন ফোল্ডারের ক্যাশড স্বাস্থ্য বিশ্লেষণ (১০ সেকেন্ডে সর্বোচ্চ ১ বার ডিস্ক রিড)
     */
    inspectSessionHealth(force = false) {
        const now = Date.now();
        if (!force && this.cachedSessionHealth && (now - this.cachedSessionHealthAt) < STATS_CACHE_TTL_MS) {
            return this.cachedSessionHealth;
        }

        const stats = {
            exists: false,
            credsValid: false,
            totalFiles: 0,
            protectedFiles: 0,
            preKeys: 0,
            sessions: 0,
            senderKeys: 0,
            lidMappings: 0,
            deviceLists: 0,
            tcTokens: 0,
            otherFiles: 0,
            sizeMb: 0
        };

        const { sessionDir } = this.config;
        if (!sessionDir || !fs.existsSync(sessionDir)) {
            this.cachedSessionHealth = stats;
            this.cachedSessionHealthAt = now;
            return stats;
        }
        stats.exists = true;

        let totalBytes = 0;
        try {
            for (const file of fs.readdirSync(sessionDir)) {
                const fullPath = path.join(sessionDir, file);
                try {
                    const st = fs.lstatSync(fullPath);
                    if (st.isDirectory() || st.isSymbolicLink()) continue;
                    stats.totalFiles++;
                    totalBytes += st.size;

                    if (file === 'creds.json') {
                        stats.credsValid = this.isCredsHealthy(fullPath, st.size);
                    }

                    if (isStrictlyProtectedSessionFile(file)) stats.protectedFiles++;
                    else if (file.startsWith('pre-key-')) stats.preKeys++;
                    else if (file.startsWith('session-')) stats.sessions++;
                    else if (file.startsWith('sender-key-')) stats.senderKeys++;
                    else if (file.startsWith('lid-mapping-')) stats.lidMappings++;
                    else if (file.startsWith('device-list-')) stats.deviceLists++;
                    else if (file.startsWith('tctoken-')) stats.tcTokens++;
                    else stats.otherFiles++;
                } catch {}
            }
        } catch {}

        stats.sizeMb = Number((totalBytes / (1024 * 1024)).toFixed(2));
        this.cachedSessionHealth = stats;
        this.cachedSessionHealthAt = now;
        return stats;
    }

    getCachedTempSizeMb(force = false) {
        const now = Date.now();
        if (!force && (now - this.cachedTempSizeAt) < STATS_CACHE_TTL_MS) {
            return this.cachedTempSizeMb;
        }
        let tempBytes = 0;
        const seen = new Set();
        for (const dir of this.config.tempDirs) {
            if (!dir) continue;
            const abs = path.resolve(dir);
            if (seen.has(abs) || !fs.existsSync(abs)) continue;
            seen.add(abs);
            tempBytes += this.getTargetSize(abs);
        }
        this.cachedTempSizeMb = Number((tempBytes / (1024 * 1024)).toFixed(2));
        this.cachedTempSizeAt = now;
        return this.cachedTempSizeMb;
    }

    formatUptimeBn(seconds) {
        const s = Math.floor(seconds);
        const days = Math.floor(s / 86400);
        const hours = Math.floor((s % 86400) / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const parts = [];
        if (days > 0) parts.push(`${days} দিন`);
        if (hours > 0) parts.push(`${hours} ঘণ্টা`);
        parts.push(`${mins} মিনিট`);
        return parts.join(' ');
    }

    getMemorySnapshot() {
        const mem = process.memoryUsage();
        const rssMb = Math.round(mem.rss / (1024 * 1024));
        if (rssMb > this.peakRssMb) this.peakRssMb = rssMb;
        return {
            rssMb,
            peakRssMb: this.peakRssMb,
            heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
            heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
            arrayBuffersMb: Math.round((mem.arrayBuffers || 0) / (1024 * 1024))
        };
    }

    /**
     * পুরো সার্ভারের লাইভ টেলিমেট্রি (Maya v3.0 ULTRA স্কোরিং)
     */
    getSystemStats(force = false) {
        const memSnap = this.getMemorySnapshot();
        const totalSysMb = Math.round(os.totalmem() / (1024 * 1024));
        const freeSysMb = Math.round(os.freemem() / (1024 * 1024));
        const uptimeSec = process.uptime();
        const session = this.inspectSessionHealth(force);
        const tempSizeMb = this.getCachedTempSizeMb(force);

        const softLimit = Number(settings?.maya?.optimizer?.ramSoftLimitMb) || this.config.ramSoftLimitMb;
        const critLimit = Number(settings?.maya?.optimizer?.ramCriticalLimitMb) || this.config.ramCriticalLimitMb;

        let healthScore = 100;
        if (!session.credsValid) healthScore -= 35;
        if (memSnap.rssMb >= critLimit) healthScore -= 30;
        else if (memSnap.rssMb >= softLimit) healthScore -= 15;
        else if (memSnap.rssMb >= Math.round(softLimit * 0.85)) healthScore -= 5;

        if (session.totalFiles > 800) healthScore -= 20;
        else if (session.totalFiles > 450) healthScore -= 10;

        if (tempSizeMb > 50) healthScore -= 10;
        if (this.eventLoopLagMs > 250) healthScore -= 10;

        healthScore = Math.max(0, Math.min(100, healthScore));
        const statusEmoji = healthScore >= 85 ? '🟢' : healthScore >= 60 ? '🟡' : '🔴';

        return {
            healthScore,
            statusEmoji,
            rssMb: memSnap.rssMb,
            peakRssMb: memSnap.peakRssMb,
            heapUsedMb: memSnap.heapUsedMb,
            heapTotalMb: memSnap.heapTotalMb,
            arrayBuffersMb: memSnap.arrayBuffersMb,
            eventLoopLagMs: this.eventLoopLagMs,
            gcRuns: this.gcRuns,
            totalSysMb,
            freeSysMb,
            uptimeSec: Math.floor(uptimeSec),
            uptimeBn: this.formatUptimeBn(uptimeSec),
            nodeVersion: process.version,
            platform: `${os.platform()}/${os.arch()}`,
            cpuLoad1m: Number((os.loadavg()[0] || 0).toFixed(2)),
            session,
            tempSizeMb,
            registeredHooks: this.cleanupHooks.size,
            lastClean: this.lastCleanReport,
            totalFreedMbSinceBoot: Number((this.totalFreedBytesSession / (1024 * 1024)).toFixed(2)),
            totalRemovedSinceBoot: this.totalFilesRemovedSession
        };
    }

    formatCleanReport(report) {
        if (!report || report.skipped) {
            return '🧹 ক্লিনিং এখন চলছে, কয়েক সেকেন্ড পর আবার চেষ্টা করো।';
        }
        const stats = this.getSystemStats(true);
        return [
            '🧹 *PRIME MONIR • ডিপ ক্লিন রিপোর্ট*',
            '──────────────────',
            `• সেশন ফাইল ক্লিন: *${report.sessionRemoved}টি*`,
            `• নষ্ট ফাইল রিমুভ: *${report.corruptRemoved}টি*`,
            `• টেম্প/অরফান ক্লিন: *${report.tempRemoved}টি*`,
            `• পুরোনো লগ ক্লিন: *${report.logsRemoved}টি*`,
            `• হুক ফ্লাশ: *${report.hooksFlushed || 0}টি* | ফ্রি: *${report.freedMb} MB* (${report.durationMs}ms)`,
            '──────────────────',
            `📂 সেশন ফাইল: *${stats.session.totalFiles}টি* (${stats.session.sizeMb} MB)`,
            `⚡ র‍্যাম: *${stats.rssMb} MB* (পিক ${stats.peakRssMb} MB) | হেলথ: ${stats.statusEmoji} *${stats.healthScore}/100*`
        ].join('\n');
    }

    formatHealthReport(extraLines = []) {
        const s = this.getSystemStats();
        const ver = String(settings?.version || '3.0.0-ULTRA').replace(/^v/i, '');
        const lines = [
            `🩺 *PRIME MONIR • মায়া v${ver} সিস্টেম হেলথ*`,
            '──────────────────',
            `• স্কোর: ${s.statusEmoji} *${s.healthScore}/100* (Lag: \`${s.eventLoopLagMs}ms\`)`,
            `• র‍্যাম: *${s.rssMb} MB* / পিক *${s.peakRssMb} MB* (Heap: ${s.heapUsedMb} MB | Buf: ${s.arrayBuffersMb} MB)`,
            `• আপটাইম: *${s.uptimeBn}*`,
            `• সেশন: *${s.session.totalFiles}টি* (${s.session.sizeMb} MB | Creds: ${s.session.credsValid ? '✅' : '❌'})`,
            `• টেম্প/ক্যাশ: *${s.tempSizeMb} MB* | হুক: *${s.registeredHooks}টি*`,
            `• Node: \`${s.nodeVersion}\` | Load: \`${s.cpuLoad1m}\``
        ];

        if (Array.isArray(extraLines) && extraLines.length) {
            lines.push('──────────────────', ...extraLines);
        }

        if (s.lastClean) {
            lines.push(`🧹 শেষ ক্লিন (${s.lastClean.mode}): *${s.lastClean.totalRemoved}টি* ফাইল (${s.lastClean.freedMb} MB)`);
        }

        return lines.join('\n');
    }

    start(overrideConfig = {}) {
        this.config = { ...this.config, ...overrideConfig };
        this.stop();

        this.deepClean('boot');

        this.autoCleanTimer = setInterval(() => {
            this.deepClean('runtime');
        }, this.config.autoCleanIntervalMs);
        if (this.autoCleanTimer.unref) this.autoCleanTimer.unref();

        this.ramWatchdogTimer = setInterval(() => {
            this.checkMemoryPressure();
        }, this.config.ramCheckIntervalMs);
        if (this.ramWatchdogTimer.unref) this.ramWatchdogTimer.unref();

        // হালকা ইভেন্ট-লুপ ল্যাগ প্রোব (প্রতি ৩০ সেকেন্ডে)
        let lastProbe = Date.now();
        this.lagProbeTimer = setInterval(() => {
            const now = Date.now();
            this.eventLoopLagMs = Math.max(0, now - lastProbe - 30000);
            lastProbe = now;
        }, 30 * SEC);
        if (this.lagProbeTimer.unref) this.lagProbeTimer.unref();

        global.systemOptimizer = this;
        global.deepCleanBot = (mode = 'manual') => this.deepClean(mode);

        return this;
    }

    stop() {
        if (this.autoCleanTimer) {
            clearInterval(this.autoCleanTimer);
            this.autoCleanTimer = null;
        }
        if (this.ramWatchdogTimer) {
            clearInterval(this.ramWatchdogTimer);
            this.ramWatchdogTimer = null;
        }
        if (this.lagProbeTimer) {
            clearInterval(this.lagProbeTimer);
            this.lagProbeTimer = null;
        }
    }
}

const optimizer = new SystemOptimizer();

module.exports = {
    SystemOptimizer,
    optimizer,
    startOptimizer: (cfg) => optimizer.start(cfg),
    stopOptimizer: () => optimizer.stop(),
    deepClean: (mode) => optimizer.deepClean(mode),
    checkMemoryPressure: () => optimizer.checkMemoryPressure(),
    emergencyMemoryFlush: (reason) => optimizer.emergencyMemoryFlush(reason),
    getMemorySnapshot: () => optimizer.getMemorySnapshot(),
    inspectSessionHealth: (force) => optimizer.inspectSessionHealth(force),
    flushRegisteredHooks: (reason) => optimizer.flushRegisteredHooks(reason),
    getSystemStats: (force) => optimizer.getSystemStats(force),
    formatCleanReport: (r) => optimizer.formatCleanReport(r),
    formatHealthReport: (extra) => optimizer.formatHealthReport(extra),
    registerCleanupHook: (name, fn) => optimizer.registerCleanupHook(name, fn),
    unregisterCleanupHook: (name) => optimizer.unregisterCleanupHook(name)
};
