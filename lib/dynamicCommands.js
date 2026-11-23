/**
 * MSK • Mahiru v2.0 ULTRA — No-Code Dynamic Commands, AI Commands, Auto-Triggers & Macro Engine
 * Features:
 *  - Zero-Code Command CRUD: Create, Edit, Toggle & Delete commands live without restart
 *  - 3 Safe Execution Modes (Zero eval()):
 *      1. 'text'  : Instant template replies with {name}, {args}, {time}, {date}, {owner}, {bot}, {website}
 *      2. 'ai'    : Custom AI-powered commands via aiOrchestrator
 *      3. 'macro' : Multi-action system workflows (auto-locked to Owner-Only)
 *  - Keyword Auto-Triggers with Scope (private/group/all), Match Type & Per-Chat Cooldown
 *  - Protected Core Command Guard + 256MB RAM Bounded Storage & Atomic Persistence
 */

const fs = require('fs');
const path = require('path');

let systemControl = null;
try { systemControl = require('./systemControl'); } catch {}

let aiOrchestrator = null;
try { aiOrchestrator = require('./aiOrchestrator'); } catch {}

let voiceEngine = null;
try { voiceEngine = require('./voiceEngine'); } catch {}

let memoryEngine = null;
try { memoryEngine = require('./memoryEngine'); } catch {}

let systemOptimizer = null;
try { systemOptimizer = require('./systemOptimizer'); } catch {}

let callBlocker = null;
try { callBlocker = require('./callBlocker'); } catch {}

let mahiruCore = null;
try { mahiruCore = require('./mahiruCore'); } catch {}

const DEFAULT_CONFIG = {
    dataFile: './data/dynamic_commands.json',
    maxCommands: 60,
    maxTriggers: 40,
    maxMacroSteps: 6,
    maxCooldownEntries: 150,
    defaultTriggerCooldownSec: 60,
    aiCommandTimeoutMs: 12000
};

const VALID_CMD_TYPES = new Set(['text', 'ai', 'macro']);
const VALID_SCOPES = new Set(['all', 'private', 'group']);
const VALID_MATCH_TYPES = new Set(['includes', 'exact', 'startsWith']);

// ম্যাক্রোর ভেতর অনুমোদিত নিরাপদ সিস্টেম অ্যাকশনসমূহ
const ALLOWED_MACRO_ACTIONS = new Set([
    'send_text',
    'set_status',
    'callblock',
    'global_bot',
    'voice_mode',
    'deep_clean',
    'branding'
]);

function normalizeBn(str = '') {
    return String(str || '').normalize('NFC');
}

function normalizeCommandName(raw = '') {
    let name = normalizeBn(raw).trim().toLowerCase().split(/\s+/)[0] || '';
    if (!name) return '';
    name = name.replace(/^[./!]+/, '');
    if (!name || name.length > 28) return '';
    // বাংলা, ইংরেজি অক্ষর, সংখ্যা, _ ও - অনুমোদিত
    if (!/^[\u0980-\u09FFa-z0-9_-]+$/i.test(name)) return '';
    return `.${name}`;
}

function isProtectedCoreCommand(cmdName) {
    if (!cmdName) return true;
    if (systemControl?.PROTECTED_COMMANDS?.has?.(cmdName)) return true;
    const core = new Set(['.help', '.menu', '.ping', '.alive', '.owner', '.setpin', '.pin']);
    return core.has(cmdName);
}

function getDhakaDateTime() {
    const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const h = now.getUTCHours();
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const date = `${now.getUTCDate()}/${now.getUTCMonth() + 1}/${now.getUTCFullYear()}`;
    return { time: `${h12}:${m} ${ampm}`, date };
}

function renderTemplate(template = '', ctx = {}) {
    const brand = systemControl?.getBotBranding ? systemControl.getBotBranding() : {};
    const dt = getDhakaDateTime();
    const vars = {
        '{name}': String(ctx.pushName || 'বন্ধু'),
        '{args}': String(ctx.args || '').trim(),
        '{time}': dt.time,
        '{date}': dt.date,
        '{bot}': brand.assistantName || 'মায়া',
        '{botname}': brand.botName || 'Mahiru Shiina',
        '{owner}': brand.ownerName || 'MSK',
        '{website}': brand.ownerWebsite || ''
    };

    let out = String(template || '');
    for (const [token, val] of Object.entries(vars)) {
        if (out.includes(token)) out = out.split(token).join(val);
    }
    return out.trim();
}

