const { isJidGroup } = require('@whiskeysockets/baileys');
const { getAntilink, incrementWarningCount, resetWarningCount, isSudo } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const config = require('../config');
const { getOwnerInbox } = require('./ownerNotify');

const WARN_COUNT = config.WARN_COUNT || 3;

/**
 * Checks if a string contains a URL.
 *
 * @param {string} str - The string to check.
 * @returns {boolean} - True if the string contains a URL, otherwise false.
 */
function containsURL(str) {
	const urlRegex = /(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i;
	return urlRegex.test(str);
}

/**
 * Handles the Antilink functionality for group chats.
 *
 * @param {object} msg - The message object to process.
 * @param {object} sock - The socket object to use for sending messages.
 */
async function Antilink(msg, sock) {
	const jid = msg.key.remoteJid;
	if (!isJidGroup(jid)) return;

	const SenderMessage = msg.message?.conversation || 
						 msg.message?.extendedTextMessage?.text || '';
	if (!SenderMessage || typeof SenderMessage !== 'string') return;

	const sender = msg.key.participant;
	if (!sender) return;
	
	// Skip if sender is group admin or sudo
	try {
		const { isSenderAdmin } = await isAdmin(sock, jid, sender);
		if (isSenderAdmin) return;
	} catch (_) {}
	const senderIsSudo = await isSudo(sender);
	if (senderIsSudo) return;

	if (!containsURL(SenderMessage.trim())) return;
	
	const antilinkConfig = await getAntilink(jid, 'on');
	if (!antilinkConfig) return;

	const action = antilinkConfig.action;
	
	try {
		// Delete the offending message first.
		await sock.sendMessage(jid, { delete: msg.key });

		// Send an Anti-Link report to the bot owner's private inbox,
		// using the same report style/destination as Anti-Delete.
		try {
			const ownerInbox = getOwnerInbox(sock);
			if (ownerInbox) {
				let groupName = jid;
				try {
					const metadata = await sock.groupMetadata(jid);
					groupName = metadata?.subject || jid;
				} catch (_) {}

				const senderNumber = sender.split('@')[0].split(':')[0];
				const time = new Date().toLocaleString('bn-BD', {
					timeZone: 'Asia/Dhaka',
					hour12: true
				});
				const report = '*🔰 ANTILINK REPORT 🔰*\n\n' +
					'*👤 লিংক পাঠিয়েছেন:* @' + senderNumber + '\n' +
					'*👥 গ্রুপ:* ' + groupName + '\n' +
					'*⚙️ Action:* ' + action + '\n' +
					'*🕒 সময়:* ' + time + '\n\n' +
					'*🔗 Deleted Link Message:*\n' + SenderMessage;

				await sock.sendMessage(ownerInbox, {
					text: report,
					mentions: [sender]
				});
			}
		} catch (reportError) {
			console.error('[ANTILINK] Owner report failed:', reportError.message);
		}

		switch (action) {
			case 'delete':
				await sock.sendMessage(jid, { 
					text: `\`\`\`@${sender.split('@')[0]} link are not allowed here\`\`\``,
					mentions: [sender] 
				});
				break;

			case 'kick':
				await sock.groupParticipantsUpdate(jid, [sender], 'remove');
				await sock.sendMessage(jid, {
					text: `\`\`\`@${sender.split('@')[0]} has been kicked for sending links\`\`\``,
					mentions: [sender]
				});
				break;

			case 'warn':
				const warningCount = await incrementWarningCount(jid, sender);
				if (warningCount >= WARN_COUNT) {
					await sock.groupParticipantsUpdate(jid, [sender], 'remove');
					await resetWarningCount(jid, sender);
					await sock.sendMessage(jid, {
						text: `\`\`\`@${sender.split('@')[0]} has been kicked after ${WARN_COUNT} warnings\`\`\``,
						mentions: [sender]
					});
				} else {
					await sock.sendMessage(jid, {
						text: `\`\`\`@${sender.split('@')[0]} warning ${warningCount}/${WARN_COUNT} for sending links\`\`\``,
						mentions: [sender]
					});
				}
				break;
		}
	} catch (error) {
		console.error('Error in Antilink:', error);
	}
}

module.exports = { Antilink };