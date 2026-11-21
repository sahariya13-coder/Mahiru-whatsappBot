const yts = require('yt-search');
const api = require('../lib/api');

const songBusyChats = new Set();

function extractYouTubeId(input) {
  const text = String(input || '').trim();
  const match =
    text.match(/(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i) ||
    text.match(/^([a-zA-Z0-9_-]{11})$/);
  return match?.[1] || null;
}

async function resolveVideoInfo(query) {
  if (/youtube\.com|youtu\.be/i.test(query)) {
    const id = extractYouTubeId(query);
    if (!id) throw new Error('Invalid YouTube URL');
    return {
      url: 'https://www.youtube.com/watch?v=' + id,
      title: 'YouTube Audio',
      timestamp: '—'
    };
  }

  const result = await yts(query);
  const video = result?.videos?.[0];
  if (!video?.url) throw new Error('কোনো গান পাওয়া যায়নি।');
  return video;
}

async function samplecutSongDownload(videoUrl) {
  const response = await fetch('https://api.samplecut.app/v1/downloads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Name': 'Mahiru-WhatsApp-Bot'
    },
    body: JSON.stringify({ url: videoUrl }),
    signal: AbortSignal.timeout(120000)
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Samplecut invalid response (' + response.status + ')');
  }

  if (!response.ok) {
    const code = data?.error?.code || response.status;
    const message = data?.error?.message || 'Request failed';
    throw new Error('Samplecut ' + code + ': ' + message);
  }

  const url = data?.download_url;
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('Samplecut returned no valid download URL');
  }

  return { url, title: data.title || null, filename: data.filename || null };
}

async function getAudioDownload(videoUrl) {
  const providers = [
    ['Samplecut', () => samplecutSongDownload(videoUrl)],
    ['VidFetch', () => api.vidFetchSongDownload(videoUrl)],
    ['mahiru shiina', () => api.knightSongDownload(videoUrl, 1)],
    ['Hector', () => api.hectorSongDownload(videoUrl, 1)],
    ['Prince', () => api.princeSongDownload(videoUrl, 1)],
    ['Prexzy', () => api.prexzySongDownload(videoUrl)],
    ['EliteProTech', () => api.getEliteProTechDownloadByUrl(videoUrl)],
    ['Yupra', () => api.getYupraDownloadByUrl(videoUrl)],
    ['Okatsu', () => api.getOkatsuDownloadByUrl(videoUrl)],
    ['Izumi', () => api.getIzumiDownloadByUrl(videoUrl)],
    ['SaveDock', () => api.saveDockSongDownload(videoUrl)]
  ];

  const errors = [];
  for (const [name, download] of providers) {
    try {
      const result = await download();
      const url = result?.download_url || result?.download || result?.dl_url || result?.url;
      if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error('API returned no valid audio URL');
      }
      if (api.isIpLockedCdn?.(url)) {
        throw new Error('API returned an IP-locked YouTube URL');
      }
      console.log('[song] Provider selected:', name);
      return {
        url,
        title: result.title || null,
        filename: result.filename || null,
        thumbnail: result.thumbnail || null
      };
    } catch (error) {
      console.log('[song] ' + name + ' failed:', error.message);
      errors.push(name + ': ' + error.message);
    }
  }

  throw new Error('সব Audio API ব্যর্থ হয়েছে।');
}

async function songCommand(sock, chatId, message) {
  const chatKey = String(chatId);
  if (songBusyChats.has(chatKey)) {
    await sock.sendMessage(chatId, {
      text: '⏳ অন্য একটি গান প্রসেস হচ্ছে। একটু পরে আবার চেষ্টা করুন।'
    }, { quoted: message });
    return;
  }

  songBusyChats.add(chatKey);
  try {
    const raw =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      '';
    const query = raw.replace(/^\.(?:play|song|mp3|ytmp3)\s*/i, '').trim();

    if (!query) {
      await sock.sendMessage(chatId, {
        text: 'ব্যবহার: .play গানের নাম অথবা YouTube link'
      }, { quoted: message });
      return;
    }

    const video = await resolveVideoInfo(query);

    const videoId = extractYouTubeId(video.url);
    const thumbnail =
      video.thumbnail ||
      (videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : null);
    const duration =
      video.timestamp ||
      video.duration?.timestamp ||
      (Number.isFinite(video.duration?.seconds)
        ? Math.floor(video.duration.seconds / 60) + ':' +
          String(video.duration.seconds % 60).padStart(2, '0')
        : 'Unknown');

    const songCaption =
      '🎵 Downloading: *' + (video.title || 'YouTube Audio') + '*\n' +
      '⏱ Duration: ' + duration + '\n' +
      '✨ *Mahiru Shiina*';

    if (thumbnail) {
      await sock.sendMessage(chatId, {
        image: { url: thumbnail },
        caption: songCaption
      }, { quoted: message });
    } else {
      await sock.sendMessage(chatId, {
        text: songCaption
      }, { quoted: message });
    }

    const audio = await getAudioDownload(video.url);

    await sock.sendMessage(chatId, {
      audio: { url: audio.url },
      mimetype: 'audio/mpeg',
      fileName: (String(audio.title || video.title || 'Mahiru-Song')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .slice(0, 80) || 'Mahiru-Song') + '.mp3',
      ptt: false
    }, { quoted: message });

    console.log('[song] Audio sent through API URL');
  } catch (error) {
    console.error('[song] Command failed:', error.message);
    await sock.sendMessage(chatId, {
      text: error.message === 'সব Audio API ব্যর্থ হয়েছে।'
        ? '❌ সব Audio API এই মুহূর্তে কাজ করছে না। পরে আবার চেষ্টা করুন।'
        : '❌ গান প্রসেস করা যায়নি: ' + String(error.message || 'Unknown error').slice(0, 180)
    }, { quoted: message });
  } finally {
    songBusyChats.delete(chatKey);
  }
}

module.exports = songCommand;
