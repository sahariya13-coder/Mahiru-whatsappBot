'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function readText(file) {
    try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}
function readNumber(files) {
    for (const file of files) {
        const raw = readText(file);
        if (!raw || raw === 'max') continue;
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}
function readCpuSet(raw) {
    if (!raw) return null;
    let total = 0;
    for (const part of raw.trim().split(',')) {
        const [a, b] = part.split('-').map(Number);
        if (!Number.isFinite(a)) continue;
        total += Number.isFinite(b) ? Math.max(0, b - a + 1) : 1;
    }
    return total || null;
}
function getMemoryLimitBytes() {
    const v2 = readNumber(['/sys/fs/cgroup/memory.max']);
    const v1 = readNumber(['/sys/fs/cgroup/memory/memory.limit_in_bytes']);
    const candidate = v2 || v1;
    if (candidate && candidate < 8 * 1024 ** 4) return candidate;
    return os.totalmem();
}
function getCpuLimit() {
    let quota = null, period = null;
    const v2 = readText('/sys/fs/cgroup/cpu.max').split(/\s+/);
    if (v2.length >= 2 && v2[0] !== 'max') {
        quota = Number(v2[0]); period = Number(v2[1]);
    } else {
        quota = readNumber(['/sys/fs/cgroup/cpu/cpu.cfs_quota_us']);
        period = readNumber(['/sys/fs/cgroup/cpu/cpu.cfs_period_us']);
    }
    const quotaCpus = quota > 0 && period > 0 ? quota / period : null;
    const cpuset = readCpuSet(
        readText('/sys/fs/cgroup/cpuset.cpus.effective') ||
        readText('/sys/fs/cgroup/cpuset/cpuset.cpus')
    );
    const limits = [quotaCpus, cpuset].filter(n => Number.isFinite(n) && n > 0);
    return limits.length ? Math.min(...limits) : (os.availableParallelism?.() || os.cpus()?.length || 1);
}
function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes, index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return index === 0 ? value.toFixed(0) + ' ' + units[index] : value.toFixed(2) + ' ' + units[index];
}
let diskCache = null;
let diskCacheAt = 0;
function getDiskInfo() {
    if (diskCache && Date.now() - diskCacheAt < 30000) return diskCache;
    try {
        const stat = fs.statfsSync(process.cwd());
        const total = Number(stat.blocks) * Number(stat.bsize);
        const free = Number(stat.bavail) * Number(stat.bsize);
        const used = Math.max(0, total - Number(stat.bfree) * Number(stat.bsize));
        let projectBytes = 0;
        let scannedFiles = 0;
        const walk = (dir, depth = 0) => {
            if (depth > 5 || scannedFiles >= 8000) return;
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries) {
                if (scannedFiles++ >= 8000) break;
                if (entry.isSymbolicLink() || entry.name === '.git' || entry.name === 'node_modules') continue;
                const full = path.join(dir, entry.name);
                try {
                    const st = fs.statSync(full);
                    if (st.isDirectory()) walk(full, depth + 1);
                    else projectBytes += st.size;
                } catch {}
            }
        };
        walk(process.cwd());
        diskCache = { total, free, used, projectBytes, source: 'filesystem', quotaKnown: false };
        diskCacheAt = Date.now();
        return diskCache;
    } catch {
        diskCache = { total: null, free: null, used: null, projectBytes: null, source: 'unavailable', quotaKnown: false };
        diskCacheAt = Date.now();
        return diskCache;
    }
}
function getResourceSnapshot() {
    const mem = process.memoryUsage();
    const containerMemoryUsed = readNumber(['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']);
    const memoryUsed = containerMemoryUsed || mem.rss;
    const memoryLimit = getMemoryLimitBytes();
    const cpuLimit = getCpuLimit();
    const disk = getDiskInfo();
    return {
        ram: {
            usedBytes: memoryUsed,
            limitBytes: memoryLimit,
            used: formatBytes(memoryUsed),
            limit: formatBytes(memoryLimit),
            percent: memoryLimit > 0 ? Math.min(100, memoryUsed / memoryLimit * 100) : null,
            source: containerMemoryUsed ? 'cgroup' : 'process-rss'
        },
        cpu: { cores: cpuLimit, label: Number.isInteger(cpuLimit) ? String(cpuLimit) : cpuLimit.toFixed(2) },
        disk: {
            total: formatBytes(disk.total),
            used: formatBytes(disk.used),
            free: formatBytes(disk.free),
            project: formatBytes(disk.projectBytes),
            quotaKnown: disk.quotaKnown,
            note: 'Filesystem capacity; hosting quota is not exposed to this container'
        },
        memoryLimitBytes: memoryLimit,
        diskRaw: disk
    };
}
module.exports = { getResourceSnapshot, formatBytes, getMemoryLimitBytes, getCpuLimit, getDiskInfo };
