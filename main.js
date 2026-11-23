// 🧹 Fix for ENOSPC / temp overflow in hosted panels
const fs = require('fs');
const path = require('path');

// Redirect temp storage away from system /tmp
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;

// Auto-cleaner every 3 hours
setInterval(() => {
    fs.readdir(customTemp, (err, files) => {
        if (err) return;
        for (const file of files) {
            const filePath = path.join(customTemp, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
                    fs.unlink(filePath, () => { });
                }
            });
        }
    });
    console.log('🧹 Temp folder auto-cleaned');
}, 3 * 60 * 60 * 1000);

const settings = require('./settings');
const { notifyOwner, sendToBotInboxAndOwner, getOwnerInbox } = require('./lib/ownerNotify');
const lightweightStore = require('./lib/lightweight_store');
require('./config.js');
const { isBanned } = require('./lib/isBanned');
const yts = require('yt-search');
const { fetchBuffer } = require('./lib/myfunc');
const fetch = require('node-fetch');
const { transcribeAudio } = require('./lib/voice');
const { convertSpokenCommandToBotCommand } = require('./lib/voiceCommandAI');
const ytdl = require('ytdl-core');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { isSudo } = require('./lib/index');
const isOwnerOrSudo = require('./lib/isOwner');
const groupAccess = require('./lib/groupAccess');
const { extractInteractiveCommand } = require('./lib/buttonEngine');
const { setGroupFeature, FEATURES: REMOTE_GROUP_FEATURES } = require('./lib/groupFeatureControl');
const { autotypingCommand, isAutotypingEnabled, handleAutotypingForMessage, handleAutotypingForCommand, showTypingAfterCommand } = require('./commands/autotyping');
const { autoreadCommand, isAutoreadEnabled, handleAutoread } = require('./commands/autoread');

const antibotCommand = require('./commands/antibot');
const gifCommand = require('./commands/gif');
const twitterCommand = require('./commands/twitter');
const savestatusCommand = require('./commands/savestatus');
const autoSaveStatus = savestatusCommand.autoSave;

// Command imports
const tagAllCommand = require('./commands/tagall');
const helpCommand = require('./commands/help');
const banCommand = require('./commands/ban');
const { promoteCommand } = require('./commands/promote');
const { demoteCommand } = require('./commands/demote');
const muteCommand = require('./commands/mute');
const unmuteCommand = require('./commands/unmute');
const stickerCommand = require('./commands/sticker');
const isAdmin = require('./lib/isAdmin');
const warnCommand = require('./commands/warn');
const warningsCommand = require('./commands/warnings');
const ttsCommand = require('./commands/tts');
const { tictactoeCommand, handleTicTacToeMove } = require('./commands/tictactoe');
const { incrementMessageCount, topMembers } = require('./commands/topmembers');
const ownerCommand = require('./commands/owner');
const deleteCommand = require('./commands/delete');
const { handleAntilinkCommand, handleLinkDetection } = require('./commands/antilink');
const { handleAntitagCommand, handleTagDetection } = require('./commands/antitag');
const { Antilink } = require('./lib/antilink');
const { handleMentionDetection, mentionToggleCommand, setMentionCommand } = require('./commands/mention');
const memeCommand = require('./commands/meme');
const tagCommand = require('./commands/tag');
const tagNotAdminCommand = require('./commands/tagnotadmin');
const hideTagCommand = require('./commands/hidetag');
const jokeCommand = require('./commands/joke');
const quoteCommand = require('./commands/quote');
const factCommand = require('./commands/fact');
const weatherCommand = require('./commands/weather');
const newsCommand = require('./commands/news');
const kickCommand = require('./commands/kick');
const simageCommand = require('./commands/simage');
const attpCommand = require('./commands/attp');
const { startHangman, guessLetter } = require('./commands/hangman');
const { startTrivia, answerTrivia } = require('./commands/trivia');
const { complimentCommand } = require('./commands/compliment');
const { insultCommand } = require('./commands/insult');
const { eightBallCommand } = require('./commands/eightball');
const { lyricsCommand } = require('./commands/lyrics');
const { dareCommand } = require('./commands/dare');
const { truthCommand } = require('./commands/truth');
const { clearCommand } = require('./commands/clear');
const pingCommand = require('./commands/ping');
const aliveCommand = require('./commands/alive');
const blurCommand = require('./commands/img-blur');
const { welcomeCommand, handleJoinEvent } = require('./commands/welcome');
const { goodbyeCommand, handleLeaveEvent } = require('./commands/goodbye');
const { handleAntiBadwordCommand, handleBadwordDetection } = require('./lib/antibadword');
const antibadwordCommand = require('./commands/antibadword');
const { handleChatbotCommand, handleChatbotResponse, handleHumanCommand, handleRoleCommand, handleStyleCommand, handleSummaryCommand, handleInboxRuleCommand, handleGuardCommand, handleOwnerRulesCommand } = require('./commands/chatbot');

const takeCommand = require('./commands/take');
const { flirtCommand } = require('./commands/flirt');
const characterCommand = require('./commands/character');
const wastedCommand = require('./commands/wasted');
const shipCommand = require('./commands/ship');
const groupInfoCommand = require('./commands/groupinfo');
const resetlinkCommand = require('./commands/resetlink');
const staffCommand = require('./commands/staff');
const unbanCommand = require('./commands/unban');
const emojimixCommand = require('./commands/emojimix');
const { handlePromotionEvent } = require('./commands/promote');
const { handleDemotionEvent } = require('./commands/demote');
const viewOnceCommand = require('./commands/viewonce');
const vv2Command = require('./commands/vv2');
const clearSessionCommand = require('./commands/clearsession');
const { autoStatusCommand, handleStatusUpdate } = require('./commands/autostatus');
const { simpCommand } = require('./commands/simp');
const { stupidCommand } = require('./commands/stupid');
const stickerTelegramCommand = require('./commands/stickertelegram');
const textmakerCommand = require('./commands/textmaker');
const { handleAntideleteCommand, handleMessageRevocation, storeMessage } = require('./commands/antidelete');
const clearTmpCommand = require('./commands/cleartmp');
const setProfilePicture = require('./commands/setpp');
const { setGroupDescription, setGroupName, setGroupPhoto } = require('./commands/groupmanage');
const instagramCommand = require('./commands/instagram');
const facebookCommand = require('./commands/facebook');
const spotifyCommand = require('./commands/spotify');
const playCommand = require('./commands/play');
const tiktokCommand = require('./commands/tiktok');
const songCommand = require('./commands/song');
const pairCommand = require('./commands/pair');
const aiCommand = require('./commands/ai');
const urlCommand = require('./commands/url');
const { handleTranslateCommand } = require('./commands/translate');
const { handleSsCommand } = require('./commands/ss');
const { addCommandReaction, handleAreactCommand } = require('./lib/reactions');
const { goodnightCommand } = require('./commands/goodnight');
const { shayariCommand } = require('./commands/shayari');
const { rosedayCommand } = require('./commands/roseday');
const imagineCommand = require('./commands/imagine');
const videoCommand = require('./commands/video');
const sudoCommand = require('./commands/sudo');
const { miscCommand, handleHeart } = require('./commands/misc');
const { animeCommand } = require('./commands/anime');
const { piesCommand, piesAlias } = require('./commands/pies');
const stickercropCommand = require('./commands/stickercrop');
const updateCommand = require('./commands/update');
const removebgCommand = require('./commands/removebg');
const { reminiCommand } = require('./commands/remini');
const { igsCommand } = require('./commands/igs');
const { anticallCommand, readState: readAnticallState } = require('./commands/anticall');
const { pmblockerCommand, readState: readPmBlockerState } = require('./commands/pmblocker');
const settingsCommand = require('./commands/settings');
const soraCommand = require('./commands/sora');
const { handleBackupMessage } = require('./commands/backup');
const githubCommand = require('./commands/github');
const { handleOwnerCommand, handleOwnerDotCommand } = require('./lib/ownerAgent');
const scheduler = require('./lib/scheduler');
const { handleCallBlockCommand } = require('./lib/callBlocker');
const { handleSelfHealerCommand } = require('./lib/selfHealer');
const systemControl = require('./lib/systemControl');

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "";
global.ytch = "MSK";

// Channel promotion metadata removed.
const channelInfo = {};

// Bounded in-memory command telemetry for the Owner command report.
const commandUsage = new Map();
const MAX_COMMAND_TELEMETRY = 100;


