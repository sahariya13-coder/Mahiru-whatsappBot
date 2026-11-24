const settings = require('../settings');
const { addSudo, removeSudo, getSudoList } = require('../lib/index');
const isOwnerOrSudo = require('../lib/isOwner');
const buttonEngine = require('../lib/buttonEngine');

function unwrap(message) {
    let m = message?.message || {};
    for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        if (m[key]?.message) m = m[key].message;
    }
    return m;
}

function rawText(message) {
    const interactive = buttonEngine?.extractInteractiveCommand?.(message);
    if (interactive) return String(interactive).trim();
    const m = unwrap(message);
    return String(
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.buttonsResponseMessage?.selectedButtonId ||
        m.templateButtonReplyMessage?.selectedId ||
        m.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ''
    ).trim();
}

function normalizeTarget(raw = '') {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.includes('@lid')) return settings.normalizeLid?.(value) || value;
    const phone = settings.normalizePhone?.(value) || value.split('@')[0].split(':')[0].replace(/\D/g, '');
    return phone && phone.length >= 7 && phone.length <= 15 ? phone + '@s.whatsapp.net' : '';
}

function extractTarget(message, chatId, args) {
    const m = unwrap(message);
    const ctx = m.extendedTextMessage?.contextInfo ||
        m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || {};
    const mentioned = ctx.mentionedJid?.[0];
    if (mentioned) return normalizeTarget(mentioned);
    if (ctx.participant) return normalizeTarget(ctx.participant);

    const arg = args.slice(1).join(' ').trim();
    const lid = arg.match(/[0-9]{5,30}@lid/i)?.[0];
    if (lid) return normalizeTarget(lid);
    const digits = arg.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) return normalizeTarget(digits);

    if (chatId && !String(chatId).endsWith('@g.us')) return normalizeTarget(chatId);
    return '';
}

function isProtectedTarget(jid) {
    if (!jid) return true;
    return Boolean(
        settings.isBotOwnerJid?.(jid, jid) ||
        settings.isBlockedSudoJid?.(jid, jid)
    );
}

async function reply(sock, chatId, message, text) {
    return sock.sendMessage(chatId, { text }, { quoted: message });
}

async function sudoCommand(sock, chatId, message) {
    const senderJid = message?.key?.participant || message?.key?.remoteJid || '';
    const text = rawText(message);
    const args = text.split(/\s+/).slice(1);
    const sub = (args[0] || '').toLowerCase();

    try {
        const isOwner = await isOwnerOrSudo(senderJid, sock, chatId, message);
        // Only the configured owner/root identity can change the Sudo list.
        const isConfiguredOwner = await require('../lib/isOwner').isBotOwner(senderJid, sock, chatId, message);
        if (!isConfiguredOwner) {
            await reply(sock, chatId, message, '🔒 এই কমান্ড শুধু যাচাইকৃত Bot Owner ব্যবহার করতে পারবেন।');
            return;
        }

        const usage = [
            '╭━━━〔 🛡️ MAHIRU ADMIN CONTROL 〕━━━╮',
            '┃ .sudo add <নম্বর/@mention/reply>',
            '┃ .sudo del <নম্বর/@mention/reply>',
            '┃ .sudo list',
            '┃ .sudo status',
            '┃ .sudo purge',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            'Alias: .adm'
        ].join('\n');

        if (!sub || !['add', '+', 'del', 'remove', 'rm', '-', 'list', 'ls', 'status', 'audit', 'purge'].includes(sub)) {
            await reply(sock, chatId, message, usage);
            return;
        }

        if (sub === 'list' || sub === 'ls') {
            const list = (await getSudoList()).filter(jid => !isProtectedTarget(jid));
            const owner = settings.botOwnerNumber || settings.ownerNumber || 'Bot Owner';
            const lines = list.map((jid, i) => (i + 1) + '. ' + (jid.includes('@lid') ? jid : '+' + jid.split('@')[0]));
            await reply(sock, chatId, message,
                '👑 Owner: ' + owner + '\n\n' +
                (lines.length ? '🛡️ Active Sudo:\n' + lines.join('\n') : 'কোনো Sudo user নেই।')
            );
            return;
        }

        if (sub === 'status' || sub === 'audit') {
            const list = await getSudoList();
            const blocked = list.filter(jid => settings.isBlockedSudoJid?.(jid, jid)).length;
            await reply(sock, chatId, message,
                '🛡️ MAHIRU SECURITY STATUS\n' +
                'Owner verification: ACTIVE\n' +
                'Sudo entries: ' + list.length + '\n' +
                'Blocked entries: ' + blocked + '\n' +
                'Owner/Sudo access check: ' + (isOwner ? 'OK' : 'DENIED')
            );
            return;
        }

        if (sub === 'purge') {
            const list = await getSudoList();
            let removed = 0;
            for (const jid of list) {
                if (isProtectedTarget(jid) || !normalizeTarget(jid)) {
                    if (await removeSudo(jid)) removed++;
                }
            }
            await reply(sock, chatId, message, '🧹 Sudo cleanup complete. Removed: ' + removed);
            return;
        }

        let target = extractTarget(message, chatId, args);
        if (['del', 'remove', 'rm', '-'].includes(sub) && /^\d{1,2}$/.test(args[1] || '')) {
            const current = (await getSudoList()).filter(jid => !isProtectedTarget(jid));
            const selected = current[Number(args[1]) - 1];
            if (selected) target = selected;
        }
        if (!target) {
            await reply(sock, chatId, message, 'টার্গেট মেনশন, রিপ্লাই অথবা নম্বর দিন।\nউদাহরণ: .sudo add 8801XXXXXXXXX');
            return;
        }
        if (isProtectedTarget(target)) {
            await reply(sock, chatId, message, '🔒 Owner বা Blocked identity-কে Sudo তালিকায় পরিবর্তন করা যাবে না।');
            return;
        }

        if (['add', '+'].includes(sub)) {
            const ok = await addSudo(target);
            await reply(sock, chatId, message, ok ? '✅ Sudo যুক্ত হয়েছে: ' + target : '❌ Sudo যোগ করা যায়নি।');
            return;
        }

        const ok = await removeSudo(target);
        await reply(sock, chatId, message, ok ? '✅ Sudo access বাতিল হয়েছে: ' + target : 'ℹ️ এই user Sudo তালিকায় নেই।');
    } catch (error) {
        console.error('[sudo] command error:', error?.stack || error);
        await reply(sock, chatId, message, '❌ Sudo command চালাতে সমস্যা হয়েছে। Console log পরীক্ষা করুন।');
    }
}

module.exports = sudoCommand;