function atomicWriteJson(filePath, data) {
    let tmp = '';
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, filePath);
        return true;
    } catch {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        return false;
    }
}

class DynamicCommandEngine {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        this.store = {
            version: '2.0',
            commands: Object.create(null), // ".bkash" -> CommandDef
            triggers: []                   // AutoTriggerDef[]
        };

        this.triggerCooldowns = new Map(); // "triggerId:chatId" -> expiresAtMs
        this.metrics = {
            commandsExecuted: 0,
            aiCommandsExecuted: 0,
            macrosExecuted: 0,
            triggersFired: 0
        };

        this.load();

        if (systemOptimizer?.registerCleanupHook) {
            systemOptimizer.registerCleanupHook('dynamicCommands', () => this.sweepCooldowns());
        }

        global.dynamicCommands = this;
    }

    load() {
        try {
            if (!fs.existsSync(this.config.dataFile)) return;
            const parsed = JSON.parse(fs.readFileSync(this.config.dataFile, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                this.store.commands = parsed.commands && typeof parsed.commands === 'object'
                    ? parsed.commands
                    : Object.create(null);
                this.store.triggers = Array.isArray(parsed.triggers)
                    ? parsed.triggers.slice(0, this.config.maxTriggers)
                    : [];
            }
        } catch {}
    }

    save() {
        return atomicWriteJson(this.config.dataFile, this.store);
    }

    sweepCooldowns() {
        const now = Date.now();
        for (const [k, exp] of this.triggerCooldowns.entries()) {
            if (exp <= now) this.triggerCooldowns.delete(k);
        }
        while (this.triggerCooldowns.size > this.config.maxCooldownEntries) {
            this.triggerCooldowns.delete(this.triggerCooldowns.keys().next().value);
        }
    }

    // =========================================================================
    // ১. ডায়নামিক কমান্ড CRUD (তৈরি / এডিট / টগল / ডিলিট / লিস্ট)
    // =========================================================================

    createOrUpdateCommand({
        name = '',
        type = 'text',
        reply = '',
        aiPrompt = '',
        macroActions = [],
        scope = 'all',
        ownerOnly = false,
        description = ''
    } = {}) {
        const cmdName = normalizeCommandName(name);
        if (!cmdName) {
            return { ok: false, error: 'সঠিক কমান্ডের নাম দিন (যেমন: `.bkash`, `.price`, `.nightmode`)।' };
        }
        if (isProtectedCoreCommand(cmdName)) {
            return { ok: false, error: `🔒 \`${cmdName}\` একটি সুরক্ষিত কোর কমান্ড—এটি ওভাররাইট করা যাবে না।` };
        }

        const safeType = VALID_CMD_TYPES.has(type) ? type : 'text';
        const safeScope = VALID_SCOPES.has(scope) ? scope : 'all';
        const isUpdate = Boolean(this.store.commands[cmdName]);

        if (!isUpdate && Object.keys(this.store.commands).length >= this.config.maxCommands) {
            return { ok: false, error: `সর্বোচ্চ ${this.config.maxCommands}টি ডায়নামিক কমান্ড তৈরি করা যাবে। পুরোনো কোনো কমান্ড ডিলিট করুন।` };
        }

        const cleanReply = normalizeBn(reply).trim().slice(0, 1500);
        const cleanAiPrompt = normalizeBn(aiPrompt).trim().slice(0, 800);
        const safeActions = Array.isArray(macroActions)
            ? macroActions
                .filter((a) => a && ALLOWED_MACRO_ACTIONS.has(String(a.action || '').trim()))
                .slice(0, this.config.maxMacroSteps)
            : [];

        if (safeType === 'text' && !cleanReply) {
            return { ok: false, error: 'টেক্সট কমান্ডের জন্য রিপ্লাই মেসেজ দিতে হবে।' };
        }
        if (safeType === 'ai' && !cleanAiPrompt) {
            return { ok: false, error: 'AI কমান্ডের জন্য প্রম্পট নির্দেশনা দিতে হবে।' };
        }
        if (safeType === 'macro' && !safeActions.length) {
            return { ok: false, error: 'ম্যাক্রো কমান্ডের জন্য অন্তত ১টি বৈধ অ্যাকশন দিতে হবে।' };
        }

        // ম্যাক্রো কমান্ড নিরাপত্তার স্বার্থে সবসময় Owner-Only লক থাকবে
        const finalOwnerOnly = safeType === 'macro' ? true : Boolean(ownerOnly);

        const record = {
            name: cmdName,
            type: safeType,
            reply: cleanReply,
            aiPrompt: cleanAiPrompt,
            macroActions: safeActions,
            scope: safeScope,
            ownerOnly: finalOwnerOnly,
            enabled: true,
            description: normalizeBn(description).trim().slice(0, 100),
            hits: this.store.commands[cmdName]?.hits || 0,
            updatedAt: Date.now()
        };

        this.store.commands[cmdName] = record;
        this.save();
        return { ok: true, command: record, updated: isUpdate };
    }

    deleteCommand(name = '') {
        const cmdName = normalizeCommandName(name);
        if (!cmdName || !this.store.commands[cmdName]) {
            return { ok: false, error: `\`${cmdName || name}\` নামে কোনো ডায়নামিক কমান্ড পাওয়া যায়নি।` };
        }
        delete this.store.commands[cmdName];
        this.save();
        return { ok: true, deleted: cmdName };
    }

    toggleCommand(name = '', enabled = true) {
        const cmdName = normalizeCommandName(name);
        const cmd = cmdName ? this.store.commands[cmdName] : null;
        if (!cmd) return { ok: false, error: `\`${cmdName || name}\` কমান্ড পাওয়া যায়নি।` };
        cmd.enabled = Boolean(enabled);
        cmd.updatedAt = Date.now();
        this.save();
        return { ok: true, command: cmd };
    }

    listCommands() {
        return Object.values(this.store.commands);
    }

    formatCommandsList() {
        const list = this.listCommands();
        if (!list.length) return '⚡ এখনো কোনো ডায়নামিক কমান্ড তৈরি করা হয়নি।';
        const lines = [`⚡ *ডায়নামিক কমান্ড তালিকা (${list.length}টি)*`, '──────────────────'];
        list.forEach((c, i) => {
            const st = c.enabled ? '🟢' : '⚪';
            const lock = c.ownerOnly ? '🔐' : '🌐';
            lines.push(`${i + 1}. ${st} \`${c.name}\` [${c.type.toUpperCase()} | ${c.scope} ${lock}] (${c.hits || 0} হিট)`);
        });
        return lines.join('\n');
    }

    // =========================================================================
    // ২. অটো-ট্রিগার CRUD (কীওয়ার্ড অটোমেশন)
    // =========================================================================

    createTrigger({
        keyword = '',
        reply = '',
        matchType = 'includes',
        scope = 'private',
        cooldownSec = this.config.defaultTriggerCooldownSec
    } = {}) {
        const cleanKw = normalizeBn(keyword).trim().toLowerCase().slice(0, 80);
        const cleanReply = normalizeBn(reply).trim().slice(0, 1200);
        if (cleanKw.length < 2 || !cleanReply) {
            return { ok: false, error: 'অটো-ট্রিগারের জন্য কীওয়ার্ড (কমপক্ষে ২ অক্ষর) ও রিপ্লাই মেসেজ দিন।' };
        }
        if (this.store.triggers.length >= this.config.maxTriggers) {
            return { ok: false, error: `সর্বোচ্চ ${this.config.maxTriggers}টি অটো-ট্রিগার সেট করা যাবে।` };
        }

        const record = {
            id: `TR-${Date.now().toString(36).toUpperCase().slice(-5)}`,
            keyword: cleanKw,
            reply: cleanReply,
            matchType: VALID_MATCH_TYPES.has(matchType) ? matchType : 'includes',
            scope: VALID_SCOPES.has(scope) ? scope : 'private',
            cooldownSec: Math.max(5, Math.min(3600, Number(cooldownSec) || 60)),
            enabled: true,
            hits: 0,
            createdAt: Date.now()
        };

        this.store.triggers.push(record);
        this.save();
        return { ok: true, trigger: record };
    }

    deleteTrigger(idOrKeyword = '') {
        const q = normalizeBn(idOrKeyword).trim().toLowerCase();
        if (!q) return { ok: false, error: 'ট্রিগার আইডি বা কীওয়ার্ড দিন।' };

        const idx = this.store.triggers.findIndex(
            (t) => t.id.toLowerCase() === q || t.keyword.toLowerCase() === q
        );
        if (idx < 0) return { ok: false, error: 'এই আইডি বা কীওয়ার্ডে কোনো অটো-ট্রিগার পাওয়া যায়নি।' };

        const [removed] = this.store.triggers.splice(idx, 1);
        this.save();
        return { ok: true, removed };
    }

    listTriggers() {
        return [...this.store.triggers];
    }

    formatTriggersList() {
        if (!this.store.triggers.length) return '🤖 এখনো কোনো অটো-ট্রিগার সেট করা হয়নি।';
        const lines = [`🤖 *অটো-ট্রিগার তালিকা (${this.store.triggers.length}টি)*`, '──────────────────'];
        this.store.triggers.forEach((t, i) => {
            lines.push(`${i + 1}. \`${t.id}\` — *"${t.keyword}"* [${t.scope} | ${t.cooldownSec}s] (${t.hits || 0} হিট)`);
        });
        return lines.join('\n');
    }

    // =========================================================================
    // ৩. রানটাইম এক্সিকিউশন (ডায়নামিক কমান্ড, ম্যাক্রো ও অটো-ট্রিগার)
    // =========================================================================

    async executeMacro(cmd, ctx) {
        const results = [];
        for (const step of cmd.macroActions || []) {
            try {
                switch (step.action) {
                    case 'send_text':
                        if (step.text) results.push(renderTemplate(step.text, ctx));
                        break;
                    case 'set_status':
                        if (mahiruCore?.setOwnerStatus) {
                            mahiruCore.setOwnerStatus({
                                active: step.active !== false,
                                mode: step.mode || 'busy',
                                note: step.note || '',
                                durationMin: Number(step.durationMin || 0)
                            });
                            results.push(`⚡ স্ট্যাটাস: *${step.active === false ? 'অনলাইন' : (step.mode || 'busy')}*`);
                        }
                        break;
                    case 'callblock':
                        if (callBlocker?.setCallBlocker) {
                            callBlocker.setCallBlocker(Boolean(step.enabled), step.note || '', step.duration || '');
                            results.push(`📵 কল ব্লকার: *${step.enabled ? 'চালু' : 'বন্ধ'}*`);
                        }
                        break;
                    case 'global_bot':
                        if (memoryEngine?.setGlobalBotEnabled) {
                            memoryEngine.setGlobalBotEnabled(Boolean(step.enabled));
                            results.push(`🤖 গ্লোবাল বট: *${step.enabled ? 'চালু' : 'বন্ধ'}*`);
                        }
                        break;
                    case 'voice_mode':
                        if (voiceEngine?.setGlobalVoiceMode && step.mode) {
                            voiceEngine.setGlobalVoiceMode(step.mode);
                            results.push(`🎙️ ভয়েস মোড: \`${step.mode}\``);
                        }
                        break;
                    case 'deep_clean':
                        if (systemOptimizer?.deepClean) {
                            const rep = systemOptimizer.deepClean('manual');
                            results.push(`🧹 ক্লিন: ${rep.totalRemoved || 0} ফাইল (${rep.freedMb || 0} MB)`);
                        }
                        break;
                    case 'branding':
                        if (systemControl?.setBotBranding && step.updates) {
                            const r = systemControl.setBotBranding(step.updates);
                            if (r.changed.length) results.push(`✨ ব্র্যান্ডিং আপডেট: ${r.changed.join(', ')}`);
                        }
                        break;
                }
            } catch {}
        }
        this.metrics.macrosExecuted++;
        return results.length
            ? `⚡ *ম্যাক্রো সম্পন্ন (\`${cmd.name}\`):*\n${results.join('\n')}`
            : `✅ ম্যাক্রো \`${cmd.name}\` সম্পন্ন হয়েছে।`;
    }

    async tryExecuteDynamicCommand({
        rawText = '',
        chatId = '',
        isGroup = false,
        isOwner = false,
        pushName = ''
    } = {}) {
        const trimmed = normalizeBn(rawText).trim();
        if (!trimmed || !/^[./!]/.test(trimmed)) return { handled: false };

        const firstSpace = trimmed.search(/\s/);
        const rawCmd = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
        const args = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim();

        const cmdName = normalizeCommandName(rawCmd);
        const cmd = cmdName ? this.store.commands[cmdName] : null;
        if (!cmd || !cmd.enabled) return { handled: false };

        if (cmd.scope === 'group' && !isGroup) return { handled: false };
        if (cmd.scope === 'private' && isGroup) return { handled: false };

        if (cmd.ownerOnly && !isOwner) {
            return { handled: true, reply: '🔐 এই কমান্ডটি শুধু অনুমোদিত ওনার ব্যবহার করতে পারবেন।' };
        }

        const ctx = { chatId, isGroup, isOwner, pushName, args };
        cmd.hits = (cmd.hits || 0) + 1;
        this.metrics.commandsExecuted++;

        if (cmd.type === 'text') {
            return { handled: true, command: cmdName, reply: renderTemplate(cmd.reply, ctx) };
        }

        if (cmd.type === 'ai') {
            if (!aiOrchestrator?.generateReply) {
                return { handled: true, command: cmdName, reply: '⚠️ AI ইঞ্জিন এই মুহূর্তে ব্যস্ত, একটু পর চেষ্টা করুন।' };
            }
            const promptText = renderTemplate(cmd.aiPrompt, ctx);
            const res = await aiOrchestrator.generateReply({
                systemPrompt: 'You are Mahiru, a smart Bangladeshi assistant. Follow the user command template concisely in natural Bangla.',
                userText: args ? `${promptText}\n\nইউজার ইনপুট: ${args}` : promptText,
                temperature: 0.65,
                maxTokens: 420,
                preferSpeed: true,
                timeoutMs: this.config.aiCommandTimeoutMs
            });
            this.metrics.aiCommandsExecuted++;
            return {
                handled: true,
                command: cmdName,
                reply: res?.ok && res.text ? res.text.trim() : '⚠️ উত্তর তৈরি করতে সাময়িক সমস্যা হয়েছে।'
            };
        }

        if (cmd.type === 'macro') {
            const reply = await this.executeMacro(cmd, ctx);
            return { handled: true, command: cmdName, reply };
        }

        return { handled: false };
    }

    tryExecuteAutoTrigger({
        rawText = '',
        chatId = '',
        isGroup = false,
        isOwner = false,
        pushName = ''
    } = {}) {
        if (isOwner || !chatId || !this.store.triggers.length) return { matched: false };

        const clean = normalizeBn(rawText).trim().toLowerCase();
        if (!clean || clean.startsWith('.')) return { matched: false };

        const now = Date.now();
        for (const trig of this.store.triggers) {
            if (!trig.enabled) continue;
            if (trig.scope === 'group' && !isGroup) continue;
            if (trig.scope === 'private' && isGroup) continue;

            let hit = false;
            if (trig.matchType === 'exact') hit = clean === trig.keyword;
            else if (trig.matchType === 'startsWith') hit = clean.startsWith(trig.keyword);
            else hit = clean.includes(trig.keyword);

            if (!hit) continue;

            const cdKey = `${trig.id}:${chatId}`;
            const exp = this.triggerCooldowns.get(cdKey) || 0;
            if (exp > now) return { matched: false };

            if (this.triggerCooldowns.size >= this.config.maxCooldownEntries) {
                this.sweepCooldowns();
            }
            this.triggerCooldowns.set(cdKey, now + (trig.cooldownSec || 60) * 1000);

            trig.hits = (trig.hits || 0) + 1;
            this.metrics.triggersFired++;
            return {
                matched: true,
                triggerId: trig.id,
                reply: renderTemplate(trig.reply, { pushName, args: rawText })
            };
        }

        return { matched: false };
    }

    getStats() {
        return {
            totalCommands: Object.keys(this.store.commands).length,
            totalTriggers: this.store.triggers.length,
            ...this.metrics
        };
    }
}

const dynamicCommands = new DynamicCommandEngine();

module.exports = {
    DynamicCommandEngine,
    dynamicCommands,
    createOrUpdateDynamicCommand: (opts) => dynamicCommands.createOrUpdateCommand(opts),
    deleteDynamicCommand: (name) => dynamicCommands.deleteCommand(name),
    toggleDynamicCommand: (name, en) => dynamicCommands.toggleCommand(name, en),
    listDynamicCommands: () => dynamicCommands.listCommands(),
    formatDynamicCommandsList: () => dynamicCommands.formatCommandsList(),
    createAutoTrigger: (opts) => dynamicCommands.createTrigger(opts),
    deleteAutoTrigger: (q) => dynamicCommands.deleteTrigger(q),
    listAutoTriggers: () => dynamicCommands.listTriggers(),
    formatAutoTriggersList: () => dynamicCommands.formatTriggersList(),
    tryExecuteDynamicCommand: (ctx) => dynamicCommands.tryExecuteDynamicCommand(ctx),
    tryExecuteAutoTrigger: (ctx) => dynamicCommands.tryExecuteAutoTrigger(ctx),
    getDynamicCommandsStats: () => dynamicCommands.getStats()
};