async function handleMessages(sock, messageUpdate, printLog) {
    let chatId = null;

    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        const message = messages[0];
        if (!message?.message) return;
        // Detect known bot-library message IDs before ordinary command processing.
        if (await antibotCommand.handleAntibotDetection(sock, message)) return;

        await handleAutoread(sock, message);

        if (message.message) {
            await storeMessage(sock, message);
            // Ensure the lightweight WhatsApp store is flushed after message handling.
            lightweightStore.scheduleSave();
        }

        if (message.message?.protocolMessage?.type === 0) {
            await handleMessageRevocation(sock, message);
            return;
        }

        chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const senderIsSudo = await isSudo(senderId);
        const senderIsOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId, message);

        // Handle button responses
        if (message.message?.buttonsResponseMessage) {
            const buttonId = message.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId === 'owner') {
                const ownerCommand = require('./commands/owner');
                await ownerCommand(sock, chatId);
                return;
            }
        }

        // Unwrap ephemeral and view-once messages before reading captions/media.
        let unwrappedMessage = message.message;
        for (let depth = 0; depth < 5; depth++) {
            const nested = unwrappedMessage?.ephemeralMessage?.message ||
                unwrappedMessage?.viewOnceMessage?.message ||
                unwrappedMessage?.viewOnceMessageV2?.message ||
                unwrappedMessage?.viewOnceMessageV2Extension?.message;
            if (!nested) break;
            unwrappedMessage = nested;
        }

        // Decode WhatsApp native-flow quick replies and single-select rows.
        // These arrive as interactiveResponseMessage, not conversation text.
        const interactiveCommand = extractInteractiveCommand(message) ||
            extractInteractiveCommand({ message: unwrappedMessage });

        let rawText = unwrappedMessage?.conversation?.trim() ||
            unwrappedMessage?.extendedTextMessage?.text?.trim() ||
            unwrappedMessage?.imageMessage?.caption?.trim() ||
            unwrappedMessage?.videoMessage?.caption?.trim() ||
            unwrappedMessage?.documentMessage?.caption?.trim() ||
            unwrappedMessage?.buttonsResponseMessage?.selectedButtonId?.trim() ||
            unwrappedMessage?.templateButtonReplyMessage?.selectedId?.trim() ||
            unwrappedMessage?.listResponseMessage?.singleSelectReply?.selectedRowId?.trim() ||
            interactiveCommand ||
            '';

        let userMessage = String(rawText || '').toLowerCase().replace(/\.\s+/g, '.').trim();

        // Owner can activate/deactivate a group by replying to that group's add-notice.
        if (!isGroup && /^(active|activate|deactivate|inactive|অ্যাক্টিভ|ডিঅ্যাক্টিভ)$/i.test(rawText.trim())) {
            const replyContext = unwrappedMessage?.extendedTextMessage?.contextInfo || {};
            const quotedNoticeId = replyContext.stanzaId || '';
            if (quotedNoticeId) {
                const configuredOwner = await isOwnerOrSudo.isConfiguredOwner(senderId, sock, chatId, message);
                const pendingGroupId = groupAccess.getPendingReply(quotedNoticeId);
                if (configuredOwner && pendingGroupId) {
                    const action = /^(deactivate|inactive|ডিঅ্যাক্টিভ)$/i.test(rawText.trim()) ? 'deactivate' : 'activate';
                    groupAccess.setActive(pendingGroupId, action === 'activate');
                    groupAccess.clearPendingReply(quotedNoticeId);
                    await sock.sendMessage(chatId, {
                        text: action === 'activate'
                            ? '✅ *Group Active করা হয়েছে!*\n\n🆔 Group ID: ' + pendingGroupId
                            : '⏸️ *Group Deactivate করা হয়েছে।*\n\n🆔 Group ID: ' + pendingGroupId
                    }, { quoted: message });
                    return;
                }
            }
        }

        // Owner-only backup and restore flow (also intercepts the requested backup document).
        if (await handleBackupMessage(sock, message, chatId, senderId, rawText)) return;

        // Convert incoming WhatsApp voice notes to text before AI processing.
        const incomingAudio = unwrappedMessage?.audioMessage || unwrappedMessage?.pttMessage;
        let inputResponseMode = 'text';
        if (incomingAudio && !message.key?.fromMe) {
            inputResponseMode = 'voice';
            try {
                const transcript = await transcribeAudio(incomingAudio);
                if (!transcript) throw new Error('Empty voice transcription');
                rawText = transcript;
                userMessage = transcript.toLowerCase().replace(/\.\s+/g, '.').trim();
                console.log('🎙️ Voice transcribed:', transcript.slice(0, 160));
                const spokenCommand = await convertSpokenCommandToBotCommand(transcript, {
                    chatId,
                    senderId,
                    isGroup,
                    hasQuotedMessage: Boolean(unwrappedMessage?.extendedTextMessage?.contextInfo?.quotedMessage),
                    hasImage: Boolean(unwrappedMessage?.imageMessage),
                    hasVideo: Boolean(unwrappedMessage?.videoMessage),
                    hasMention: Boolean(unwrappedMessage?.extendedTextMessage?.contextInfo?.mentionedJid?.length)
                });
                if (spokenCommand) {
                    rawText = spokenCommand;
                    userMessage = spokenCommand.toLowerCase();
                    console.log('🎙️ Spoken command recognized:', spokenCommand);
                }
            } catch (voiceError) {
                console.error('Voice transcription failed:', voiceError?.message || voiceError, voiceError?.stack || '');
                await sock.sendMessage(chatId, {
                    text: 'দুঃখিত, Voice Message বুঝতে পারিনি। আবার পাঠাও।'
                }, { quoted: message });
                return;
            }
        }

        if (userMessage.startsWith('.')) {
            console.log(`📝 Command used in ${isGroup ? 'group' : 'private'}: ${userMessage}`);
            const usedCommand = userMessage.split(/\\s+/)[0].slice(1);
            if (usedCommand) {
                commandUsage.set(usedCommand, (commandUsage.get(usedCommand) || 0) + 1);
                if (commandUsage.size > MAX_COMMAND_TELEMETRY) {
                    const leastRecent = commandUsage.keys().next().value;
                    commandUsage.delete(leastRecent);
                }
            }
        }

        let accessData = {};
        try {
            accessData = JSON.parse(fs.readFileSync('./data/messageCount.json'));
        } catch (error) {
            console.error('Error checking access mode:', error);
        }
        const legacyMode = accessData.isPublic === false ? 'private' : 'public';
        const groupMode = accessData.groupMode || legacyMode;
        const inboxMode = accessData.inboxMode || legacyMode;
        const isPublic = (isGroup ? groupMode : inboxMode) === 'public';

        const isOwnerOrSudoCheck = message.key.fromMe || senderIsOwnerOrSudo;

        // Inactive groups stay silent until a command or a direct bot mention is received.
        if (isGroup && !groupAccess.isActive(chatId)) {
            const contextInfo = unwrappedMessage?.extendedTextMessage?.contextInfo ||
                unwrappedMessage?.imageMessage?.contextInfo ||
                unwrappedMessage?.videoMessage?.contextInfo || {};
            const mentionedJids = Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : [];
            const normalizeMentionJid = value => typeof value === 'string'
                ? value.replace(/:\d+@/, '@').trim()
                : '';
            const botMentionIds = [
                sock.user?.id,
                sock.user?.lid,
                sock.decodeJid?.(sock.user?.id),
                sock.decodeJid?.(sock.user?.lid)
            ].map(normalizeMentionJid).filter(Boolean);
            const isBotMentioned = mentionedJids.some(jid => botMentionIds.includes(normalizeMentionJid(jid)));
            const isCommand = /^\./.test(userMessage);

            if (isCommand || isBotMentioned) {
                await sock.sendMessage(chatId, {
                    text: `⏸️ *এই গ্রুপে Mahiru এখনো Active নয়।*\n\nBot Owner-কে নতুন গ্রুপের নোটিশে Reply করে *Active* লিখতে বলুন।\n\n🆔 Group ID: ${chatId}`,
                    linkPreview: null
                }, { quoted: message });
            }
            return;
        }


        if (isBanned(senderId) && !userMessage.startsWith('.unban')) {
            if (Math.random() < 0.1) {
                await sock.sendMessage(chatId, {
                    text: '❌ You are banned from using the bot. Contact an admin to get unbanned.',
                    ...channelInfo
                });
            }
            return;
        }

        // Tic-Tac-Toe moves
        if (/^[1-9]$/.test(userMessage) || userMessage === 'surrender') {
            await handleTicTacToeMove(sock, chatId, senderId, userMessage);
            return;
        }
        if (!message.key.fromMe) incrementMessageCount(chatId, senderId);

        // Moderation checks
        if (isGroup) {
            if (userMessage) {
                await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
            }
            await Antilink(message, sock);
        }

        // PM blocker
        if (!isGroup && !message.key.fromMe && !senderIsSudo) {
            try {
                const pmState = readPmBlockerState();
                if (pmState.enabled) {
                    await sock.sendMessage(chatId, {
                        text: pmState.message || 'Private messages are blocked. Please contact the owner in groups only.'
                    });
                    await new Promise(r => setTimeout(r, 1500));
                    try {
                        await sock.updateBlockStatus(chatId, 'block');
                    } catch (e) { }
                    return;
                }
            } catch (e) { }
        }

        // Handle normal messages
        if (!userMessage.startsWith('.')) {
            await handleAutotypingForMessage(sock, chatId, rawText || userMessage);

            if (isGroup) {
                await handleTagDetection(sock, chatId, message, senderId);
                await handleMentionDetection(sock, chatId, message);
            }

            // Reference v1.0.3 owner-agent bridge: recognize natural-language owner tasks
            // without replacing Mahiru's existing chatbot flow.
            if (!isGroup) {
                try {
                    const configuredOwner = message.key.fromMe ||
                        await isOwnerOrSudo.isConfiguredOwner(senderId, sock, chatId, message);
                    if (configuredOwner) {
                        const ownerResult = await handleOwnerCommand({
                            sock,
                            chatId,
                            senderId,
                            ownerJid: getOwnerInbox(sock) || senderId,
                            text: rawText || userMessage,
                            isOwner: true,
                            isSuperOwner: Boolean(configuredOwner),
                            isVoiceInput: inputResponseMode === 'voice',
                            forceTryAI: false
                        });
                        if (ownerResult?.handled && ownerResult.reply) {
                            await sock.sendMessage(chatId, { text: ownerResult.reply }, { quoted: message });
                            return;
                        }
                    }
                } catch (ownerAgentError) {
                    console.error('[OWNER AGENT] Message handling failed:', ownerAgentError?.message || ownerAgentError);
                }
            }

            // Mahiru AI access control remains the fallback for ordinary conversations.
            if (isPublic || isOwnerOrSudoCheck) {
                await handleChatbotResponse(
                    sock,
                    chatId,
                    message,
                    rawText || userMessage,
                    senderId,
                    inputResponseMode
                );
            }

            return;
        }

        // Private mode access restriction
        const isLocalGroupFeatureCommand = isGroup &&
            /^\.(?:chatbot|gai|iai|antilink|antitag|antibadword|welcome|goodbye)\s+(?:on|off)\s*$/i.test(rawText || '');
        if (!isPublic && !isOwnerOrSudoCheck && !isLocalGroupFeatureCommand) {
            return;
        }

        const adminCommands = ['.mute', '.unmute', '.ban', '.unban', '.promote', '.demote', '.kick', '.tagall', '.tagnotadmin', '.hidetag', '.antilink', '.antitag', '.setgdesc', '.setgname', '.setgpp'];
        const isAdminCommand = adminCommands.some(cmd => userMessage.startsWith(cmd));

        const ownerCommands = ['.voicestudio', '.watch', '.cmd', '.cmdstats', '.clean', '.deepclean', '.block', '.unblock', '.research', '.ownerpref', '.ownerrule', '.syshealth', '.callblock', '.sch', '.schedule', '.mode', '.autostatus', '.antidelete', '.cleartmp', '.setpp', '.clearsession', '.areact', '.autoreact', '.autotyping', '.autoread', '.pmblocker', '.gact', '.gdeact', '.gdelete'];
        const isOwnerCommand = ownerCommands.some(cmd => userMessage.startsWith(cmd));

        let isSenderAdmin = false;
        let isBotAdmin = false;

        if (isGroup && isAdminCommand && !isLocalGroupFeatureCommand) {
            const adminStatus = await isAdmin(sock, chatId, senderId);
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (!isBotAdmin) {
                await sock.sendMessage(chatId, {
                    text: 'Please make the bot an admin to use admin commands.',
                    ...channelInfo
                }, { quoted: message });
                return;
            }

            if (
                userMessage.startsWith('.mute') ||
                userMessage === '.unmute' ||
                userMessage.startsWith('.ban') ||
                userMessage.startsWith('.unban') ||
                userMessage.startsWith('.promote') ||
                userMessage.startsWith('.demote')
            ) {
                if (!isSenderAdmin && !message.key.fromMe) {
                    await sock.sendMessage(chatId, {
                        text: 'Sorry, only group admins can use this command.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
            }
        }

        if (isOwnerCommand) {
            if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                await isOwnerOrSudo.reportUnauthorizedAttempt?.(sock, {
                    senderId,
                    chatId,
                    command: rawText,
                    pushName: message.pushName || '',
                    reason: 'Owner/Sudo only command'
                });
                await sock.sendMessage(chatId, {
                    text: '🔒 এই কমান্ডটি শুধু Bot Owner বা Sudo ব্যবহার করতে পারবেন।'
                }, { quoted: message });
                return;
            }
        }

        if (userMessage.startsWith('.')) {
            const commandName = userMessage.trim().split(/\s+/)[0];
            const blockState = systemControl.isCommandBlocked(commandName, isGroup);
            if (blockState.blocked) {
                await sock.sendMessage(chatId, {
                    text: '⛔ এই কমান্ডটি Owner-এর System Control থেকে সাময়িকভাবে বন্ধ রাখা হয়েছে।'
                }, { quoted: message });
                return;
            }
        }

        let commandExecuted = false;

        switch (true) {
            case userMessage === '.cmdstats' || userMessage === '.topcmd' || userMessage === '.botstats': {
                const top = [...commandUsage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
                const report = top.length
                    ? top.map(([name, count], index) => `${index + 1}. .${name} — ${count}`).join('\\n')
                    : 'এখনো কোনো কমান্ড ব্যবহারের তথ্য নেই।';
                await sock.sendMessage(chatId, {
                    text: `📊 *MAHIRU COMMAND STATS*\\n\\n${report}\\n\\nনোট: বট Restart হলে এই session-এর count reset হবে।`
                }, { quoted: message });
                commandExecuted = true;
                break;
            }
            case userMessage === '.clean' || userMessage.startsWith('.clean ') || userMessage === '.deepclean' || userMessage.startsWith('.deepclean '): {
                const configuredOwner = message.key.fromMe || await isOwnerOrSudo.isConfiguredOwner(senderId, sock, chatId, message);
                if (!configuredOwner) {
                    await sock.sendMessage(chatId, { text: '🔒 এই কমান্ডটি শুধু Bot Owner ব্যবহার করতে পারবেন।' }, { quoted: message });
                    commandExecuted = true;
                    break;
                }
                const parts = rawText.trim().split(/\\s+/);
                const handled = await handleOwnerDotCommand(sock, chatId, message, parts[0].slice(1), parts.slice(1).join(' '));
                if (!handled) await sock.sendMessage(chatId, { text: 'এই cleanup action বর্তমানে উপলব্ধ নয়।' }, { quoted: message });
                commandExecuted = true;
                break;
            }
            case userMessage === '.block' || userMessage.startsWith('.block ') || userMessage === '.unblock' || userMessage.startsWith('.unblock '): {
                const configuredOwner = message.key.fromMe || await isOwnerOrSudo.isConfiguredOwner(senderId, sock, chatId, message);
                if (!configuredOwner) {
                    await sock.sendMessage(chatId, { text: '🔒 এই কমান্ডটি শুধু Bot Owner ব্যবহার করতে পারবেন।' }, { quoted: message });
                    commandExecuted = true;
                    break;
                }
                const action = userMessage.startsWith('.unblock') ? 'unblock' : 'block';
                const context = unwrappedMessage?.extendedTextMessage?.contextInfo || {};
                const mentioned = Array.isArray(context.mentionedJid) ? context.mentionedJid[0] : '';
                const quotedParticipant = context.participant || '';
                const supplied = rawText.trim().split(/\\s+/)[1] || '';
                const target = mentioned || quotedParticipant || (supplied.includes('@') ? supplied : (supplied.replace(/\\D/g, '') ? supplied.replace(/\\D/g, '') + '@s.whatsapp.net' : ''));
                if (!target || target.endsWith('@g.us') || target === sock.user?.id || target === senderId) {
                    await sock.sendMessage(chatId, { text: `ব্যবহার: .${action} <নম্বর/@mention> অথবা মেসেজে reply দিয়ে .${action}` }, { quoted: message });
                } else {
                    await sock.updateBlockStatus(target, action);
                    await sock.sendMessage(chatId, { text: `${action === 'block' ? '🚫 Block' : '✅ Unblock'} সফল হয়েছে।\\nTarget: ${target}` }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage === '.syshealth': {
                const health = systemControl.getSystemHealth();
                const queue = systemControl.getQueueStats();
                await sock.sendMessage(chatId, {
                    text: `🧠 *MAHIRU SYSTEM HEALTH*\n\nRAM: ${health.rssMb} MB\nHeap: ${health.heapMb} MB\nHealth: ${health.status}\nQueue: ${queue.activeWorkers}/${queue.maxWorkers} active\nWaiting: ${queue.waitingGlobal}\nProcessed: ${queue.processed}\nTimed out: ${queue.timedOut}\nDropped: ${queue.dropped}`
                }, { quoted: message });
                commandExecuted = true;
                break;
            }
            case userMessage === '.cmd' || userMessage.startsWith('.cmd '): {
                const args = rawText.trim().split(/\s+/).slice(1);
                const action = (args.shift() || '').toLowerCase();
                const scope = ['all', 'group', 'private'].includes((args[args.length - 1] || '').toLowerCase()) ? args.pop().toLowerCase() : 'all';
                if (action === 'list') {
                    const blocked = Object.entries(systemControl.getDisabledCommands());
                    const output = blocked.length ? blocked.map(([cmd, item]) => `${cmd} — ${item.scope}`).join('\n') : 'কোনো কমান্ড বন্ধ নেই।';
                    await sock.sendMessage(chatId, { text: `📋 *DISABLED COMMANDS*\n\n${output}` }, { quoted: message });
                } else if (['off', 'disable', 'block', 'on', 'enable', 'unblock'].includes(action) && args.length) {
                    const enabling = ['on', 'enable', 'unblock'].includes(action);
                    const updated = systemControl.setCommandsState(args, enabling, scope);
                    await sock.sendMessage(chatId, { text: updated.length ? `✅ ${updated.length}টি কমান্ড ${enabling ? 'চালু' : 'বন্ধ'} করা হয়েছে।\nScope: ${scope}\n${updated.join(', ')}` : '⚠️ কোনো পরিবর্তন হয়নি। Protected command বন্ধ করা যায় না অথবা পরিবর্তন প্রয়োজন নেই।' }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: 'ব্যবহার:\n.cmd off .play [all/group/private]\n.cmd on .play [all/group/private]\n.cmd list' }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage === '.ownerpref' || userMessage.startsWith('.ownerpref '): {
                const raw = rawText.trim().slice('.ownerpref'.length).trim();
                if (!raw) {
                    const prefs = systemControl.getOwnerPrefs();
                    await sock.sendMessage(chatId, { text: `Owner title: ${prefs.ownerTitle}\nInstruction: ${prefs.ownerCustomInstruction || '(নেই)'}\nব্যবহার: .ownerpref <title> | <instruction>` }, { quoted: message });
                } else {
                    const [ownerTitle, ...instructionParts] = raw.split('|');
                    const prefs = systemControl.setOwnerPrefs({ ownerTitle: ownerTitle.trim(), ownerCustomInstruction: instructionParts.join('|').trim() });
                    await sock.sendMessage(chatId, { text: `✅ Owner preference saved.\nTitle: ${prefs.ownerTitle}` }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage === '.ownerrule' || userMessage.startsWith('.ownerrule '): {
                const args = rawText.trim().split(/\s+/);
                const action = (args[1] || 'list').toLowerCase();
                const value = args.slice(2).join(' ');
                if (action === 'add' && value) {
                    const item = systemControl.addOwnerRule(value);
                    await sock.sendMessage(chatId, { text: item ? `✅ Rule added: ${item.id}\n${item.rule}` : '❌ Rule যোগ করা যায়নি।' }, { quoted: message });
                } else if (action === 'del' || action === 'remove') {
                    const removed = systemControl.removeOwnerRule(value);
                    await sock.sendMessage(chatId, { text: removed ? '✅ Rule মুছে ফেলা হয়েছে।' : '❌ Rule পাওয়া যায়নি।' }, { quoted: message });
                } else if (action === 'clear') {
                    systemControl.clearOwnerRules();
                    await sock.sendMessage(chatId, { text: '✅ সব Owner rule মুছে ফেলা হয়েছে।' }, { quoted: message });
                } else {
                    const rules = systemControl.getOwnerRules();
                    await sock.sendMessage(chatId, { text: rules.length ? rules.map((item, i) => `${i + 1}. [${item.id}] ${item.rule}`).join('\n') : 'কোনো Owner rule নেই।\nযোগ: .ownerrule add <rule>' }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage === '.voicestudio' || userMessage.startsWith('.voicestudio '): {
                const args = rawText.trim().split(/\s+/).slice(1);
                const action = (args[0] || 'stats').toLowerCase();
                const voice = require('./lib/neuralVoice');
                if (action === 'provider' && args[1]) {
                    const config = voice.updateVoiceStudioConfig({ providerMode: args[1].toLowerCase() });
                    await sock.sendMessage(chatId, { text: `🎙️ Voice provider: ${config.providerMode}` }, { quoted: message });
                } else if (action === 'mastering' && ['on', 'off'].includes((args[1] || '').toLowerCase())) {
                    const config = voice.updateVoiceStudioConfig({ studioMastering: args[1].toLowerCase() === 'on' });
                    await sock.sendMessage(chatId, { text: `Studio mastering: ${config.studioMastering ? 'ON' : 'OFF'}` }, { quoted: message });
                } else if (action === 'cache' && ['on', 'off'].includes((args[1] || '').toLowerCase())) {
                    const config = voice.updateVoiceStudioConfig({ cacheEnabled: args[1].toLowerCase() === 'on' });
                    await sock.sendMessage(chatId, { text: `Voice cache: ${config.cacheEnabled ? 'ON' : 'OFF'}` }, { quoted: message });
                } else if (action === 'clearcache') {
                    const removed = voice.clearVoiceCache();
                    await sock.sendMessage(chatId, { text: `✅ Voice cache cleared. Files removed: ${removed ?? 'done'}` }, { quoted: message });
                } else {
                    const stats = voice.getVoiceStudioStats();
                    await sock.sendMessage(chatId, {
                        text: `🎙️ *MAHIRU NEURAL VOICE STUDIO*\nProvider: ${stats.config.providerMode}\nMastering: ${stats.config.studioMastering ? 'ON' : 'OFF'}\nCache: ${stats.config.cacheEnabled ? 'ON' : 'OFF'}\nElevenLabs: ${stats.clonedReady ? 'Ready' : 'Not configured'}\nEdge TTS: ${stats.edgeReady ? 'Ready' : 'Unavailable'}\nBackup TTS: ${stats.backupReady ? 'Ready' : 'Unavailable'}\nCached files: ${stats.cachedFiles}\nQueue: ${stats.ffmpegQueueDepth}\n\n.voicestudio provider auto|cloned|gemini|edge|backup|gtts\n.voicestudio mastering on|off\n.voicestudio cache on|off\n.voicestudio clearcache`
                    }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage === '.research' || userMessage.startsWith('.research '): {
                const query = rawText.trim().slice('.research'.length).trim();
                await handleChatbotCommand(sock, chatId, message, ('research ' + query).trim());
                commandExecuted = true;
                break;
            }
            case userMessage === '.watch' || userMessage.startsWith('.watch '): {
                const args = rawText.trim().split(/\s+/);
                const action = (args[1] || 'list').toLowerCase();
                const browserAgent = require('./lib/browserAgent');
                if (action === 'add' && args[2]) {
                    const result = await browserAgent.addWatchUrl(args[2], args.slice(3).join(' '));
                    await sock.sendMessage(chatId, { text: result.ok ? `✅ Website watch চালু হয়েছে।\nID: ${result.item.id}\n${result.item.url}` : result.error }, { quoted: message });
                } else if (action === 'del' || action === 'remove') {
                    const removed = browserAgent.removeWatchUrl(args[2] || '');
                    await sock.sendMessage(chatId, { text: removed ? '✅ Watch list থেকে সরানো হয়েছে।' : '❌ ID/URL পাওয়া যায়নি।' }, { quoted: message });
                } else {
                    const items = browserAgent.listWatchUrls();
                    await sock.sendMessage(chatId, { text: items.length ? items.map((item, i) => `${i + 1}. [${item.id}] ${item.label}\n${item.url}`).join('\n\n') : 'কোনো Website watch করা হচ্ছে না।\nযোগ: .watch add <URL> [নাম]' }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage === '.memory' || userMessage.startsWith('.memory '): {
                const args = rawText.trim().split(/\s+/);
                const action = (args[1] || 'stats').toLowerCase();
                const vectorGraph = require('./lib/vectorGraph');
                const memoryKey = `${chatId}:${senderId}`;
                if (action === 'search' && args.length > 2) {
                    const hits = await vectorGraph.searchGraph(memoryKey, args.slice(2).join(' '), 5);
                    await sock.sendMessage(chatId, { text: hits.length ? hits.map((hit, i) => `${i + 1}. ${hit.text}\nScore: ${hit.score}`).join('\n\n') : 'এই চ্যাটে মিলে এমন কোনো স্মৃতি পাওয়া যায়নি।' }, { quoted: message });
                } else if (action === 'clear') {
                    if (isGroup && !senderIsOwnerOrSudoCheck) {
                        await sock.sendMessage(chatId, { text: 'গ্রুপের shared memory মুছতে Owner/Sudo permission লাগবে।' }, { quoted: message });
                    } else {
                        vectorGraph.clearUserGraph(memoryKey);
                        await sock.sendMessage(chatId, { text: '✅ এই চ্যাটের Mahiru memory clear করা হয়েছে।' }, { quoted: message });
                    }
                } else {
                    const stats = vectorGraph.getGraphStats(memoryKey);
                    await sock.sendMessage(chatId, { text: `🧠 *MAHIRU MEMORY*\nMemories: ${stats.currentUserMemories}\nEntities: ${Object.keys(stats.currentUserEntities || {}).length}\nTotal recalls: ${stats.totalRecalls}\nVectorized: ${stats.vectorizedCount}\nCloud sync: ${stats.cloudEnabled ? 'Enabled' : 'Disabled'}\n\n.memory search <text>\n.memory clear` }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case /^(?:\.heal|\.health|\.doc|\.doctor|\.ram|\.bk|\.backup)\b/i.test(rawText.trim()):
                await handleSelfHealerCommand(sock, chatId, message, rawText.trim().split(/\s+/).slice(1).join(' '));
                commandExecuted = true;
                break;
            case userMessage.startsWith('.callblock'):
                await handleCallBlockCommand(sock, chatId, message, rawText.trim().split(/\s+/).slice(1).join(' '));
                commandExecuted = true;
                break;
            case userMessage.startsWith('.sch') || userMessage.startsWith('.schedule'):
                await scheduler.handleScheduleCommand(sock, chatId, message, rawText.trim().split(/\s+/).slice(1).join(' '));
                commandExecuted = true;
                break;
            case userMessage === '.github' || userMessage === '.git':
                await githubCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            // Group-local feature switches: .chatbot off, .antilink on, etc.
            case isGroup && /^\.(?:chatbot|gai|iai|antilink|antitag|antibadword|welcome|goodbye)\s+(?:on|off)\s*$/i.test(rawText || ''): {
                const parts = String(rawText || '').trim().split(/\s+/);
                const featureName = parts[0].slice(1).toLowerCase();
                const action = (parts[1] || '').toLowerCase();

                let allowed = Boolean(message.key.fromMe || senderIsOwnerOrSudo);
                if (!allowed) {
                    try {
                        const adminStatus = await isAdmin(sock, chatId, senderId);
                        allowed = Boolean(adminStatus.isSenderAdmin);
                    } catch (adminError) {
                        console.error('[GROUP FEATURE] Admin check failed:', adminError.message);
                    }
                }

                if (!allowed) {
                    await sock.sendMessage(chatId, {
                        text: '❌ এই সেটিং ON/OFF করতে শুধু গ্রুপ Admin বা Bot Owner পারবে।'
                    }, { quoted: message });
                    commandExecuted = true;
                    break;
                }

                try {
                    const result = setGroupFeature(chatId, featureName, action === 'on');
                    if (!result.ok) throw new Error('এই Feature সমর্থিত নয়।');
                    const labels = {
                        chatbot: 'Chatbot',
                        gai: 'Chatbot',
                        iai: 'Chatbot',
                        antilink: 'AntiLink',
                        antitag: 'AntiTag',
                        antibadword: 'AntiBadword',
                        welcome: 'Welcome',
                        goodbye: 'Goodbye'
                    };
                    await sock.sendMessage(chatId, {
                        text: '✅ *' + (labels[featureName] || featureName) + ' ' + action.toUpperCase() + ' করা হয়েছে।*\n📛 Group: ' + chatId
                    }, { quoted: message });
                } catch (featureError) {
                    console.error('[GROUP FEATURE] Update failed:', featureError);
                    await sock.sendMessage(chatId, {
                        text: '❌ সেটিং পরিবর্তন করা যায়নি: ' + featureError.message
                    }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case !isGroup && /^\.(?:chatbot|gai|iai|antilink|antitag|antibadword|welcome|goodbye|gset)\s+/i.test(rawText || ''): {
                const configuredOwner = message.key.fromMe ||
                    await isOwnerOrSudo.isConfiguredOwner(senderId, sock, chatId, message);
                if (!configuredOwner) {
                    await sock.sendMessage(chatId, { text: '❌ শুধু Bot Owner Inbox থেকে অন্য গ্রুপের সেটিংস পরিবর্তন করতে পারবেন।' }, { quoted: message });
                    break;
                }

                const parts = String(rawText || '').trim().split(/\s+/);
                let featureName = parts[0].slice(1).toLowerCase();
                let targetId = '';
                let action = '';

                if (featureName === 'gset') {
                    targetId = parts[1] || '';
                    featureName = parts[2] || '';
                    action = (parts[3] || '').toLowerCase();
                } else {
                    targetId = parts[1] || '';
                    action = (parts[2] || '').toLowerCase();
                }

                if (!targetId.endsWith('@g.us') || !['on', 'off'].includes(action) || !REMOTE_GROUP_FEATURES[featureName]) {
                    await sock.sendMessage(chatId, {
                        text: 'ব্যবহার:\n.chatbot <Group ID> on/off\n.antilink <Group ID> on/off\n.antitag <Group ID> on/off\n.antibadword <Group ID> on/off\n.welcome <Group ID> on/off\n.goodbye <Group ID> on/off\n\nঅথবা: .gset <Group ID> <feature> <on/off>'
                    }, { quoted: message });
                    break;
                }

                try {
                    const result = setGroupFeature(targetId, featureName, action === 'on');
                    if (!result.ok) {
                        await sock.sendMessage(chatId, { text: '❌ এই Feature remote ON/OFF সমর্থন করে না।' }, { quoted: message });
                        break;
                    }
                    const featureLabels = {
                        chatbot: 'Chatbot',
                        gai: 'Chatbot',
                        iai: 'Chatbot',
                        antilink: 'AntiLink',
                        antitag: 'AntiTag',
                        antibadword: 'AntiBadword',
                        welcome: 'Welcome',
                        goodbye: 'Goodbye'
                    };
                    await sock.sendMessage(chatId, {
                        text: `✅ *Remote Group Setting Updated*\n\n📛 Feature: ${featureLabels[featureName] || featureName}\n🆔 Group ID: ${targetId}\n📌 Status: ${action.toUpperCase()}`
                    }, { quoted: message });
                } catch (error) {
                    console.error('[REMOTE GROUP SETTING] Update failed:', error);
                    await sock.sendMessage(chatId, { text: '❌ সেটিংস পরিবর্তন করা যায়নি: ' + error.message }, { quoted: message });
                }
                break;
            }
            case userMessage === '.human' || userMessage.startsWith('.human '): {
                const humanAction = rawText.trim().split(' ').slice(1).join(' ');
                await handleHumanCommand(
                    sock,
                    chatId,
                    message,
                    humanAction,
                    Boolean(message.key.fromMe || senderIsOwnerOrSudo)
                );
                commandExecuted = true;
                break;
            }

            case userMessage === '.gid': {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'এই কমান্ডটি গ্রুপে ব্যবহার করুন।' }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: `Group ID: ${chatId}\nStatus: ${groupAccess.isActive(chatId) ? 'Active' : 'Not Active'}\nOwner: ${settings.ownerUsername ? 'https://wa.me//' + settings.ownerUsername.replace(/^@/, '') : (settings.botOwner || 'Bot Owner')}` }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }

            case userMessage.startsWith('.gact') || userMessage.startsWith('.gdeact') || userMessage.startsWith('.gdelete'): {
                const configuredOwner = message.key.fromMe ||
                    await isOwnerOrSudo.isConfiguredOwner(senderId, sock, chatId, message);
                if (!configuredOwner) {
                    await sock.sendMessage(chatId, { text: '❌ শুধু Bot Owner এই কমান্ড ব্যবহার করতে পারবেন।' }, { quoted: message });
                    break;
                }
                const parts = rawText.trim().split(/\s+/);
                const targetId = parts[1] || (isGroup ? chatId : '');
                if (!targetId || !targetId.endsWith('@g.us')) {
                    await sock.sendMessage(chatId, { text: 'ব্যবহার: .gact <Group ID> / .gdeact <Group ID> / .gdelete <Group ID>' }, { quoted: message });
                    break;
                }

                if (userMessage.startsWith('.gdelete')) {
                    groupAccess.setActive(targetId, false);
                    try {
                        await sock.sendMessage(chatId, { text: `🗑️ Group থেকে Mahiru-কে Leave করানো হচ্ছে।\nGroup ID: ${targetId}` }, { quoted: message });
                        await sock.groupLeave(targetId);
                    } catch (leaveError) {
                        console.error('[GROUP ACCESS] Could not leave group:', targetId, leaveError?.message || leaveError);
                        await sock.sendMessage(chatId, { text: `❌ গ্রুপ থেকে Leave করা যায়নি। বটের group connection পরীক্ষা করুন।\n${targetId}` });
                    }
                    break;
                }

                const activate = userMessage.startsWith('.gact');
                groupAccess.setActive(targetId, activate);
                await sock.sendMessage(chatId, { text: activate ? `✅ Group Active করা হয়েছে।\n${targetId}` : `⏸️ Group Deactivate করা হয়েছে।\n${targetId}` }, { quoted: message });
                break;
            }

            case userMessage === '.simage': {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMessage?.stickerMessage) {
                    await simageCommand(sock, quotedMessage, chatId);
                } else {
                    await sock.sendMessage(chatId, {
                        text: 'Please reply to a sticker with the .simage command to convert it.',
                        ...channelInfo
                    }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }

            case userMessage.startsWith('.kick'): {
                const mentionedJidListKick = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await kickCommand(sock, chatId, senderId, mentionedJidListKick, message);
                break;
            }

            case userMessage.startsWith('.mute'): {
                const parts = userMessage.trim().split(/\s+/);
                const muteArg = parts[1];
                const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;

                if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
                    await sock.sendMessage(chatId, {
                        text: 'Please provide a valid number of minutes or use .mute with no number to mute immediately.',
                        ...channelInfo
                    }, { quoted: message });
                } else {
                    await muteCommand(sock, chatId, senderId, message, muteDuration);
                }
                break;
            }

            case userMessage === '.unmute':
                await unmuteCommand(sock, chatId, senderId);
                break;

            case userMessage.startsWith('.ban'):
                if (!isGroup && !message.key.fromMe && !senderIsSudo) {
                    await sock.sendMessage(chatId, {
                        text: 'Only owner/sudo can use .ban in private chat.'
                    }, { quoted: message });
                    break;
                }
                await banCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.unban'):
                if (!isGroup && !message.key.fromMe && !senderIsSudo) {
                    await sock.sendMessage(chatId, {
                        text: 'Only owner/sudo can use .unban in private chat.'
                    }, { quoted: message });
                    break;
                }
                await unbanCommand(sock, chatId, message);
                break;

            case userMessage === '.help' || userMessage === '.menu' || userMessage.startsWith('.menu ') || userMessage === '.bot' || userMessage === '.list':
                await helpCommand(sock, chatId, message, global.channelLink);
                commandExecuted = true;
                break;

            case userMessage === '.sticker' || userMessage === '.s' || userMessage === '.sticker-alt':
                await stickerCommand(sock, chatId, message);
                commandExecuted = true;
                break;

            case userMessage.startsWith('.warnings'): {
                const mentionedJidListWarnings = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warningsCommand(sock, chatId, mentionedJidListWarnings, message);
                break;
            }

            case userMessage.startsWith('.warn'): {
                const mentionedJidListWarn = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
                break;
            }

            case userMessage.startsWith('.tts'): {
                const text = rawText.slice(4).trim();
                await ttsCommand(sock, chatId, text, message);
                break;
            }

            case userMessage.startsWith('.delete') || userMessage.startsWith('.del'):
                await deleteCommand(sock, chatId, message, senderId);
                break;

            case userMessage.startsWith('.attp'):
                await attpCommand(sock, chatId, message);
                break;

            case userMessage === '.settings':
                await settingsCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.mode'): {
                if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, {
                        text: 'শুধু Bot Owner/Sudo এই কমান্ড ব্যবহার করতে পারবে।',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                let data = {};
                try {
                    data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
                } catch (error) {
                    console.error('Error reading access mode:', error);
                }
                const args = userMessage.trim().split(/\s+/);
                const target = args[1]?.toLowerCase();
                const action = args[2]?.toLowerCase();
                const fallback = data.isPublic === false ? 'private' : 'public';
                data.groupMode = data.groupMode || fallback;
                data.inboxMode = data.inboxMode || fallback;
                if (!target) {
                    await sock.sendMessage(chatId, {
                        text: '*MAHIRU ACCESS MODES*\n\n' +
                            'Group: *' + data.groupMode + '*\nInbox: *' + data.inboxMode + '*\n\n' +
                            '.mode group public/private — Group mode\n' +
                            '.mode inbox public/private — Inbox mode\n' +
                            '.mode public/private — দুটো একসাথে',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                if (target === 'public' || target === 'private') {
                    data.isPublic = target === 'public';
                    data.groupMode = target;
                    data.inboxMode = target;
                } else if ((target === 'group' || target === 'inbox') &&
                    (action === 'public' || action === 'private')) {
                    data[target === 'group' ? 'groupMode' : 'inboxMode'] = action;
                } else {
                    await sock.sendMessage(chatId, {
                        text: 'ব্যবহার:\n.mode group public/private\n.mode inbox public/private\n.mode public/private',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                try {
                    const modeFile = './data/messageCount.json';
                    const modeTempFile = modeFile + '.tmp-' + process.pid;
                    fs.mkdirSync('./data', { recursive: true });
                    fs.writeFileSync(modeTempFile, JSON.stringify(data, null, 2), 'utf8');
                    fs.renameSync(modeTempFile, modeFile);
                    const changedMode = (target === 'group' || target === 'inbox') ? action : target;
                    const label = target === 'group' ? 'Group' : target === 'inbox' ? 'Inbox' : 'Group ও Inbox';
                    await sock.sendMessage(chatId, {
                        text: '✅ ' + label + ' mode এখন *' + changedMode + '* করা হয়েছে।',
                        ...channelInfo
                    }, { quoted: message });
                } catch (error) {
                    console.error('Error updating access mode:', error);
                    await sock.sendMessage(chatId, {
                        text: 'Mode update করা যায়নি।',
                        ...channelInfo
                    });
                }
                break;
            }
            case userMessage.startsWith('.anticall'):
                if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, { text: 'Only owner/sudo can use anticall.' }, { quoted: message });
                    break;
                }
                {
                    const args = userMessage.split(' ').slice(1).join(' ');
                    await anticallCommand(sock, chatId, message, args);
                }
                break;

            case userMessage.startsWith('.pmblocker'): {
                const args = userMessage.split(' ').slice(1).join(' ');
                await pmblockerCommand(sock, chatId, message, args);
                commandExecuted = true;
                break;
            }

            case userMessage === '.owner':
                await ownerCommand(sock, chatId);
                break;

            case userMessage === '.tagall':
                await tagAllCommand(sock, chatId, senderId, message);
                break;

            case userMessage === '.tagnotadmin':
                await tagNotAdminCommand(sock, chatId, senderId, message);
                break;

            case userMessage.startsWith('.hidetag'): {
                const messageText = rawText.slice(8).trim();
                const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                await hideTagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                break;
            }

            case userMessage.startsWith('.tag'): {
                const messageText = rawText.slice(4).trim();
                const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                await tagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                break;
            }

            case userMessage.startsWith('.antilink'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Please make the bot an admin first.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                break;

            case userMessage.startsWith('.antitag'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Please make the bot an admin first.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                break;

            case userMessage.startsWith('.antibot'):
                await antibotCommand(sock, chatId, message, senderId);
                break;

            case userMessage.startsWith('.gif'):
                await gifCommand(sock, chatId, rawText.trim().split(/\\s+/).slice(1).join(' '));
                break;

            case userMessage.startsWith('.twitter') || userMessage.startsWith('.x '):
                await twitterCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.savestatus'):
                await savestatusCommand(sock, chatId, message, senderId);
                break;

            case userMessage === '.meme':
                await memeCommand(sock, chatId, message);
                break;

            case userMessage === '.joke':
                await jokeCommand(sock, chatId, message);
                break;

            case userMessage === '.quote':
                await quoteCommand(sock, chatId, message);
                break;

            case userMessage === '.fact':
                await factCommand(sock, chatId, message, message);
                break;

            case userMessage.startsWith('.weather'): {
                const city = rawText.slice(8).trim();
                if (city) {
                    await weatherCommand(sock, chatId, message, city);
                } else {
                    await sock.sendMessage(chatId, {
                        text: 'Please specify a city, e.g., .weather London',
                        ...channelInfo
                    }, { quoted: message });
                }
                break;
            }

            case userMessage === '.news':
                await newsCommand(sock, chatId);
                break;

            case userMessage.startsWith('.ttt') || userMessage.startsWith('.tictactoe'): {
                const tttText = userMessage.split(' ').slice(1).join(' ');
                await tictactoeCommand(sock, chatId, senderId, tttText);
                break;
            }

            case userMessage.startsWith('.move'): {
                const position = parseInt(userMessage.split(' ')[1], 10);
                if (isNaN(position)) {
                    await sock.sendMessage(chatId, {
                        text: 'Please provide a valid position number for Tic-Tac-Toe move.',
                        ...channelInfo
                    }, { quoted: message });
                } else {
                    await handleTicTacToeMove(sock, chatId, senderId, String(position));
                }
                break;
            }

            case userMessage === '.topmembers':
                topMembers(sock, chatId, isGroup);
                break;

            case userMessage.startsWith('.hangman'):
                startHangman(sock, chatId);
                break;

            case userMessage.startsWith('.guess'): {
                const guessedLetter = userMessage.split(' ')[1];
                if (guessedLetter) {
                    guessLetter(sock, chatId, guessedLetter);
                } else {
                    sock.sendMessage(chatId, {
                        text: 'Please guess a letter using .guess <letter>',
                        ...channelInfo
                    }, { quoted: message });
                }
                break;
            }

            case userMessage.startsWith('.trivia'):
                startTrivia(sock, chatId);
                break;

            case userMessage.startsWith('.answer'): {
                const answer = userMessage.split(' ').slice(1).join(' ');
                if (answer) {
                    answerTrivia(sock, chatId, answer);
                } else {
                    sock.sendMessage(chatId, {
                        text: 'Please provide an answer using .answer <answer>',
                        ...channelInfo
                    }, { quoted: message });
                }
                break;
            }

            case userMessage.startsWith('.compliment'):
                await complimentCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.insult'):
                await insultCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.8ball'): {
                const question = userMessage.split(' ').slice(1).join(' ');
                await eightBallCommand(sock, chatId, question);
                break;
            }

            case userMessage.startsWith('.lyrics'): {
                const songTitle = userMessage.split(' ').slice(1).join(' ');
                await lyricsCommand(sock, chatId, songTitle, message);
                break;
            }
            case userMessage.startsWith('.simp'): {
                const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await simpCommand(sock, chatId, quotedMsg, mentionedJid, senderId);
                break;
            }

            case userMessage.startsWith('.stupid') || userMessage.startsWith('.itssostupid') || userMessage.startsWith('.iss'): {
                const stupidQuotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const stupidMentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const stupidArgs = userMessage.split(' ').slice(1);
                await stupidCommand(sock, chatId, stupidQuotedMsg, stupidMentionedJid, senderId, stupidArgs);                break;
            }

            case userMessage === '.dare':
                await dareCommand(sock, chatId, message);
                break;

            case userMessage === '.truth':
                await truthCommand(sock, chatId, message);
                break;

            case userMessage === '.clear':
                if (isGroup) await clearCommand(sock, chatId);
                break;

            case userMessage.startsWith('.promote'): {
                const mentionedJidListPromote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await promoteCommand(sock, chatId, mentionedJidListPromote, message);
                break;
            }

            case userMessage.startsWith('.demote'): {
                const mentionedJidListDemote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await demoteCommand(sock, chatId, mentionedJidListDemote, message);
                break;
            }

            case userMessage === '.ping':
                await pingCommand(sock, chatId, message);
                break;

            case userMessage === '.alive':
                await aliveCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.mention '): {
                const args = userMessage.split(' ').slice(1).join(' ');
                const isOwner = message.key.fromMe || senderIsSudo;
                await mentionToggleCommand(sock, chatId, message, args, isOwner);
                break;
            }

            case userMessage === '.setmention': {
                const isOwner = message.key.fromMe || senderIsSudo;
                await setMentionCommand(sock, chatId, message, isOwner);
                break;
            }

            case userMessage.startsWith('.blur'): {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                await blurCommand(sock, chatId, message, quotedMessage);
                break;
            }

            // Welcome command (scoped)
            case userMessage.startsWith('.welcome'): {
                if (isGroup) {
                    if (!isSenderAdmin) {
                        const welcomeAdminStatus = await isAdmin(sock, chatId, senderId);
                        isSenderAdmin = welcomeAdminStatus.isSenderAdmin;
                    }

                    if (isSenderAdmin || message.key.fromMe) {
                        await welcomeCommand(sock, chatId, message);
                    } else {
                        await sock.sendMessage(chatId, {
                            text: 'Sorry, only group admins can use this command.',
                            ...channelInfo
                        }, { quoted: message });
                    }
                } else {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                        ...channelInfo
                    }, { quoted: message });
                }
                break;
            }

            // Goodbye command (scoped)
            case userMessage.startsWith('.goodbye'): {
                if (isGroup) {
                    if (!isSenderAdmin) {
                        const goodbyeAdminStatus = await isAdmin(sock, chatId, senderId);
                        isSenderAdmin = goodbyeAdminStatus.isSenderAdmin;
                    }

                    if (isSenderAdmin || message.key.fromMe) {
                        await goodbyeCommand(sock, chatId, message);
                    } else {
                        await sock.sendMessage(chatId, {
                            text: 'Sorry, only group admins can use this command.',
                            ...channelInfo
                        }, { quoted: message });
                    }
                } else {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                        ...channelInfo
                    }, { quoted: message });
                }
                break;
            }

            case userMessage.startsWith('.antibadword'): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }

                const adminStatus = await isAdmin(sock, chatId, senderId);
                isSenderAdmin = adminStatus.isSenderAdmin;
                isBotAdmin = adminStatus.isBotAdmin;

                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: '*Bot must be admin to use this feature*',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }

                await antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin);
                break;
            }

            case userMessage === '.rule' || userMessage.startsWith('.rule ') ||
                 userMessage === '.rules' || userMessage.startsWith('.rules '): {
                const ruleArgs = rawText.replace(/^\.rules?\s*/i, '').trim();
                await handleInboxRuleCommand(sock, chatId, message, ruleArgs);
                break;
            }

            case userMessage.startsWith('.chatbot') || userMessage.startsWith('.gai') || userMessage.startsWith('.iai'): {
                if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, {
                        text: '❌ Mahiru AI-এর Inbox/Group সেটিংস শুধু Bot Owner/Sudo পরিবর্তন করতে পারবে।',
                        ...channelInfo
                    }, { quoted: message });
                    break;
                }

                const prefix = userMessage.startsWith('.gai') ? '.gai' : (userMessage.startsWith('.iai') ? '.iai' : '.chatbot');
                const match = rawText.slice(prefix.length).trim();
                if ((prefix === '.gai' && !isGroup) || (prefix === '.iai' && isGroup)) {
                    await sock.sendMessage(chatId, { text: prefix === '.gai' ? 'এই কমান্ডটি শুধু Group-এ ব্যবহার করুন।' : 'এই কমান্ডটি শুধু Inbox-এ ব্যবহার করুন।' }, { quoted: message });
                } else {
                    await handleChatbotCommand(sock, chatId, message, match);
                }
                break;
            }

            case userMessage === '.role' || userMessage.startsWith('.role '): {
                await handleRoleCommand(sock, chatId, message, rawText.slice(5).trim());
                break;
            }

            case userMessage === '.style' || userMessage.startsWith('.style '): {
                await handleStyleCommand(sock, chatId, message, rawText.slice(6).trim());
                break;
            }

            case userMessage === '.sm' || userMessage === '.summary' || userMessage.startsWith('.summary '): {
                await handleSummaryCommand(sock, chatId, message, rawText.replace(/^\.(?:sm|summary)\s*/i, ''));
                break;
            }

            case userMessage === '.guard' || userMessage.startsWith('.guard ') ||
                 userMessage === '.antiabuse' || userMessage.startsWith('.antiabuse '): {
                await handleGuardCommand(sock, chatId, message, rawText.replace(/^\.(?:guard|antiabuse)\s*/i, ''));
                break;
            }

            case userMessage === '.orule' || userMessage.startsWith('.orule '): {
                await handleOwnerRulesCommand(sock, chatId, message, rawText.slice(6).trim());
                break;
            }

            case userMessage === '.lang' || userMessage.startsWith('.lang '): {
                await handleChatbotCommand(sock, chatId, message, ('lang ' + rawText.slice(5).trim()).trim());
                break;
            }

            case userMessage === '.resetapi' || userMessage.startsWith('.resetapi '): {
                await handleChatbotCommand(sock, chatId, message, 'resetapi');
                break;
            }

            case userMessage === '.voice' || userMessage.startsWith('.voice ') ||
                 userMessage === '.v' || userMessage.startsWith('.v '): {
                const voiceArgs = rawText.replace(/^\.(?:voice|v)\s*/i, '');
                await handleChatbotCommand(sock, chatId, message, ('voice ' + voiceArgs).trim());
                break;
            }

            case userMessage === '.vv2': {
                await vv2Command(sock, chatId, message, senderId);
                commandExecuted = true;
                break;
            }

            case userMessage.startsWith('.take') || userMessage.startsWith('.steal'): {
                const isSteal = userMessage.startsWith('.steal');
                const sliceLen = isSteal ? 6 : 5;
                const takeArgs = rawText.slice(sliceLen).trim().split(' ');
                await takeCommand(sock, chatId, message, takeArgs);
                break;
            }

            case userMessage === '.flirt':
                await flirtCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.character'):
                await characterCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.waste'):
                await wastedCommand(sock, chatId, message);
                break;

            case userMessage === '.ship':
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups!',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await shipCommand(sock, chatId, message);
                break;

            case userMessage === '.groupinfo' || userMessage === '.infogp' || userMessage === '.infogrupo':
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups!',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await groupInfoCommand(sock, chatId, message);
                break;

            case userMessage === '.resetlink' || userMessage === '.revoke' || userMessage === '.anularlink':
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups!',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await resetlinkCommand(sock, chatId, senderId);
                break;

            case userMessage === '.staff' || userMessage === '.admins' || userMessage === '.listadmin':
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups!',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await staffCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.tourl') || userMessage.startsWith('.url'):
                await urlCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.emojimix') || userMessage.startsWith('.emix'):
                await emojimixCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.tg') || userMessage.startsWith('.stickertelegram') || userMessage.startsWith('.tgsticker') || userMessage.startsWith('.telesticker'):
                await stickerTelegramCommand(sock, chatId, message);
                break;

            case userMessage === '.vv':
                await viewOnceCommand(sock, chatId, message);
                break;

            case userMessage === '.clearsession' || userMessage === '.clearsesi':
                await clearSessionCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.autostatus'): {                const autoStatusArgs = userMessage.split(' ').slice(1);
                await autoStatusCommand(sock, chatId, message, autoStatusArgs);
                break;
            }

            case userMessage.startsWith('.metallic'):
                await textmakerCommand(sock, chatId, message, userMessage, 'metallic');
                break;

            case userMessage.startsWith('.ice'):
                await textmakerCommand(sock, chatId, message, userMessage, 'ice');
                break;

            case userMessage.startsWith('.snow'):
                await textmakerCommand(sock, chatId, message, userMessage, 'snow');
                break;

            case userMessage.startsWith('.impressive'):
                await textmakerCommand(sock, chatId, message, userMessage, 'impressive');
                break;

            case userMessage.startsWith('.matrix'):
                await textmakerCommand(sock, chatId, message, userMessage, 'matrix');
                break;

            case userMessage.startsWith('.light'):
                await textmakerCommand(sock, chatId, message, userMessage, 'light');
                break;

            case userMessage.startsWith('.neon'):
                await textmakerCommand(sock, chatId, message, userMessage, 'neon');
                break;

            case userMessage.startsWith('.devil'):
                await textmakerCommand(sock, chatId, message, userMessage, 'devil');
                break;

            case userMessage.startsWith('.purple'):
                await textmakerCommand(sock, chatId, message, userMessage, 'purple');
                break;

            case userMessage.startsWith('.thunder'):
                await textmakerCommand(sock, chatId, message, userMessage, 'thunder');
                break;

            case userMessage.startsWith('.leaves'):
                await textmakerCommand(sock, chatId, message, userMessage, 'leaves');
                break;

            case userMessage.startsWith('.1917'):
                await textmakerCommand(sock, chatId, message, userMessage, '1917');
                break;

            case userMessage.startsWith('.arena'):
                await textmakerCommand(sock, chatId, message, userMessage, 'arena');
                break;

            case userMessage.startsWith('.hacker'):
                await textmakerCommand(sock, chatId, message, userMessage, 'hacker');
                break;

            case userMessage.startsWith('.sand'):
                await textmakerCommand(sock, chatId, message, userMessage, 'sand');
                break;

            case userMessage.startsWith('.blackpink'):
                await textmakerCommand(sock, chatId, message, userMessage, 'blackpink');
                break;

            case userMessage.startsWith('.glitch'):
                await textmakerCommand(sock, chatId, message, userMessage, 'glitch');
                break;

            case userMessage.startsWith('.fire'):
                await textmakerCommand(sock, chatId, message, userMessage, 'fire');
                break;

            case userMessage.startsWith('.antidelete'): {
                const antideleteMatch = userMessage.slice(11).trim();
                await handleAntideleteCommand(sock, chatId, message, antideleteMatch);
                break;
            }

            case userMessage === '.surrender':
                await handleTicTacToeMove(sock, chatId, senderId, 'surrender');
                break;

            case userMessage === '.cleartmp':
                await clearTmpCommand(sock, chatId, message);
                break;

            case userMessage === '.setpp':
                await setProfilePicture(sock, chatId, message);
                break;

            case userMessage.startsWith('.setgdesc'): {
                const text = rawText.slice(9).trim();
                await setGroupDescription(sock, chatId, senderId, text, message);
                break;
            }

            case userMessage.startsWith('.setgname'): {
                const text = rawText.slice(9).trim();
                await setGroupName(sock, chatId, senderId, text, message);
                break;
            }

            case userMessage.startsWith('.setgpp'):
                await setGroupPhoto(sock, chatId, senderId, message);
                break;

            case userMessage.startsWith('.instagram') || userMessage.startsWith('.insta') || userMessage === '.ig' || userMessage.startsWith('.ig '):
                await instagramCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.igsc'):
                await igsCommand(sock, chatId, message, true);
                break;

            case userMessage.startsWith('.igs'):
                await igsCommand(sock, chatId, message, false);
                break;

            case userMessage.startsWith('.fb') || userMessage.startsWith('.facebook'):
                await facebookCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.music'):
                await playCommand(sock, chatId, message);
                break;

            case userMessage === '.pair' || userMessage.startsWith('.pair '):
                await pairCommand(sock, chatId, message, rawText.slice(5).trim());
                commandExecuted = true;
                break;

            case userMessage.startsWith('.spotify'):
                await spotifyCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.play') || userMessage.startsWith('.mp3') || userMessage.startsWith('.ytmp3') || userMessage.startsWith('.song'):
                await songCommand(sock, chatId, message, rawText);
                break;

            case userMessage.startsWith('.video') || userMessage.startsWith('.ytmp4'):
                await videoCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.tiktok') || userMessage.startsWith('.tt'):
                await tiktokCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.gpt') || userMessage.startsWith('.gemini'):
                await aiCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.translate') || userMessage.startsWith('.trt'): {
                const commandLength = userMessage.startsWith('.translate') ? 10 : 4;
                await handleTranslateCommand(sock, chatId, message, userMessage.slice(commandLength));
                return;
            }

            case userMessage.startsWith('.ss') || userMessage.startsWith('.ssweb') || userMessage.startsWith('.screenshot'): {
                const ssCommandLength = userMessage.startsWith('.screenshot') ? 11 : (userMessage.startsWith('.ssweb') ? 6 : 3);
                await handleSsCommand(sock, chatId, message, userMessage.slice(ssCommandLength).trim());
                break;
            }

            case userMessage.startsWith('.areact') || userMessage.startsWith('.autoreact') || userMessage.startsWith('.autoreaction'):
                await handleAreactCommand(sock, chatId, message, isOwnerOrSudoCheck);
                break;

            case userMessage.startsWith('.sudo') || userMessage.startsWith('.adm'):
                await sudoCommand(sock, chatId, message);
                break;

            case userMessage === '.goodnight' || userMessage === '.lovenight' || userMessage === '.gn':
                await goodnightCommand(sock, chatId, message);
                break;

            case userMessage === '.shayari' || userMessage === '.shayri':
                await shayariCommand(sock, chatId, message);
                break;

            case userMessage === '.roseday':
                await rosedayCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.imagine') || userMessage.startsWith('.flux') || userMessage.startsWith('.dalle'):
                await imagineCommand(sock, chatId, message);
                break;

            case userMessage === '.uid' || userMessage.startsWith('.uid '): {
                const contextInfo = message.message?.extendedTextMessage?.contextInfo || {};
                const mentioned = Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : [];
                const args = rawText.trim().split(/\s+/).slice(1);
                const hasMentionRequest = args.some(arg => arg.startsWith('@'));
                const quoted = contextInfo.participant || contextInfo.remoteJid || '';
                const isReply = Boolean(contextInfo.quotedMessage && quoted);

                let candidates = [];
                if (mentioned.length) {
                    candidates = mentioned;
                } else if (isReply) {
                    candidates = [quoted, contextInfo.participantAlt, contextInfo.remoteJidAlt].filter(Boolean);
                } else if (hasMentionRequest) {
                    const numericMention = args.map(arg => arg.replace(/^@/, '').replace(/\D/g, '')).find(Boolean);
                    if (numericMention) candidates = [numericMention + '@s.whatsapp.net'];
                } else {
                    candidates = [
                        message.key?.participantAlt,
                        message.key?.remoteJidAlt,
                        message.key?.participant,
                        message.key?.remoteJid,
                        senderId
                    ].filter(Boolean);
                }

                if (!candidates.length) {
                    await sock.sendMessage(chatId, {
                        text: '❌ মেনশন করা ব্যক্তির ID পাওয়া যায়নি। WhatsApp থেকে কাউকে আসল Mention করে আবার .uid @user দিন।'
                    }, { quoted: message });
                    break;
                }

                let targetId = candidates.find(value => typeof value === 'string' && value.endsWith('@lid')) || candidates[0];
                let targetName = '';
                const contact = sock.contacts?.[targetId] || sock.store?.contacts?.[targetId] || {};
                targetName = contact.name || contact.notify || contact.verifiedName || '';

                if (isGroup) {
                    try {
                        const metadata = await sock.groupMetadata(chatId);
                        const participant = (metadata.participants || []).find(p => {
                            const ids = [p.id, p.lid, p.phoneNumber, p.phone_number].filter(Boolean);
                            return ids.some(id => candidates.includes(id)) || ids.includes(targetId);
                        });
                        if (participant) {
                            targetName = targetName || participant.name || participant.notify || participant.verifiedName || '';
                            const lid = [participant.lid, participant.id].find(id => typeof id === 'string' && id.endsWith('@lid'));
                            if (lid) targetId = lid;
                        }
                    } catch (error) {
                        console.log('[UID] Group contact lookup failed:', error.message);
                    }
                }

                const isSelf = candidates.some(id => id === senderId || id === message.key?.participant || id === message.key?.remoteJid);
                if (isSelf) targetName = targetName || message.pushName || 'Unknown';
                targetName = targetName || 'Unknown';

                await sock.sendMessage(chatId, {
                    text: '🆔 *MAHIRU • WHATSAPP UID :*\n\n' +
                        '👤 *Name:* ' + targetName + '\n' +
                        '🆔 *UID:* ' + targetId
                }, { quoted: message });
                commandExecuted = true;
                break;
            }

            case userMessage === '.jid':
                await groupJidCommand(sock, chatId, message);
                break;

            case userMessage.startsWith('.autotyping'):
                await autotypingCommand(sock, chatId, message);
                commandExecuted = true;
                break;

            case userMessage.startsWith('.autoread'):
                await autoreadCommand(sock, chatId, message);
                commandExecuted = true;
                break;

            case userMessage.startsWith('.heart'):
                await handleHeart(sock, chatId, message);
                break;

            case userMessage.startsWith('.horny'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['horny', ...parts.slice(1)];                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.circle'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['circle', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.lgbt'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['lgbt', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.lolice'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['lolice', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.simpcard'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['simpcard', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.tonikawa'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['tonikawa', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.its-so-stupid'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['its-so-stupid', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.namecard'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['namecard', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.oogway2'):
            case userMessage.startsWith('.oogway'): {
                const parts = userMessage.trim().split(/\s+/);
                const sub = userMessage.startsWith('.oogway2') ? 'oogway2' : 'oogway';
                const args = [sub, ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.tweet'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['tweet', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.ytcomment'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = ['youtube-comment', ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.comrade'):
            case userMessage.startsWith('.gay'):
            case userMessage.startsWith('.glass'):
            case userMessage.startsWith('.jail'):
            case userMessage.startsWith('.passed'):
            case userMessage.startsWith('.triggered'): {
                const parts = userMessage.trim().split(/\s+/);
                const sub = userMessage.slice(1).split(/\s+/)[0];
                const args = [sub, ...parts.slice(1)];
                await miscCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.animu'): {
                const parts = userMessage.trim().split(/\s+/);
                const args = parts.slice(1);
                await animeCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.nom'):
            case userMessage.startsWith('.poke'):
            case userMessage.startsWith('.cry'):
            case userMessage.startsWith('.kiss'):
            case userMessage.startsWith('.pat'):
            case userMessage.startsWith('.hug'):
            case userMessage.startsWith('.wink'):
            case userMessage.startsWith('.facepalm'):
            case userMessage.startsWith('.face-palm'):
            case userMessage.startsWith('.animuquote'):
            case userMessage.startsWith('.quote'):
            case userMessage.startsWith('.loli'): {
                const parts = userMessage.trim().split(/\s+/);
                let sub = parts[0].slice(1);
                if (sub === 'facepalm') sub = 'face-palm';
                if (sub === 'quote' || sub === 'animuquote') sub = 'quote';
                await animeCommand(sock, chatId, message, [sub]);
                break;
            }

            case userMessage === '.crop':
                await stickercropCommand(sock, chatId, message);
                commandExecuted = true;
                break;

            case userMessage.startsWith('.pies'): {
                const parts = rawText.trim().split(/\s+/);
                const args = parts.slice(1);
                await piesCommand(sock, chatId, message, args);
                commandExecuted = true;
                break;
            }

            case userMessage === '.china':
                await piesAlias(sock, chatId, message, 'china');
                commandExecuted = true;
                break;

            case userMessage === '.indonesia':
                await piesAlias(sock, chatId, message, 'indonesia');
                commandExecuted = true;
                break;

            case userMessage === '.japan':
                await piesAlias(sock, chatId, message, 'japan');
                commandExecuted = true;
                break;

            case userMessage === '.korea':
                await piesAlias(sock, chatId, message, 'korea');
                commandExecuted = true;
                break;

            case userMessage === '.india':
                await piesAlias(sock, chatId, message, 'india');
                commandExecuted = true;
                break;

            case userMessage === '.malaysia':
                await piesAlias(sock, chatId, message, 'malaysia');
                commandExecuted = true;
                break;

            case userMessage === '.thailand':
                await piesAlias(sock, chatId, message, 'thailand');
                commandExecuted = true;
                break;

            case userMessage.startsWith('.update'): {
                const parts = rawText.trim().split(/\s+/);
                const zipArg = parts[1] && parts[1].startsWith('http') ? parts[1] : '';
                await updateCommand(sock, chatId, message, zipArg);
                commandExecuted = true;
                break;
            }

            case userMessage.startsWith('.removebg') || userMessage.startsWith('.rmbg') || userMessage.startsWith('.nobg'):
                await removebgCommand.exec(sock, message, userMessage.split(' ').slice(1));
                break;

            case userMessage.startsWith('.remini') || userMessage.startsWith('.enhance') || userMessage.startsWith('.upscale'):
                await reminiCommand(sock, chatId, message, userMessage.split(' ').slice(1));
                break;

            case userMessage.startsWith('.sora'):
                await soraCommand(sock, chatId, message);
                break;

            default:
                if (!isGroup && userMessage.startsWith('.')) {
                    try {
                        const configuredOwner = message.key.fromMe ||
                            await isOwnerOrSudo.isConfiguredOwner(senderId, sock, chatId, message);
                        if (configuredOwner) {
                            const parts = rawText.trim().split(/\s+/);
                            const handled = await handleOwnerDotCommand(
                                sock,
                                chatId,
                                message,
                                (parts[0] || '').slice(1),
                                parts.slice(1).join(' ')
                            );
                            if (handled) {
                                commandExecuted = true;
                                break;
                            }
                        }
                    } catch (ownerCommandError) {
                        console.error('[OWNER AGENT] Dot-command failed:', ownerCommandError?.message || ownerCommandError);
                    }
                }
                if (isGroup) {
                    await handleTagDetection(sock, chatId, message, senderId);
                    await handleMentionDetection(sock, chatId, message);
                }
                commandExecuted = false;
                break;
        }

        if (commandExecuted !== false) {
            await showTypingAfterCommand(sock, chatId);
        }

        // Function to handle .jid command
        async function groupJidCommand(sock, chatId, message) {
            const groupJid = message.key.remoteJid;

            if (!groupJid.endsWith('@g.us')) {
                return await sock.sendMessage(chatId, {
                    text: "❌ This command can only be used in a group."
                });
            }

            await sock.sendMessage(chatId, {
                text: `✅ Group JID: ${groupJid}`
            }, {
                quoted: message
            });
        }

        if (userMessage.startsWith('.')) {
            await addCommandReaction(sock, message);
        }

    } catch (error) {
        console.error('❌ Error in message handler:', error);

        if (chatId) {
            try {
                await sock.sendMessage(chatId, {
                    text: '❌ Failed to process command!',
                    ...channelInfo
                });
            } catch (sendError) {
                console.error('Could not send error message:', sendError);
            }
        }
    }
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;

        if (!id.endsWith('@g.us')) return;

        // Notify the configured owner when the bot account itself is added to a group.
        if (action === 'add') {
            const normalizeJid = value => typeof value === 'string'
                ? value.replace(/:\d+@/, '@').trim()
                : '';
            const botJids = new Set([
                sock.user?.id,
                sock.user?.lid,
                sock.decodeJid?.(sock.user?.id),
                sock.decodeJid?.(sock.user?.lid)
            ].map(normalizeJid).filter(Boolean));
            const botWasAdded = (participants || []).some(participant =>
                botJids.has(normalizeJid(participant))
            );

            if (botWasAdded) {
                let groupName = 'Unknown group';
                try {
                    const metadata = await sock.groupMetadata(id);
                    groupName = metadata?.subject || groupName;
                } catch (metadataError) {
                    console.error('[GROUP ACCESS] Could not read new group name:', metadataError?.message || metadataError);
                }

                // Send the activation notice in the group only once.
                if (!groupAccess.hasGroupNoticeSent(id)) {
                    try {
                        await sock.sendMessage(id, {
                            text: [
                                '⏸️ *Mahiru এখনো এই গ্রুপে Active নয়*',
                                '',
                                'বট ব্যবহার করতে হলে Owner-কে এই গ্রুপটি Active করতে হবে।',
                                'কেউ বটকে Mention করলে বা কোনো Command দিলে Activation নির্দেশনা আবার দেখানো হবে।',
                                '',
                                `📛 Group: ${groupName}`,
                                `🆔 Group ID: ${id}`
                            ].join('\n'),
                            linkPreview: null
                        });
                        groupAccess.markGroupNoticeSent(id);
                        console.log('[GROUP ACCESS] Initial activation notice sent in group:', id);
                    } catch (groupNoticeError) {
                        console.error('[GROUP ACCESS] Could not send initial group notice:', groupNoticeError?.message || groupNoticeError);
                    }
                }

                // Notify the configured owner only once, separately from the group notice.
                if (!groupAccess.hasNoticeSent(id)) {
                    const ownerJid = getOwnerInbox(sock);
                    if (ownerJid) {
                        try {
                            const notice = await sock.sendMessage(ownerJid, {
                                text: [
                                    '🆕 *Mahiru নতুন একটি গ্রুপে Add হয়েছে*',
                                    '',
                                    `📛 Group: ${groupName}`,
                                    `🆔 Group ID: ${id}`,
                                    `📌 Status: ${groupAccess.isActive(id) ? 'আগে থেকেই Active' : 'Pending — এখনো Active নয়'}`,
                                    '',
                                    '↩️ এই নোটিশে Reply করে *Active* লিখলে গ্রুপ চালু হবে।',
                                    '⏸️ Reply করে *Deactivate* লিখলে গ্রুপ বন্ধ হবে।',
                                    '',
                                    `🛠️ বিকল্প কমান্ড: .gact ${id} / .gdeact ${id}`,
                                    `🗑️ বটকে সরাতে: .gdelete ${id}`
                                ].join('\n'),
                                linkPreview: null
                            });
                            if (notice?.key?.id) groupAccess.setPendingReply(notice.key.id, id);
                            groupAccess.markNoticeSent(id);
                            console.log('[GROUP ACCESS] Owner notified about bot being added:', id);
                        } catch (notifyError) {
                            console.error('[GROUP ACCESS] Could not notify owner:', ownerJid, notifyError?.message || notifyError);
                        }
                    } else {
                        console.error('[GROUP ACCESS] Owner number/LID is not configured; cannot send new-group notification.');
                    }
                }
            }
        }

        // Notify the owner if the bot itself is removed from a group.
        if (action === 'remove') {
            const normalizeJid = value => typeof value === 'string'
                ? value.replace(/:\d+@/, '@').trim()
                : '';
            const botJids = new Set([
                sock.user?.id,
                sock.user?.lid,
                sock.decodeJid?.(sock.user?.id),
                sock.decodeJid?.(sock.user?.lid)
            ].map(normalizeJid).filter(Boolean));
            const botWasRemoved = (participants || []).some(participant => {
                const ids = typeof participant === 'string'
                    ? [participant]
                    : [participant?.id, participant?.jid, participant?.lid, participant?.phoneNumber];
                return ids.some(value => botJids.has(normalizeJid(value)));
            });

            if (botWasRemoved) {
                let groupName = 'Unknown group';
                try {
                    const metadata = await sock.groupMetadata(id);
                    groupName = metadata?.subject || groupName;
                } catch (metadataError) {
                    console.error('[GROUP ACCESS] Could not read removed group name:', metadataError?.message || metadataError);
                }
                await notifyOwner(sock,
                    '🚪 *MAHIRU BOT GROUP থেকে REMOVE হয়েছে*\n\n' +
                    '📛 Group: ' + groupName + '\n' +
                    '🆔 Group ID: ' + id + '\n' +
                    '👤 যিনি Remove করেছেন: ' + (author || 'Unknown') + '\n' +
                    '⏰ সময়: ' + new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })
                );
            }
        }
        let isPublic = true;
        try {
            const modeData = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (typeof modeData.isPublic === 'boolean') isPublic = modeData.isPublic;
        } catch (e) { }

        if (action === 'promote') {
            if (!isPublic) return;
            await handlePromotionEvent(sock, id, participants, author);
            return;        }

        if (action === 'demote') {
            if (!isPublic) return;
            await handleDemotionEvent(sock, id, participants, author);
            return;
        }

        if (action === 'add') {
            await handleJoinEvent(sock, id, participants);
        }

        if (action === 'remove') {
            await handleLeaveEvent(sock, id, participants);
        }

    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (sock, status) => {
        await handleStatusUpdate(sock, status);
        const statusMessages = Array.isArray(status?.messages) ? status.messages : [status];
        for (const statusMessage of statusMessages) {
            if (statusMessage?.key?.remoteJid === 'status@broadcast') {
                await autoSaveStatus(sock, statusMessage);
            }
        }
    }
};