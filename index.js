/**
 * Mahiru Shiina WhatsApp Bot
 * Credits: MSK
 */
const settings = require('./settings');
const { notifyOwner, sendToBotInboxAndOwner } = require('./lib/ownerNotify');

let activeSocket = null;
const ownerErrorNoticeTimes = new Map();
const originalConsoleError = console.error.bind(console);

function getErrorInfo(args) {
    const parts = [];
    let errorObject = null;
    for (const value of args) {
        if (value instanceof Error) {
            errorObject = errorObject || value;
            parts.push(value.stack || value.message || value.name);
        } else if (typeof value === 'string') {
            parts.push(value);
        } else {
            try { parts.push(JSON.stringify(value)); }
            catch { parts.push(String(value)); }
        }
    }
    const detail = parts.join(' ').slice(0, 1800) || 'Unknown error';
    const name = errorObject?.name || (detail.match(/\b(TypeError|ReferenceError|SyntaxError|RangeError|Error|FetchError|AxiosError)\b/) || [])[0] || 'Error';
    const message = errorObject?.message || detail.replace(/^.*?(?:Error|ERROR)[:\s-]*/i, '').slice(0, 500);
    const stack = errorObject?.stack || detail;
    const location = (stack.match(/(?:at .*?\()?((?:[A-Za-z]:)?[^\s()]+\.js:\d+:\d+)/) || [])[1] || 'লগে ফাইল/লাইন পাওয়া যায়নি';
    return { name, message, stack, location, detail };
}

function explainError(info) {
    const source = (info.name + ' ' + info.message + ' ' + info.detail).toLowerCase();
    if (/syntaxerror|unexpected token|unexpected identifier|missing\)/.test(source)) return 'কোডের Syntax ভুল—কোথাও bracket, quote, comma বা JavaScript লেখার নিয়মে সমস্যা আছে।';
    if (/referenceerror|is not defined/.test(source)) return 'কোনো variable/function ব্যবহার করা হয়েছে, কিন্তু সেটি declare বা import করা হয়নি।';
    if (/typeerror|cannot read propert|undefined|null/.test(source)) return 'কোনো value null/undefined বা ভুল type হওয়ায় তার property/function ব্যবহার করা যাচ্ছে না।';
    if (/enoent|no such file|not found/.test(source)) return 'প্রয়োজনীয় file বা folder পাওয়া যাচ্ছে না; path বা file name পরীক্ষা করতে হবে।';
    if (/econnrefused|enotfound|etimedout|network|socket hang up|fetch failed/.test(source)) return 'API/server/network connection ব্যর্থ হয়েছে; URL, server status বা internet connection পরীক্ষা করতে হবে।';
    if (/401|unauthorized|invalid api key|authentication/.test(source)) return 'API authentication ব্যর্থ—API key/token ভুল, expired বা অনুমতি নেই।';
    if (/403|forbidden/.test(source)) return 'Server access অনুমতি দেয়নি; permission, token বা provider restriction পরীক্ষা করতে হবে।';
    if (/enospc|no space left/.test(source)) return 'Hosting storage/temp space পূর্ণ হয়ে গেছে।';
    if (/heap out of memory|out of memory|allocation failed/.test(source)) return 'বটের memory/RAM শেষ হয়ে গেছে।';
    if (/rate.?limit|429|too many requests/.test(source)) return 'API rate limit অতিক্রম করেছে; কিছুক্ষণ অপেক্ষা বা request কমাতে হবে।';
    if (/bad decrypt|invalid.*session|logged.?out/.test(source)) return 'WhatsApp session/authentication সমস্যা; session status ও pairing পরীক্ষা করতে হবে।';
    return 'এই error-এর বিস্তারিত দেখে নির্দিষ্ট কারণ নির্ধারণ করতে হবে; নিচের message ও file/line দেখে সংশ্লিষ্ট অংশ পরীক্ষা করুন।';
}

async function notifyOwnerError(args, source = 'Console Error') {
    const info = getErrorInfo(Array.isArray(args) ? args : [args]);
    const fingerprint = (info.name + '|' + info.message + '|' + info.location).slice(0, 500);
    const now = Date.now();
    // একই error সর্বোচ্চ প্রতি ৪ ঘণ্টায় একবার Owner-কে পাঠানো হবে।
    if (now - (ownerErrorNoticeTimes.get(fingerprint) || 0) < 4 * 60 * 60 * 1000) return false;
    ownerErrorNoticeTimes.set(fingerprint, now);
    if (!activeSocket?.user) return false;

    const report = [
        '🚨 *MAHIRU ERROR REPORT*',
        '',
        '🔴 Error Name: ' + info.name,
        '📍 Source: ' + source,
        '📂 File / Line: ' + info.location,
        '🧾 Error: ' + info.message.slice(0, 700),
        '💡 সম্ভাব্য সমস্যা: ' + explainError(info),
        '⏰ সময়: ' + new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })
    ].join('\n');

    try {
        return await notifyOwner(activeSocket, report);
    } catch (sendError) {
        originalConsoleError('[ERROR REPORT] Could not notify owner:', sendError?.message || sendError);
        return false;
    }
}

