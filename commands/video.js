const yts = require('yt-search');
const settings = require('../settings');
const APIs = require('../lib/api');
const youtubeApi = require('../lib/mahiruYoutube');
const { fetchWhatsAppVideo } = require('../lib/waVideo');

function isYouTubeUrl(text) {
  return /youtube\.com|youtu\.be/i.test(text);
}

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : String(text || '').trim();
}

function formatInfo(video) {
  const views = Number(video.views || 0).toLocaleString('en-US');
  return '🎬 *' + (video.title || 'YouTube Video') +
    '*\n⏱ Duration: ' + (video.timestamp || '—') +
    '\n👀 Views: ' + views;
}

async function resolveVideo(videoUrl) {
  const steps = [
    ['Mahiru YouTube API', async () => {
      const result = await youtubeApi.getFormats(videoUrl);
      if (!result.video?.url) throw new Error('No video format available');
      return { title: result.title, download: result.video.url };
    }],
    ['Mahiru legacy', () => APIs.knightVideoDownload(videoUrl)],
    ['Prince', () => APIs.princeVideoDownload(videoUrl)],
    ['Hector', () => APIs.hectorVideoDownload(videoUrl)],
    ['EliteProTech', () => APIs.getEliteProTechVideoByUrl(videoUrl)],
    ['Yupra', () => APIs.getYupraVideoByUrl(videoUrl)],
    ['Okatsu', () => APIs.getOkatsuVideoByUrl(videoUrl)]
  ];

  const failures = [];
  for (const [name, run] of steps) {
    try {
      const result = await run();
      const download = result?.download || result?.dl_url || result?.dl || result?.url;
      if (!download || !/^https?:\/\//i.test(download)) {
        throw new Error('Provider returned no valid download URL');
      }

      // Retry a closed CDN connection once, then continue to the next provider.
      let lastError;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const buffer = await fetchWhatsAppVideo(download);
          console.log('[video] Downloaded via ' + name + (attempt > 1 ? ' (retry)' : ''));
          return { title: result.title || 'Video', buffer, provider: name };
        } catch (error) {
          lastError = error;
          console.log('[video] ' + name + ' transfer attempt ' + attempt + ' failed:', error?.message || error);
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }
      throw lastError || new Error('Video transfer failed');
    } catch (error) {
      failures.push(name + ': ' + String(error?.message || error).slice(0, 180));
      console.log('[video] ' + name + ' failed:', error?.message || error);
    }
  }

  throw new Error('সব Video source ব্যর্থ হয়েছে। ' + failures.slice(-3).join(' | '));
}

async function resolveSearch(query) {
  try {
    const videos = await youtubeApi.search(query, 'video');
    if (videos.length) return videos[0];
  } catch (error) {
    console.log('[video] Mahiru YouTube search failed:', error.message);
  }

  const search = await yts(query);
  const video = search?.videos?.[0];
  if (!video) throw new Error('কোনো ফলাফল পাওয়া যায়নি।');
  return video;
}

async function videoCommand(sock, chatId, message) {
  try {
    const text =
      message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const query = text.replace(/^\.(?:video|ytmp4|ytv|ytvid)\s*/i, '').trim();

    if (!query) {
      return sock.sendMessage(
        chatId,
        { text: 'ব্যবহার: .video <ভিডিওর নাম অথবা YouTube লিংক>' },
        { quoted: message }
      );
    }

    let preview;
    let videoUrl;

    if (isYouTubeUrl(query) || youtubeApi.extractYouTubeId(query)) {
      videoUrl = extractUrl(query);
      const id = youtubeApi.extractYouTubeId(videoUrl);
      try {
        preview = await youtubeApi.videoDetails(id);
      } catch {
        preview = {
          title: 'YouTube Video',
          thumbnail: id ? 'https://i.ytimg.com/vi/' + id + '/sddefault.jpg' : null
        };
      }
    } else {
      preview = await resolveSearch(query);
      videoUrl = preview.url;
    }

    if (preview.thumbnail) {
      try {
        await sock.sendMessage(chatId, {
          image: { url: preview.thumbnail },
          caption: formatInfo(preview) + '\n\nডাউনলোড হচ্ছে...'
        }, { quoted: message });
      } catch {
        await sock.sendMessage(chatId, {
          text: formatInfo(preview) + '\n\nডাউনলোড হচ্ছে...'
        }, { quoted: message });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: formatInfo(preview) + '\n\nডাউনলোড হচ্ছে...'
      }, { quoted: message });
    }

    const dl = await resolveVideo(videoUrl);
    const videoBuffer = dl.buffer;
    const botName = settings.botName || 'Mahiru Shiina';
    const title = dl.title || preview.title || 'Video';
    const fileName = (title.replace(/[^\w\s-]/g, '').trim() || 'video') + '.mp4';

    await sock.sendMessage(chatId, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName,
      caption: '*' + title + '*\n\n> *_ডাউনলোড করেছে ' + botName + '_*'
    }, { quoted: message });
  } catch (err) {
    console.error('[video]', err?.message || err);
    await sock.sendMessage(chatId, {
      text: '❌ ডাউনলোড ব্যর্থ হয়েছে: ' + (err?.message || 'Unknown error')
    }, { quoted: message });
  }
}

module.exports = videoCommand;
