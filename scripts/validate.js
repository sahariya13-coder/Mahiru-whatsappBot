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
const PACKAGE_JSON = require(path.join(ROOT, 'package.json'));
const LOCAL_EXTENSIONS = ['.js', '.cjs', '.mjs', '.json', '.node'];

function resolveLocalRequire(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [base, ...LOCAL_EXTENSIONS.map((ext) => base + ext)];
    for (const candidate of candidates) {
        try {
            if (fs.statSync(candidate).isFile()) return candidate;
            if (fs.statSync(candidate).isDirectory()) {
                const packageFile = path.join(candidate, 'package.json');
                if (fs.existsSync(packageFile)) {
                    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
                    if (pkg.main) {
                        const mainTarget = path.resolve(candidate, pkg.main);
                        for (const option of [mainTarget, ...LOCAL_EXTENSIONS.map((ext) => mainTarget + ext)]) {
                            if (fs.existsSync(option) && fs.statSync(option).isFile()) return option;
                        }
                    }
                }
                const indexFile = path.join(candidate, 'index.js');
                if (fs.existsSync(indexFile)) return indexFile;
            }
        } catch {}
    }
    return null;
}


for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8' });
    if (result.status !== 0) {
        failures.push({
            file: path.relative(ROOT, file),
            error: (result.stderr || result.stdout || 'Unknown syntax error').trim()
        });
    }

    const source = fs.readFileSync(file, 'utf8');
    const requireRx = /require\\(\\s*['"]([.]{1,2}\\/[^'"]+)['"]\\s*\\)/g;
    for (const match of source.matchAll(requireRx)) {
        const resolved = resolveLocalRequire(file, match[1]);
        if (!resolved) {
            failures.push({
                file: path.relative(ROOT, file),
                error: 'Unresolved local require: ' + match[1]
            });
        }
    }
}

if (failures.length) {
    for (const failure of failures) console.error('\n❌ ' + failure.file + '\n' + failure.error);
    console.error('\nSyntax validation failed: ' + failures.length + ' of ' + files.length + ' files.');
    process.exit(1);
}

console.log('✅ JavaScript syntax + local module validation passed for ' + files.length + ' files.');
