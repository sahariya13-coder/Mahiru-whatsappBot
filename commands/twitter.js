const axios = require('axios');
const settings = require('../settings');
const APIs = require('../lib/api');

const processedMessages = new Set();

const TWITTER_PATTERNS = [
  /https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i,
  /https?:\/\/(?:mobile\.)?twitter\.com\//i,
];

function caption(quality) {
  const bot = (settings.botName || 'Mahiru Shiina').toUpperCase();
  let text = `*DOWNLOADED BY ${bot}*`;
  if (quality) text += `\n\n📹 Quality: ${quality}`;
  return text;
}

async function resolveMedia(url) {
  try {
    return await APIs.getTwitterElite(url);
  } catch (err) {
    console.log('[twitter] Elite failed:', err.message);
  }
  return APIs.getTwitterPrince(url);
}

function pickBestVideo(videos) {
  if (!videos?.length) return null;
  const scored = videos.map((v) => {
    const label = String(v.quality || v.label || '');
    const match = label.match(/(\d{3,4})p/i);
    return { url: v.url, quality: label || 'best', score: match ? parseInt(match[1], 10) : 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

async function sendVideo(sock, chatId, message, videoUrl, quality) {
  const cap = caption(quality);
  try {
    await sock.sendMessage(
      chatId,
      { video: { url: videoUrl }, mimetype: 'video/mp4', caption: cap },
      { quoted: message }
    );
  } catch {
    const res = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
      headers: { 'User-Agent': APIs.UA, Accept: 'application/json', Referer: 'https://x.com/' },
    });
    await sock.sendMessage(
      chatId,
      { video: Buffer.from(res.data), mimetype: 'video/mp4', caption: cap },
      { quoted: message }
    );
  }
}

async function sendImage(sock, chatId, message, imageUrl) {
  const cap = caption();
  try {
    await sock.sendMessage(chatId, { image: { url: imageUrl }, caption: cap }, { quoted: message });
  } catch {
    const res = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': APIs.UA, Referer: 'https://x.com/' },
    });
    await sock.sendMessage(
      chatId,
      { image: Buffer.from(res.data), caption: cap },
      { quoted: message }
    );
  }
}

async function sendAudio(sock, chatId, message, audioUrl) {
  const cap = caption('128kbps MP3');
  try {
    await sock.sendMessage(
      chatId,
      { audio: { url: audioUrl }, mimetype: 'audio/mpeg', caption: cap },
      { quoted: message }
    );
  } catch {
    const res = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
      headers: { 'User-Agent': APIs.UA },
    });
    await sock.sendMessage(
      chatId,
      {
        document: Buffer.from(res.data),
        mimetype: 'audio/mpeg',
        fileName: 'twitter_audio.mp3',
        caption: cap,
      },
      { quoted: message }
    );
  }
}

async function twitterCommand(sock, chatId, message) {
  try {
    if (processedMessages.has(message.key.id)) return;
    processedMessages.add(message.key.id);
    setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

    const text =
      message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    const url = urlMatch ? urlMatch[0] : '';

    if (!url) {
      return sock.sendMessage(
        chatId,
        { text: 'Twitter / X লিংক দিন।\nব্যবহার: `.twitter <লিংক>`' },
        { quoted: message }
      );
    }
    if (!TWITTER_PATTERNS.some((p) => p.test(url))) {
      return sock.sendMessage(
        chatId,
        { text: '❌ ভুল লিংক। `x.com` অথবা `twitter.com` পোস্টের লিংক দিন।' },
        { quoted: message }
      );
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

    const media = await resolveMedia(url);
    const best = pickBestVideo(media.videos);

    if (best) {
      await sendVideo(sock, chatId, message, best.url, best.quality);
      return;
    }
    if (media.thumbnail) {
      await sendImage(sock, chatId, message, media.thumbnail);
      return;
    }
    if (media.mp3Url) {
      await sendAudio(sock, chatId, message, media.mp3Url);
      return;
    }

    await sock.sendMessage(
      chatId,
      { text: '❌ এই পোস্টে ডাউনলোডযোগ্য মিডিয়া পাওয়া যায়নি।' },
      { quoted: message }
    );
  } catch (err) {
    console.error('[twitter]', err?.message || err);
    await sock.sendMessage(
      chatId,
      { text: '❌ Twitter / X থেকে ডাউনলোড করা যায়নি। অন্য লিংক দিয়ে চেষ্টা করুন।' },
      { quoted: message }
    );
  }
}

module.exports = twitterCommand;
