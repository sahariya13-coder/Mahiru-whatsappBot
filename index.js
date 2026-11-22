/**
 * Mahiru Shiina WhatsApp Bot
 * Credits: MSK
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')

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

const settings = require('./settings')
const { getOwnerInbox, notifyOwner } = require('./lib/ownerNotify');

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

let phoneNumber = settings.ownerNumber || ''
let owner
let reconnectTimer = null

function scheduleReconnect(reason = 'connection closed') {
    if (reconnectTimer) {
        console.log(chalk.yellow('[CONNECTION] Reconnect already scheduled; ignoring duplicate request.'))
        return
    }

    console.log(chalk.yellow('[CONNECTION] ' + reason + '; reconnecting in 5 seconds.'))
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        startXeonBotInc().catch(error => {
            console.error('[CONNECTION] Reconnect attempt failed:', error?.message || error)
            scheduleReconnect('reconnect attempt failed')
        })
    }, 5000)

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
const pairingCode = process.argv.includes("--pairing-code") || !!settings.ownerNumber
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


async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
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

        // Wait for the WhatsApp socket to begin connecting before requesting a pairing code.
        // This listener is attached immediately after socket creation so the event is not missed.
        let resolvePairingReady;
        let rejectPairingReady;
        let pairingReadyTimer;
        const pairingReady = pairingCode ? new Promise((resolve, reject) => {
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
                rejectPairingReady?.(update.lastDisconnect?.error || new Error('WhatsApp connection closed before pairing.'));
            }
        };
        if (pairingCode) XeonBotInc.ev.on('connection.update', pairingReadyHandler);

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

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
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Clear message retry cache to prevent memory bloat
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
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
            startDailyBackup(XeonBotInc);
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            try {
                await notifyOwner(XeonBotInc,
                    `🤖 *MAHIRU BOT CONNECTED*\n\n⏰ Time: ${new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}\n✅ Status: Online and Ready!`
                );
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
            const disconnectError = lastDisconnect?.error
            const statusCode = disconnectError?.output?.statusCode ?? disconnectError?.data?.statusCode
            const isLoggedOut = statusCode === DisconnectReason.loggedOut
            const shouldReconnect = !isLoggedOut

            console.log(chalk.red(
                `Connection closed | statusCode=${statusCode ?? 'unknown'} | message=${disconnectError?.message || 'unknown'} | details=${JSON.stringify(disconnectError?.data || disconnectError?.output?.payload || {})} | reconnecting=${shouldReconnect}`
            ))

            // Only archive credentials when WhatsApp explicitly reports logout.
            // A device_removed session is no longer valid, but keeping an archive
            // helps diagnose the issue without leaving invalid credentials active.
            if (isLoggedOut && state.creds.registered) {
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

            await notifyOwner(XeonBotInc,
                '⚠️ *MAHIRU BOT DISCONNECTED*\n\n' +
                '📌 কারণ: ' + (disconnectError?.message || 'Unknown') + '\n' +
                '🔢 Status Code: ' + (statusCode ?? 'unknown') + '\n' +
                '🔄 Reconnect: ' + (shouldReconnect ? 'চেষ্টা করা হবে' : 'Session expired / পুনরায় pair প্রয়োজন') + '\n' +
                '⏰ সময়: ' + new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })
            ).catch(error => console.error('[OWNER NOTICE] Disconnect notice failed:', error?.message || error));

            if (shouldReconnect) {
                scheduleReconnect('WhatsApp connection closed')
            }
        }
    })


    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
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
            // Allow the WhatsApp WebSocket handshake to settle before requesting the code.
            await delay(3000);
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
        scheduleReconnect('bot startup failed')
    }
}


// Start the bot with error handling
persistentDataReady.then(() => {
    // Load handlers and data-backed state only after Redis/local restoration.
    ({ handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main'));
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
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})