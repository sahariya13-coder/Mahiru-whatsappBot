const yts = require('yt-search');
const ytMusic = require('node-youtube-music');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let songBusy = false;

function extractYouTubeId(input) {
  const text = String(input || '').trim();
  const match =
    text.match(/(?:youtube\\.com\\/(?:watch\\?.*?v=|embed\\/|shorts\\/|live\\/)|youtu\\.be\\/)([a-zA-Z0-9_-]{11})/i) ||
    text.match(/^([a-zA-Z0-9_-]{11})$/);
  return match?.[1] || null;
}

async function resolveVideoInfo(query) {
  if (/youtube\\.com|youtu\\.be/i.test(query)) {
    const id = extractYouTubeId(query);
    return id
      ? { url: `https://www.youtube.com/watch?v=${id}`, title: 'YouTube Audio', timestamp: '—' }
      : { url: query, title: 'YouTube Audio', timestamp: '—' };
  }

  try {
    const result = await yts(query);
    if (result?.videos?.length) return result.videos[0];
  } catch (error) {
    console.log('[song] Search error:', error.message);
  }

  try {
    if (typeof ytMusic.searchMusics === 'function') {
      const tracks = await ytMusic.searchMusics(query);
      const track = Array.isArray(tracks) ? tracks.find(item => item?.youtubeId) : null;
      if (track) {
        return {
          url: `https://www.youtube.com/watch?v=${track.youtubeId}`,
          title: track.title || 'YouTube Audio',
          thumbnail: track.thumbnail?.url || track.thumbnail || null,
          timestamp: track.duration?.label || '—'
        };
      }
    }
  } catch (error) {
    console.log('[song] Music search error:', error.message);
  }
  return null;
}

function downloadToFile(videoUrl, outputTemplate) {
  return new Promise((resolve, reject) => {
    const binary = path.join(process.cwd(), 'bin', 'yt-dlp');
    if (!fs.existsSync(binary)) return reject(new Error('yt-dlp binary missing in /home/container/bin/'));

    const cookieFile = path.join(process.cwd(), 'cookies.txt');
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--js-runtimes', 'node',
      '--remote-components', 'ejs:github',
      '-f', 'bestaudio[ext=m4a]/bestaudio',
      '--max-filesize', '15M',
      '--match-filter', 'duration <= 600',
      '--concurrent-fragments', '1',
      '--output', outputTemplate
    ];
    if (fs.existsSync(cookieFile)) args.push('--cookies', cookieFile);
    args.push(videoUrl);

    const child = spawn(binary, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=96' }
    });

    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);

    child.stderr.on('data', chunk => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on('error', error => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      if (code !== 0) return reject(new Error(stderr.slice(-1800) || `yt-dlp exit ${code}`));
      resolve();
    });
  });
}

async function songCommand(sock, chatId, message) {
  if (songBusy) {
    await sock.sendMessage(chatId, { text: '⏳ অন্য একটি গান ডাউনলোড হচ্ছে। একটু পরে আবার চেষ্টা করুন।' }, { quoted: message });
    return;
  }

  songBusy = true;
  let outputFile = null;

  try {
    const raw = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const query = raw.replace(/^\\.(?:play|song|mp3|ytmp3)\\s*/i, '').trim();
    if (!query) {
      await sock.sendMessage(chatId, { text: 'ব্যবহার: .play গানের নাম অথবা YouTube link' }, { quoted: message });
      return;
    }

    const video = await resolveVideoInfo(query);
    if (!video?.url) {
      await sock.sendMessage(chatId, { text: 'কোনো গান পাওয়া যায়নি।' }, { quoted: message });
      return;
    }

    await sock.sendMessage(chatId, {
      text: `🎵 Downloading: *${video.title || 'YouTube Audio'}*\\n⏱ Duration: ${video.timestamp || '—'}`
    }, { quoted: message });

    const tempDir = path.join(process.cwd(), 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    const base = path.join(tempDir, `mah_song_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const outputTemplate = `${base}.%(ext)s`;

    await downloadToFile(video.url, outputTemplate);

    const candidates = fs.readdirSync(tempDir)
      .filter(name => name.startsWith(path.basename(base) + '.'))
      .map(name => path.join(tempDir, name))
      .filter(file => fs.statSync(file).isFile());

    if (!candidates.length) throw new Error('ডাউনলোড করা অডিও ফাইল পাওয়া যায়নি।');

    outputFile = candidates[0];
    const stat = fs.statSync(outputFile);
    if (!stat.size || stat.size > 15 * 1024 * 1024) {
      throw new Error('অডিও ফাইল খালি অথবা ১৫ MB-এর বেশি।');
    }

    const ext = path.extname(outputFile).toLowerCase();
    const mime = ext === '.m4a' ? 'audio/mp4' : ext === '.webm' ? 'audio/webm' : ext === '.opus' || ext === '.ogg' ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
    const safeTitle = String(video.title || 'song').replace(/[^\\w\\s-]/g, '').trim().slice(0, 80) || 'song';

    await sock.sendMessage(chatId, {
      audio: { url: outputFile },
      mimetype: mime,
      fileName: `${safeTitle}${ext}`,
      ptt: false
    }, { quoted: message });

    console.log(`[song] Sent file from disk (${stat.size} bytes)`);
  } catch (error) {
    console.error('[song] Command failed:', error.message);
    await sock.sendMessage(chatId, {
      text: error.message?.includes('Sign in to confirm')
        ? '❌ YouTube download block করেছে। cookies.txt সঠিকভাবে আপলোড করা আছে কি না দেখুন।'
        : '❌ গান ডাউনলোড করা যায়নি। YouTube বা downloader error হয়েছে।'
    }, { quoted: message });
  } finally {
    if (outputFile) {
      try { fs.unlinkSync(outputFile); } catch {}
    }
    songBusy = false;
  }
}

module.exports = songCommand;
