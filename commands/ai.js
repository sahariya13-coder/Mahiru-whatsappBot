const APIs = require('../lib/api');

async function aiCommand(sock, chatId, message) {
  try {
    const text =
      message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const query = text.replace(/^\.(?:ai|gpt|gemini)\s*/i, '').trim();

    if (!query) {
      return sock.sendMessage(
        chatId,
        { text: 'ব্যবহার: `.ai <প্রশ্ন>`\nউদাহরণ: `.ai একটি সাধারণ HTML পেজ লিখে দাও`' },
        { quoted: message }
      );
    }

    await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });

    let answer;
    const steps = [
      ['Mahiru Shiina chat', () => APIs.knightChatAI(query)],
      ['Mahiru Shiina GPT', () => APIs.knightGptAI(query)],
      ['fallback', () => APIs.fallbackChatAI(query)],
    ];

    for (const [name, run] of steps) {
      try {
        answer = await run();
        if (answer) {
          console.log(`[ai] OK via ${name}`);
          break;
        }
      } catch (err) {
        console.log(`[ai] ${name} failed:`, err?.message || err);
      }
    }

    if (!answer) {
      return sock.sendMessage(
        chatId,
        { text: '❌ AI থেকে উত্তর পাওয়া যায়নি। পরে আবার চেষ্টা করুন।' },
        { quoted: message }
      );
    }

    await sock.sendMessage(chatId, { text: answer }, { quoted: message });
  } catch (err) {
    console.error('[ai]', err?.message || err);
    await sock.sendMessage(
      chatId,
      { text: '❌ একটি সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।' },
      { quoted: message }
    );
  }
}

module.exports = aiCommand;
