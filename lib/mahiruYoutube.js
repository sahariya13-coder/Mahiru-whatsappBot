const axios = require('axios');

const BASE_URL = String(
  process.env.MAHIRU_AI_API_URL || 'https://mahiru-shiina-ai.vercel.app'
).replace(/\/+$/, '');

const client = axios.create({
  timeout: 55000,
  headers: { Accept: 'application/json', 'User-Agent': 'Mahiru-WhatsApp-Bot' }
});

function objectsDeep(value, output = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) objectsDeep(item, output, seen);
  } else {
    output.push(value);
    for (const item of Object.values(value)) objectsDeep(item, output, seen);
  }
  return output;
}

function firstValue(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return null;
}

function normalizeDuration(value, objects = []) {
  const candidates = [value];
  for (const o of objects) for (const k of ['duration','length','lengthSeconds','durationSeconds','timestamp','durationText','duration_string']) if (o?.[k] != null) candidates.push(o[k]);
  for (const x of candidates) {
    if (typeof x === 'string' && x.trim()) {
      const t=x.trim();
      if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(t)) return t;
      if (/^\d+(?:\.\d+)?$/.test(t)) return fmtSec(Number(t));
    }
    if (typeof x === 'number' && Number.isFinite(x) && x>=0) return fmtSec(x);
    if (x && typeof x === 'object') {
      const t=x.timestamp||x.text||x.simpleText||x.formatted||x.display;
      if (typeof t==='string' && t.trim()) return normalizeDuration(t);
      const n=Number(x.seconds??x.totalSeconds??x.lengthSeconds??x.durationSeconds);
      if (Number.isFinite(n)&&n>=0) return fmtSec(n);
    }
  }
  return '—';
}
function fmtSec(n) { n=Math.floor(n); const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60; return h ? h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0') : m+':'+String(s).padStart(2,'0'); }
function normalizeViews(value, objects=[]) {
  const list=[value];
  for(const o of objects) for(const k of ['views','viewCount','view_count','viewCountText','view_count_text']) if(o?.[k]!=null) list.push(o[k]);
  for(const x of list) {
    const v=x&&typeof x==='object'?(x.text||x.simpleText||x.display||x.value||x.count):x;
    if(typeof v==='number'&&Number.isFinite(v)) return v;
    if(typeof v==='string'&&v.trim()) { const t=v.trim(); if(/\bviews?\b/i.test(t)||/[KMB]\b/i.test(t)) return t; const n=Number(t.replace(/,/g,'')); if(Number.isFinite(n)) return n; }
  }
  return null;
}

function normalizeVideo(item) {
  const objects = objectsDeep(item);
  const id = String(firstValue(objects, ['videoId', 'video_id', 'id', 'videoID']) || '');
  let url = firstValue(objects, ['url', 'videoUrl', 'video_url', 'link']);
  if (!url && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
    url = 'https://www.youtube.com/watch?v=' + id;
  }
  if (typeof url !== 'string' || !/youtube\.com|youtu\.be/i.test(url)) return null;

  const title = firstValue(objects, ['title', 'name']) || 'YouTube Video';
  const thumbnail =
    firstValue(objects, ['thumbnail', 'thumbnailUrl', 'thumbnail_url', 'image']) ||
    (id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : null);
  const rawDuration = firstValue(objects, ['timestamp', 'durationText', 'duration_string', 'duration', 'lengthSeconds', 'durationSeconds']);
  const duration = normalizeDuration(rawDuration, objects);
  const rawViews = firstValue(objects, ['views', 'viewCount', 'view_count', 'viewCountText', 'view_count_text']);
  const views = normalizeViews(rawViews, objects);

  return { id, url, title: String(title), thumbnail, timestamp: String(duration), views };
}

function findVideos(data) {
  const objects = objectsDeep(data);
  const found = [];
  const seen = new Set();

  for (const object of objects) {
    const normalized = normalizeVideo(object);
    if (!normalized) continue;
    const key = normalized.id || normalized.url;
    if (!seen.has(key)) {
      seen.add(key);
      found.push(normalized);
    }
  }
  return found;
}

async function search(query, type = 'video') {
  const { data } = await client.get(BASE_URL + '/api/search', {
    params: { q: query, type }
  });
  if (data?.success === false) throw new Error(data.error || 'YouTube search failed');
  const videos = findVideos(data);
  if (!videos.length) throw new Error('No YouTube search results found');
  return videos;
}

function extractYouTubeId(input) {
  const text = String(input || '').trim();
  const match =
    text.match(/(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i) ||
    text.match(/^([a-zA-Z0-9_-]{11})$/);
  return match?.[1] || null;
}

async function videoDetails(input) {
  const id = extractYouTubeId(input);
  if (!id) throw new Error('Invalid YouTube video ID');

  const { data } = await client.get(BASE_URL + '/api/video', { params: { id } });
  if (data?.success === false) throw new Error(data.error || 'Could not get video details');

  const video = findVideos(data)[0];
  if (!video) throw new Error('YouTube video details are unavailable');
  return video;
}

function findFormatObjects(data) {
  const objects = objectsDeep(data);
  const formats = [];
  const seen = new Set();

  for (const object of objects) {
    const url = firstValue([object], ['url', 'downloadUrl', 'download_url', 'directUrl', 'direct_url']);
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
    if (/youtube\.com\/(watch|shorts|embed)|youtu\.be\//i.test(url)) continue;
    if (!/(googlevideo\.com|\.mp4|\.m4a|\.webm|\.mp3|\.m4v)/i.test(url) &&
        !firstValue([object], ['mimeType', 'mime_type', 'quality', 'qualityLabel', 'audioQuality', 'itag'])) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    formats.push({ ...object, url });
  }
  return formats;
}

function formatText(format) {
  return [
    format.mimeType, format.mime_type, format.type, format.ext,
    format.quality, format.qualityLabel, format.audioQuality,
    format.format_note, format.format
  ].filter(Boolean).join(' ').toLowerCase();
}

function pickAudioFormat(formats) {
  return formats.find(f => /audio|mp3|m4a|opus/.test(formatText(f))) ||
    formats.find(f => f.audioOnly === true || f.audio_only === true || f.hasAudio === true) ||
    null;
}

function pickVideoFormat(formats) {
  const videos = formats.filter(f =>
    /video|mp4|webm/.test(formatText(f)) ||
    f.hasVideo === true || f.videoOnly === true || f.video_only === true
  );
  const score = f => {
    const match = formatText(f).match(/(2160|1440|1080|720|480|360|240|144)p?/);
    return match ? Number(match[1]) : 0;
  };
  videos.sort((a, b) => score(b) - score(a));
  return videos[0] || null;
}

async function getFormats(input) {
  const id = extractYouTubeId(input);
  const url = id ? 'https://www.youtube.com/watch?v=' + id : String(input || '').trim();
  if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
    throw new Error('Only YouTube URLs are supported');
  }

  const { data } = await client.get(BASE_URL + '/api/formats', { params: { url } });
  if (data?.success === false) throw new Error(data.error || 'YouTube formats request failed');

  const formats = findFormatObjects(data);
  if (!formats.length) throw new Error('No downloadable formats returned by YouTube API');

  return {
    raw: data,
    formats,
    audio: pickAudioFormat(formats),
    video: pickVideoFormat(formats),
    title: String(firstValue(objectsDeep(data), ['title', 'name']) || 'YouTube Media')
  };
}

module.exports = { BASE_URL, search, videoDetails, getFormats, extractYouTubeId };
