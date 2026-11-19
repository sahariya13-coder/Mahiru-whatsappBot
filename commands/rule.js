const fs = require('fs');
const path = require('path');
const RULES_FILE = path.join(__dirname, '../data/aiRules.json');

function loadRules() {
    try {
        if (!fs.existsSync(RULES_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
        return Array.isArray(data.rules) ? data.rules : [];
    } catch (error) {
        console.error('[RULE] Load error:', error.message);
        return [];
    }
}
function saveRules(rules) {
    try {
        const dir = path.dirname(RULES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tempFile = RULES_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify({ rules }, null, 2), 'utf8');
        fs.renameSync(tempFile, RULES_FILE);
        return true;
    } catch (error) {
        console.error('[RULE] Save error:', error.message);
        return false;
    }
}
function getEnabledRules() {
    return loadRules().filter(rule => rule.enabled === true);
}
async function handleRuleCommand(sock, chatId, message, rawText) {
    const args = String(rawText || '').trim().replace(/^\.rule\s*/i, '');
    const [actionRaw = 'help', ...rest] = args.split(/\s+/);
    const action = actionRaw.toLowerCase();
    const rules = loadRules();
    const send = text => sock.sendMessage(chatId, { text }, { quoted: message });

    if (!args || action === 'help') return send(
        '*MAHIRU AI RULE SYSTEM*\n\n' +
        '.rule add <name> | <rule> — নতুন Rule যোগ\n' +
        '.rule list — সব Rule দেখুন\n' +
        '.rule on <name> — Rule চালু\n' +
        '.rule off <name> — Rule বন্ধ\n' +
        '.rule edit <name> | <new rule> — Rule এডিট\n' +
        '.rule del <name> — Rule ডিলিট\n\n' +
        'প্রতিটি Rule প্রথমে OFF থাকবে। একাধিক Rule একসাথে ON রাখা যাবে। শুধু Inbox AI-এর Prompt-এ যুক্ত হবে; Group AI-তে নয়।'
    );

    if (action === 'list') {
        if (!rules.length) return send('এখনো কোনো AI Rule যোগ করা হয়নি।\nযোগ করতে: .rule add <name> | <rule>');
        return send('*SAVED AI RULES*\n\n' + rules.map((rule, i) =>
            `${i + 1}. ${rule.name}\n   Status: ${rule.enabled ? 'ON ✅' : 'OFF ❌'}\n   Rule: ${rule.text}`
        ).join('\n\n'));
    }

    if (action === 'add' || action === 'edit') {
        const payload = rest.join(' ');
        const splitAt = payload.indexOf('|');
        if (splitAt < 0) return send(action === 'add'
            ? 'ব্যবহার: .rule add <name> | <rule text>'
            : 'ব্যবহার: .rule edit <name> | <new rule text>');
        const name = payload.slice(0, splitAt).trim();
        const text = payload.slice(splitAt + 1).trim();
        if (!name || !text) return send('❌ Rule-এর নাম এবং Rule text দুটোই দিতে হবে।');
        if (name.length > 60 || text.length > 4000) return send('❌ নাম সর্বোচ্চ ৬০ এবং Rule সর্বোচ্চ ৪০০০ অক্ষর হতে পারবে।');
        const index = rules.findIndex(r => r.name.toLowerCase() === name.toLowerCase());
        if (action === 'add') {
            if (index >= 0) return send('❌ এই নামে Rule আগে থেকেই আছে। Edit করতে .rule edit ব্যবহার করুন।');
            rules.push({ name, text, enabled: false, createdAt: new Date().toISOString() });
            if (!saveRules(rules)) return send('❌ Rule save করা যায়নি।');
            return send(`✅ Rule “${name}” যোগ হয়েছে। Status: OFF ❌\nচালু করতে: .rule on ${name}`);
        }
        if (index < 0) return send('❌ এই নামে কোনো Rule পাওয়া যায়নি। .rule list দেখুন।');
        rules[index].text = text;
        rules[index].updatedAt = new Date().toISOString();
        if (!saveRules(rules)) return send('❌ Rule update করা যায়নি।');
        return send(`✅ Rule “${name}” আপডেট হয়েছে। Status: ${rules[index].enabled ? 'ON' : 'OFF'}`);
    }

    if (['on', 'off', 'del', 'delete'].includes(action)) {
        const name = rest.join(' ').trim();
        if (!name) return send(`ব্যবহার: .rule ${action} <name>`);
        const index = rules.findIndex(r => r.name.toLowerCase() === name.toLowerCase());
        if (index < 0) return send('❌ এই নামে কোনো Rule পাওয়া যায়নি। .rule list দেখুন।');
        if (action === 'del' || action === 'delete') {
            const removed = rules.splice(index, 1)[0];
            if (!saveRules(rules)) return send('❌ Rule delete করা যায়নি।');
            return send(`🗑️ Rule “${removed.name}” ডিলিট হয়েছে।`);
        }
        rules[index].enabled = action === 'on';
        if (!saveRules(rules)) return send('❌ Rule status save করা যায়নি।');
        return send(action === 'on'
            ? `✅ Rule “${name}” ON করা হয়েছে। Inbox AI এখন থেকে এটি অনুসরণ করবে।`
            : `❌ Rule “${name}” OFF করা হয়েছে।`);
    }
    return send('❌ Unknown action. .rule লিখে সব Command দেখুন।');
}
module.exports = { handleRuleCommand, getEnabledRules };
