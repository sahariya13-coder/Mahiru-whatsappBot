'use strict';

const fs = require('fs');
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
function readEnvLimit(keys, multiplier = 1) {
    for (const key of keys) {
        const raw = process.env[key];
        if (raw == null || String(raw).trim() === '') continue;
        const value = Number(String(raw).trim());
        if (Number.isFinite(value) && value > 0) return value * multiplier;
    }
    return null;
}

function getMemoryLimitBytes() {
    // Altare/Pterodactyl-style templates commonly expose SERVER_MEMORY in MiB.
    const panelLimit = readEnvLimit(['SERVER_MEMORY', 'HOSTING_MEMORY_MB'], 1024 ** 2);
    if (panelLimit) return panelLimit;

    const v2 = readNumber(['/sys/fs/cgroup/memory.max']);
    const v1 = readNumber(['/sys/fs/cgroup/memory/memory.limit_in_bytes']);
    const candidate = v2 || v1;
    return candidate && candidate < 8 * 1024 ** 4 ? candidate : null;
}
function getCpuLimit() {
    // SERVER_CPU is generally expressed as a percentage of one CPU core.
    const panelPercent = readEnvLimit(['SERVER_CPU', 'SERVER_CPU_LIMIT', 'HOSTING_CPU_PERCENT']);
    if (panelPercent) return panelPercent / 100;

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
    return limits.length ? Math.min(...limits) : null;
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
                if (entry.isSymbolicLink() || entry.name === '.git') continue;
                const full = path.join(dir, entry.name);
                try {
                    const st = fs.statSync(full);
                    if (st.isDirectory()) walk(full, depth + 1);
                    else projectBytes += st.size;
                } catch {}
            }
        };
        walk(process.cwd());
        const diskQuotaBytes = readEnvLimit(['SERVER_DISK', 'SERVER_DISK_LIMIT', 'HOSTING_DISK_MB'], 1048576);
        diskCache = {
            total: total,
            free: free,
            used: used,
            projectBytes: projectBytes,
            quotaBytes: diskQuotaBytes,
            source: 'filesystem',
            quotaKnown: diskQuotaBytes !== null
        };
        diskCacheAt = Date.now();
        return diskCache;
    } catch {
        const diskQuotaBytes = readEnvLimit(['SERVER_DISK', 'SERVER_DISK_LIMIT', 'HOSTING_DISK_MB'], 1048576);
        diskCache = {
            total: null,
            free: null,
            used: null,
            projectBytes: null,
            quotaBytes: diskQuotaBytes,
            source: 'unavailable',
            quotaKnown: diskQuotaBytes !== null
        };
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
            limit: memoryLimit ? formatBytes(memoryLimit) : 'Not exposed',
            percent: memoryLimit > 0 ? Math.min(100, memoryUsed / memoryLimit * 100) : null,
            source: containerMemoryUsed ? 'cgroup' : 'process-rss'
        },
        cpu: { cores: cpuLimit, label: Number.isFinite(cpuLimit) ? (Number.isInteger(cpuLimit) ? String(cpuLimit) : cpuLimit.toFixed(2)) : 'Not exposed' },
        disk: {
            total: disk.quotaBytes ? formatBytes(disk.quotaBytes) : 'Not exposed',
            used: formatBytes(disk.projectBytes),
            free: disk.quotaBytes && Number.isFinite(disk.projectBytes) ? formatBytes(Math.max(0, disk.quotaBytes - disk.projectBytes)) : 'Unknown',
            project: formatBytes(disk.projectBytes),
            filesystemTotal: formatBytes(disk.total),
            quotaKnown: Boolean(disk.quotaBytes),
            note: disk.quotaBytes ? 'Panel quota detected; used is a bounded project-folder estimate' : 'Hosting disk quota is not exposed; filesystem size is not shown as allocation'
        },
        memoryLimitBytes: memoryLimit,
        diskRaw: disk
    };
}
module.exports = { getResourceSnapshot, formatBytes, getMemoryLimitBytes, getCpuLimit, getDiskInfo };