// Capture errors written through console.error, including errors caught inside commands.
console.error = (...args) => {
    originalConsoleError(...args);
    void notifyOwnerError(args, 'Console / Command Log');
};

const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')

// One-time storage filename migration: preserve existing runtime data after branding rename.
try {
    const dataDir = path.join(process.cwd(), 'data');
    const legacyFiles = [
        'maya_activity.json', 'maya_training.json', 'maya_live_models_cache.json',
        'maya_system_control.json', 'maya_web_watch.json', 'maya_phone_specs_cache.json',
        'maya_voice_studio.json', 'maya_schedules.json', 'maya_healer_state.json',
        'maya_outbox_queue.json', 'maya_style_dna.json', 'maya_vector_graph.json'
    ];
    for (const oldName of legacyFiles) {
        const oldPath = path.join(dataDir, oldName);
        const newPath = path.join(dataDir, oldName.replace(/^maya_/, 'mahiru_'));
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
    }
    if (fs.existsSync(dataDir)) {
        for (const oldName of fs.readdirSync(dataDir)) {
            if (!oldName.startsWith('maya_backup_')) continue;
            const newPath = path.join(dataDir, oldName.replace(/^maya_backup_/, 'mahiru_backup_'));
            if (!fs.existsSync(newPath)) fs.renameSync(path.join(dataDir, oldName), newPath);
        }
    }
} catch (migrationError) {
    console.warn('[MAHIRU] Legacy data filename migration skipped:', migrationError?.message || migrationError);
}

// Restore local + Redis active data before loading modules that read JSON settings.
const persistentDataReady = require('./lib/persistent_data').start()
const axios = require('axios')
let handleMessages, handleGroupParticipantUpdate, handleStatus;
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    Browsers,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')
const { startDailyBackup } = require('./commands/backup');

const { getOwnerInbox } = require('./lib/ownerNotify');

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// RAM monitoring/recovery is handled by lib/selfHealer.js.
// Avoid a second hard 400MB exit loop here: it bypasses cleanup,
// can race the self-healer, and causes unnecessary exit-code-1 restarts.

let phoneNumber = settings.ownerNumber || ''
let owner
let reconnectTimer = null
let startPromise = null
let conflictRetryDelay = 30000
let hasConnectedOnce = false
function scheduleReconnect(reason = 'connection closed', delayMs = 5000) {
    if (reconnectTimer) {
        console.log(chalk.yellow('[CONNECTION] Reconnect already scheduled; ignoring duplicate request.'))
        return
    }

    console.log(chalk.yellow('[CONNECTION] ' + reason + '; reconnecting in ' + Math.ceil(delayMs / 1000) + ' seconds.'))
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        startXeonBotInc().catch(error => {
            console.error('[CONNECTION] Reconnect attempt failed:', error?.message || error)
            scheduleReconnect('reconnect attempt failed')
        })
    }, delayMs)

    if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref()
}

function backupLoggedOutSession() {
    const sessionDir = path.resolve('./session')
    if (!fs.existsSync(sessionDir)) return null

    const backupRoot = path.resolve('./.mahiru-session-backups')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(backupRoot, 'session-' + stamp)

    fs.mkdirSync(backupRoot, { recursive: true })
    // Rename is atomic on the same filesystem and preserves the complete auth folder.
    fs.renameSync(sessionDir, backupDir)
    return backupDir
}

global.botname = "Mahiru"
global.themeemoji = "•"
// Pairing-code login: ask for the number in the console.
const pairingCode = process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}


