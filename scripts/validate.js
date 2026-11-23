'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'temp', 'tmp', '.cache', 'session', 'sessions', '.mahiru-backup']);
const EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const files = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
}

walk(ROOT);
const failures = [];

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8' });
    if (result.status !== 0) {
        failures.push({
            file: path.relative(ROOT, file),
            error: (result.stderr || result.stdout || 'Unknown syntax error').trim()
        });
    }
}

if (failures.length) {
    for (const failure of failures) console.error('\n❌ ' + failure.file + '\n' + failure.error);
    console.error('\nSyntax validation failed: ' + failures.length + ' of ' + files.length + ' files.');
    process.exit(1);
}

console.log('✅ JavaScript syntax validation passed for ' + files.length + ' files.');
