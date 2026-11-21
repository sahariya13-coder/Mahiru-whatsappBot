const { chatWithMahiruAI } = require('../lib/mahiruAI');
async function aiCommand(sock, chatId, message) {
  try {
    const raw = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const query = raw.replace(/^\.(?:ai|gpt|gemini)\s*/i, '').trim();
    if (!query) return sock.sendMessage(chatId, { text: 'ব্যবহার: .ai <প্রশ্ন>' }, { quoted: message });
    await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });
    const sender = message.key?.participant || message.key?.remoteJid || chatId;
    const answer = await chatWithMahiruAI({ uid: chatId + ':' + sender, text: query, system: 'তুমি Mahiru। ব্যবহারকারীর ভাষায় স্বাভাবিক ও সহায়কভাবে উত্তর দেবে।' });
    await sock.sendMessage(chatId, { text: answer }, { quoted: message });
  } catch (error) {
    console.error('[Mahiru AI API]', error.message);
    await sock.sendMessage(chatId, { text: '❌ Mahiru AI API থেকে উত্তর পাওয়া যায়নি। পরে আবার চেষ্টা করুন।' }, { quoted: message });
  }
}
module.exports = aiCommand;