async function createXeonBotInc() {
    let authSessionInvalidated = false;
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        // Never request a second pairing code from an already-linked device session.
        const shouldRequestPairingCode = !state.creds.registered && (pairingCode || !!settings.ownerNumber)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            // Use the supported WEB_BROWSER descriptor; the old Ubuntu tuple can be rejected by WhatsApp.
            browser: Browsers.macOS("Chrome"),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        activeSocket = XeonBotInc

        // Wait for the WhatsApp socket to begin connecting before requesting a pairing code.
        // This listener is attached immediately after socket creation so the event is not missed.
        let resolvePairingReady;
        let rejectPairingReady;
        let pairingReadyTimer;
        const pairingReady = shouldRequestPairingCode ? new Promise((resolve, reject) => {
            resolvePairingReady = resolve;
            rejectPairingReady = reject;
            pairingReadyTimer = setTimeout(() => {
                XeonBotInc.ev.off('connection.update', pairingReadyHandler);
                reject(new Error('Timed out waiting for WhatsApp connection to start.'));
            }, 15000);
        }) : Promise.resolve();
        const pairingReadyHandler = (update) => {
            if (update.connection === 'connecting') {
                clearTimeout(pairingReadyTimer);
                XeonBotInc.ev.off('connection.update', pairingReadyHandler);
                resolvePairingReady?.();
            } else if (update.connection === 'close') {
                clearTimeout(pairingReadyTimer);
                XeonBotInc.ev.off('connection.update', pairingReadyHandler);
                const closeError = update.lastDisconnect?.error;
                const closeStatus = closeError?.output?.statusCode ?? closeError?.data?.statusCode;
                if (Number(closeStatus) === Number(DisconnectReason.loggedOut)) {
                    authSessionInvalidated = true;
                }
                rejectPairingReady?.(closeError || new Error('WhatsApp connection closed before pairing.'));
            }
        };
        if (shouldRequestPairingCode) XeonBotInc.ev.on('connection.update', pairingReadyHandler);

        // Save credentials safely. A logged-out session may be archived while
        // Baileys is emitting a final creds.update event.
        XeonBotInc.ev.on('creds.update', async () => {
            if (authSessionInvalidated) return;
            try {
                await saveCreds();
            } catch (error) {
                if (authSessionInvalidated || error?.code === 'ENOENT') {
                    if (authSessionInvalidated) return;
                }
                console.error('[SESSION] Could not save WhatsApp credentials:', error?.message || error);
            }
        })

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            // In private mode, only block non-group messages (allow groups for moderation)
            // Note: XeonBotInc.public is not synced, so we check mode in main.js instead
            // This check is kept for backward compatibility but mainly blocks DMs
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Block DMs in private mode, but allow group messages
            }
            // BAE5 IDs are passed through so the antibot detector can inspect them.

            // Clear message retry cache to prevent memory bloat
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                await notifyOwnerError([err], 'Message Handler Error');
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,}
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }
        
        if (connection == "open") {
            conflictRetryDelay = 30000
            startDailyBackup(XeonBotInc);
            try {
                require('./lib/selfHealer').initSelfHealer(() => activeSocket);
            } catch (selfHealerStartError) {
                console.error('[MAHIRU SELF-HEALER] Startup failed:', selfHealerStartError?.message || selfHealerStartError);
            }
            try {
                require('./lib/ownerAgent').startOwnerScheduler(XeonBotInc);
                require('./lib/scheduler').startScheduler(XeonBotInc);
                require('./lib/browserAgent').attachWatchdogSock(XeonBotInc);
            } catch (schedulerStartError) {
                console.error('[MAHIRU 1.0.3] Scheduler startup failed:', schedulerStartError?.message || schedulerStartError);
            }
            const connectionLabel = hasConnectedOnce ? 'RECONNECTED' : 'CONNECTED / LOGIN';
            hasConnectedOnce = true;
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            try {
                const loginNumber = String(XeonBotInc.user?.id || '').split(':')[0].split('@')[0] || 'Unknown';
                const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
                const bootNotice = [
                    '╭━━━━━━━━━━━━━━━━━━━╮',
                    '┃  🤖 *MAHIRU SYSTEM*  ┃',
                    '╰━━━━━━━━━━━━━━━━━━━╯',
                    '',
                    `🔔 *নোটিশ:* BOT ${connectionLabel}`,
                    `👑 *Bot Owner:* ${settings.ownerDisplayName || settings.botOwner || 'MSK'}`,
                    `📱 *Login Number:* ${loginNumber}`,
                    `⚙️ *Version:* ${settings.version || 'Unknown'}`,
                    `🧠 *RAM Usage:* ${memoryMb} MB`,
                    `🕒 *সময়:* ${new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}`,
                    '',
                    '✅ *Status:* Online and Ready!',
                    '━━━━━━━━━━━━━━━━━━━'
                ].join('\n');
                const noticeDelivery = await sendToBotInboxAndOwner(XeonBotInc, { text: bootNotice });
                const attempted = noticeDelivery.sent.length + noticeDelivery.failed.length;
                console.log(`[CONNECTION NOTICE] Delivered to ${noticeDelivery.sent.length}/${attempted || 0} inbox(es).`);
                if (noticeDelivery.failed.length) {
                    console.error('[CONNECTION NOTICE] Delivery failures:', JSON.stringify(noticeDelivery.failed));
                }
                if (!noticeDelivery.sent.length) {
                    console.error('[CONNECTION NOTICE] No inbox received the connection notice. Check OWNER_INBOX_NUMBER and WhatsApp logs.');
                }
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'MAHIRU'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} CREDIT: MSK`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} DEVELOPER: MSK`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            console.log(chalk.blue(`Bot Version: ${settings.version}`))
        }
        
        if (connection === 'close') {
            // Ignore close events emitted by sockets that have already been superseded.
            if (activeSocket !== XeonBotInc) {
                console.log(chalk.gray('[CONNECTION] Ignoring close event from an inactive socket.'))
                return
            }
            activeSocket = null

            const disconnectError = lastDisconnect?.error
            const statusCode = disconnectError?.output?.statusCode ?? disconnectError?.data?.statusCode
            const isConflict = Number(statusCode) === 440
            const isLoggedOut = statusCode === DisconnectReason.loggedOut
            const shouldReconnect = !isLoggedOut

            console.log(chalk.red(
                `Connection closed | statusCode=${statusCode ?? 'unknown'} | message=${disconnectError?.message || 'unknown'} | details=${JSON.stringify(disconnectError?.data || disconnectError?.output?.payload || {})} | reconnecting=${shouldReconnect}`
            ))

            // Only archive credentials when WhatsApp explicitly reports logout.
            // A device_removed session is no longer valid, but keeping an archive
            // helps diagnose the issue without leaving invalid credentials active.
            if (isLoggedOut) {
                // Stop any pending credential writes before moving the invalid auth folder.
                authSessionInvalidated = true;
                try {
                    const archivedSession = backupLoggedOutSession()
                    if (archivedSession) {
                        console.log(chalk.yellow('[SESSION] Logged-out session archived at: ' + archivedSession))
                    }
                } catch (error) {
                    console.error('[SESSION] Could not archive logged-out session:', error?.message || error)
                    console.error('[SESSION] The existing session folder was left untouched for manual recovery.')
                    return
                }
                console.log(chalk.red('[SESSION] WhatsApp logged this device out. The old session was archived; pair again on the next start.'))
            }

            if (!isConflict) await notifyOwner(XeonBotInc,
                '⚠️ *MAHIRU BOT DISCONNECTED*\n\n' +
                '📌 কারণ: ' + (disconnectError?.message || 'Unknown') + '\n' +
                '🔢 Status Code: ' + (statusCode ?? 'unknown') + '\n' +
                '🔐 Session: ' + (isLoggedOut ? 'EXPIRED / Logged out — আবার Pair করতে হবে' : 'Session may still be valid') + '\n' +
                '🔄 Reconnect: ' + (shouldReconnect ? 'স্বয়ংক্রিয়ভাবে চেষ্টা করা হবে' : 'স্বয়ংক্রিয় Reconnect হবে না') + '\n' +
                '⏰ সময়: ' + new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })
            ).catch(error => console.error('[OWNER NOTICE] Disconnect notice failed:', error?.message || error));

            if (shouldReconnect) {
                if (isConflict) {
                    const waitMs = conflictRetryDelay
                    conflictRetryDelay = Math.min(conflictRetryDelay * 2, 5 * 60 * 1000)
                    scheduleReconnect('WhatsApp 440 conflict (another connection may be active)', waitMs)
                } else {
                    scheduleReconnect('WhatsApp connection closed', 5000)
                }
            }
        }
    })


    // Handle pairing code
    if (shouldRequestPairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nPress ENTER to use default number ${settings.ownerNumber} : `)))
            if (!phoneNumber || !phoneNumber.trim()) phoneNumber = settings.ownerNumber
        }

        // Clean the phone number - remove any non-digit characters
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.'));
            process.exit(1);
        }

        try {
            await pairingReady;
            // Do not request a code from a socket that has already logged out or closed.
            if (authSessionInvalidated || activeSocket !== XeonBotInc) return null;
            // Allow the WhatsApp WebSocket handshake to settle before requesting the code.
            await delay(3000);
            if (authSessionInvalidated || activeSocket !== XeonBotInc) return null;
            let code = await XeonBotInc.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)));
            console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`));
        } catch (error) {
            console.error('Error requesting pairing code:', error);
            console.log(chalk.red('Failed to get pairing code. Check the connection log above; do not delete the session unless WhatsApp reports that it is logged out.'));
        }
    }

    // Reject incoming calls and notify the caller with a message.
    const antiCallNotified = new Set();

    XeonBotInc.ev.on('call', async (calls) => {
        try {
            // Reference 1.0.3 smart call blocker runs first; legacy anticall remains as fallback.
            const smartCallHandled = await require('./lib/callBlocker').handleIncomingCall(XeonBotInc, calls);
            if (smartCallHandled) return;

            const { readState: readAnticallState } = require('./commands/anticall');
            if (!readAnticallState().enabled) return;

            for (const call of calls) {
                // Only handle incoming call offers; ignore later call-state updates.
                if (call.status !== 'offer') continue;

                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid || !call.id) continue;

                try {
                    // Cut/reject the incoming call first.
                    await XeonBotInc.rejectCall(call.id, callerJid);
                } catch (error) {
                    console.error('[ANTICALL] Could not reject call:', error?.message || error);
                }

                if (antiCallNotified.has(callerJid)) continue;
                antiCallNotified.add(callerJid);
                setTimeout(() => antiCallNotified.delete(callerJid), 60000);

                try {
                    await XeonBotInc.sendMessage(callerJid, {
                        text: '📵 অনুগ্রহ করে WhatsApp-এ কল না করে মেসেজ পাঠান। আমি মেসেজের মাধ্যমে উত্তর দেব।'
                    });
                } catch (error) {
                    console.error('[ANTICALL] Could not send caller message:', error?.message || error);
                    antiCallNotified.delete(callerJid);
                }
            }
        } catch (error) {
            console.error('[ANTICALL] Handler error:', error?.message || error);
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    // Baileys v7 may report a newly joined group through groups.upsert
    // instead of group-participants.update. Route those group snapshots
    // through the same bot-identity check and notification flow.
    XeonBotInc.ev.on('groups.upsert', async (updates) => {
        const groups = Array.isArray(updates) ? updates : (updates ? [updates] : []);
        console.log('[GROUP ACCESS] groups.upsert received:', {
            count: groups.length,
            groupIds: groups.map(group => group?.id).filter(Boolean)
        });

        for (const group of groups) {
            if (!group?.id || !String(group.id).endsWith('@g.us')) continue;
            try {
                await handleGroupParticipantUpdate(XeonBotInc, {
                    id: group.id,
                    participants: Array.isArray(group.participants) ? group.participants : [],
                    action: 'add',
                    author: group.author,
                    subject: group.subject || group.name || '',
                    source: 'groups.upsert'
                });
            } catch (error) {
                console.error('[GROUP ACCESS] groups.upsert handler failed:', {
                    groupId: group.id,
                    error: error?.message || String(error)
                });
            }
        }
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await notifyOwnerError([error], 'Startup / Reconnect Error');
        const errorStatus = error?.output?.statusCode ?? error?.data?.statusCode;
        const isLoggedOutFailure = authSessionInvalidated ||
            Number(errorStatus) === Number(DisconnectReason.loggedOut);
        if (!isLoggedOutFailure) {
            scheduleReconnect('bot startup failed');
        } else {
            console.log(chalk.yellow('[SESSION] Logged-out startup attempt stopped; waiting for a manual fresh pairing.'));
        }
    }
}

// Prevent overlapping startup attempts from creating multiple sockets in one process.
function startXeonBotInc() {
    if (startPromise) {
        console.log(chalk.yellow('[CONNECTION] Startup already in progress; reusing the existing attempt.'))
        return startPromise
    }
    startPromise = createXeonBotInc().finally(() => {
        startPromise = null
    })
    return startPromise
}

// Start the bot with error handling
persistentDataReady.then(() => {
    // Load handlers and data-backed state only after Redis/local restoration.
    ({ handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main'));
    // Clean only dedicated temp folders; session, database and backups are excluded.
    require('./lib/safeAutoCleanup').start();
    store.readFromFile();
    owner = JSON.parse(fs.readFileSync('./data/owner.json'));
    setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000);
    return startXeonBotInc();
}).catch(error => {
    console.error('Fatal startup error:', error);
    process.exit(1);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
    notifyOwnerError([err], 'Uncaught Exception');
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
    notifyOwnerError([err], 'Unhandled Promise Rejection');
})

// Do not hot-require the entrypoint: that creates a second WhatsApp socket
// with the same session and causes repeated 440 "type=replaced" disconnects.