const axios = require('axios');
const yts = require('yt-search');
const ytMusic = require('node-youtube-music');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { toAudio } = require('../lib/converter');
const APIs = require('../lib/api');

const { UA, knightSongDownload, hectorSongDownload, princeSongDownload, prexzySongDownload } = APIs;

function extractYouTubeId(input) {
  const text = String(input || '').trim();
  const m =
    text.match(/(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i) ||
    text.match(/^([a-zA-Z0-9_-]{11})$/);
  return m?.[1] || null;
}

async function resolveVideoInfo(text) {
  if (/youtube\.com|youtu\.be/i.test(text)) {
    const videoId = extractYouTubeId(text);
    if (videoId) {
      try {
        const info = await yts({ videoId });
        if (info?.videoId || info?.url) {
          return {
            url: info.url || `https://www.youtube.com/watch?v=${videoId}`,
            title: info.title || 'YouTube Audio',
            thumbnail: info.thumbnail || info.image || null,
            timestamp: info.timestamp || info.duration?.timestamp || '—',
          };
        }
      } catch (err) {
        console.log('[song] yts videoId lookup failed:', err?.message || err);
      }
    }
    return { url: text.trim(), title: 'YouTube Audio', thumbnail: null, timestamp: '—' };
  }

  try {
    const search = await yts(text);
    if (search?.videos?.length) return search.videos[0];
  } catch (err) {
    console.log('[song] yt-search failed:', err?.message || err);
  }

  try {
    if (typeof ytMusic.searchMusics === 'function') {
      const tracks = await ytMusic.searchMusics(text);
      const track = Array.isArray(tracks) ? tracks.find((item) => item?.youtubeId) : null;
      if (track) {
        return {
          url: `https://www.youtube.com/watch?v=${track.youtubeId}`,
          title: track.title || 'YouTube Music',
          thumbnail: track.thumbnail?.url || track.thumbnail || track.thumbnails?.[0]?.url || null,
          timestamp: track.duration?.label || track.duration || '—',
        };
      }
    }
  } catch (err) {
    console.log('[song] YouTube Music fallback failed:', err?.message || err);
  }

  return null;
}

function downloadWithYtDlp(videoUrl, title) {
  return new Promise((resolve, reject) => {
    const binary = path.join(process.cwd(), 'bin', 'yt-dlp');
    if (!fs.existsSync(binary)) {
      reject(new Error(`yt-dlp binary not found: ${binary}`));
      return;
    }

    const tempDir = path.join(process.cwd(), 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    const basePath = path.join(tempDir, `song_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const outputPath = `${basePath}.mp3`;

    const args = [
      '--no-playlist',
      '--no-warnings',
      '--js-runtimes', 'node',
      '--remote-components', 'ejs:github',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '--ffmpeg-location', '/usr/bin/ffmpeg',
      '--output', `${basePath}.%(ext)s`,
      videoUrl,
    ];

    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) {
        settled = true;
        reject(new Error('yt-dlp timed out after 180 seconds'));
      }
    }, 180000);

    child.stderr.on('data', (chunk) => {
      if (stderr.length < 12000) stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code !== 0 || !fs.existsSync(outputPath)) {
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        reject(new Error(`yt-dlp failed (exit ${code}): ${stderr.slice(-2500) || 'No diagnostic output'}`));
        return;
      }

      try {
        const buffer = fs.readFileSync(outputPath);
        fs.unlinkSync(outputPath);
        if (!buffer.length) throw new Error('yt-dlp produced an empty audio file');
        resolve({ buffer, title: title || 'song' });
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function fetchAudioBuffer(audioUrl, headers, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        decompress: true,
        validateStatus: (s) => s >= 200 && s < 400,
        headers,
      });
      const buf = Buffer.from(res.data);
      if (buf.length > 0) return buf;
      throw new Error('Empty audio buffer');
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      if (status === 403 || status === 451) throw err;
      console.log(`[song] file fetch ${attempt}/${attempts}:`, status || err.code || err.message);
      if (attempt < attempts) await APIs.sleep(1200 * attempt);
    }
  }
  throw lastError || new Error('Failed to fetch audio file');
}

function detectAudioFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.toString('ascii', 4, 8) === 'ftyp') return { name: 'M4A/MP4', ext: 'm4a' };
  if (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { name: 'MP3', ext: 'mp3' };
  if (buf.toString('ascii', 0, 4) === 'OggS') return { name: 'OGG/Opus', ext: 'ogg' };
  if (buf.toString('ascii', 0, 4) === 'RIFF') return { name: 'WAV', ext: 'wav' };
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return { name: 'WebM', ext: 'webm' };
  return null;
}

async function songCommand(sock, chatId, message) {
  try {
    const raw =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      '';
    const text = raw.replace(/^\.(?:play|song|mp3|ytmp3)\s*/i, '').trim();

    if (!text) {
      await sock.sendMessage(chatId, { text: 'Usage: .play <song name or YouTube link>' }, { quoted: message });
      return;
    }

    const video = await resolveVideoInfo(text);
    if (!video?.url) {
      await sock.sendMessage(chatId, { text: 'No results found.' }, { quoted: message });
      return;
    }

    const caption = `🎵 Downloading: *${video.title || 'YouTube Audio'}*\n⏱ Duration: ${video.timestamp || '—'}`;
    if (video.thumbnail && /^https?:\/\//i.test(video.thumbnail)) {
      await sock.sendMessage(chatId, { image: { url: video.thumbnail }, caption }, { quoted: message });
    } else {
      await sock.sendMessage(chatId, { text: caption }, { quoted: message });
    }

    let audioData = null;
    let audioBuffer = null;

    // Primary downloader: local standalone yt-dlp binary (no Python/Pip required).
    try {
      const result = await downloadWithYtDlp(video.url, video.title);
      audioBuffer = result.buffer;
      audioData = { title: result.title };
      console.log(`[song] OK via local yt-dlp (${audioBuffer.length} bytes)`);
    } catch (ytDlpError) {
      console.log('[song] local yt-dlp failed; trying API fallbacks:', ytDlpError.message);
    }

    // Keep the existing providers as fallbacks in case YouTube changes its extraction flow.
    if (!audioBuffer?.length) {
      const apiMethods = [
        { name: 'Knight API', method: () => knightSongDownload(video.url) },
        { name: 'Hector', method: () => hectorSongDownload(video.url) },
        { name: 'Prince API', method: () => princeSongDownload(video.url) },
        { name: 'Prexzy', method: () => prexzySongDownload(video.url) },
        { name: 'EliteProTech', method: () => APIs.getEliteProTechDownloadByUrl(video.url) },
        { name: 'Yupra', method: () => APIs.getYupraDownloadByUrl(video.url) },
        { name: 'Okatsu', method: () => APIs.getOkatsuDownloadByUrl(video.url) },
        { name: 'Izumi', method: () => APIs.getIzumiDownloadByUrl(video.url) },
      ];

      for (const apiMethod of apiMethods) {
        try {
          audioData = await apiMethod.method();
          const audioUrl = audioData?.download || audioData?.audio || audioData?.downloadUrl || audioData?.dl || audioData?.url;
          if (!audioUrl) {
            console.log(`${apiMethod.name} returned no download URL, trying next...`);
            continue;
          }

          const isGoogleVideo = /googlevideo\.com|youtube\.com\/videoplayback/i.test(audioUrl);
          const headers = {
            'User-Agent': UA,
            Accept: '*/*',
            'Accept-Encoding': 'identity',
            ...(isGoogleVideo ? { Referer: 'https://www.youtube.com/' } : {}),
          };
          if (audioData.referer) headers.Referer = audioData.referer;

          try {
            audioBuffer = await fetchAudioBuffer(audioUrl, headers);
            if (!audioBuffer?.length || !detectAudioFormat(audioBuffer)) {
              console.log(`${apiMethod.name} returned non-audio, trying next...`);
              audioBuffer = null;
              continue;
            }
            console.log(`[song] OK via ${apiMethod.name} (${audioBuffer.length} bytes)`);
            break;
          } catch (downloadErr) {
            console.log(`Download failed from ${apiMethod.name}:`, downloadErr.response?.status || downloadErr.code || downloadErr.message);
          }
        } catch (apiErr) {
          console.log(`${apiMethod.name} API failed:`, apiErr.message);
        }
      }
    }

    if (!audioBuffer?.length) {
      throw new Error('All download sources failed. yt-dlp and API providers could not download this track.');
    }

    const detected = detectAudioFormat(audioBuffer);
    if (!detected) throw new Error('Downloaded file is not a recognized audio format');

    let finalBuffer = audioBuffer;
    if (detected.ext !== 'mp3') {
      finalBuffer = await toAudio(audioBuffer, detected.ext);
      if (!finalBuffer?.length) throw new Error(`Failed to convert ${detected.name} to MP3`);
    }

    await sock.sendMessage(
      chatId,
      {
        audio: finalBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${(audioData?.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.mp3`,
        ptt: false,
      },
      { quoted: message }
    );

    try {
      const tempDir = path.join(process.cwd(), 'temp');
      if (fs.existsSync(tempDir)) {
        const now = Date.now();
        for (const file of fs.readdirSync(tempDir)) {
          if (!file.startsWith('song_')) continue;
          const filePath = path.join(tempDir, file);
          try {
            if (now - fs.statSync(filePath).mtimeMs > 10 * 60 * 1000) fs.unlinkSync(filePath);
          } catch {}
        }
      }
    } catch {}
  } catch (err) {
    console.error('Song command error:', err);
    let errorMessage = '❌ Failed to download song.';
    if (err.message?.includes('All download sources failed')) {
      errorMessage = '❌ Download failed. YouTube may be blocking extraction or the track may be unavailable.';
    } else if (err.message?.includes('blocked') || err.response?.status === 451) {
      errorMessage = '❌ Download blocked or unavailable in your region.';
    }
    await sock.sendMessage(chatId, { text: errorMessage }, { quoted: message });
  }
}

module.exports = songCommand;
