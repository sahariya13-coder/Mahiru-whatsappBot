const crypto = require('crypto');

const API_BASE = String(
  process.env.MAHIRU_AI_API_URL || 'https://mahiru-shiina-ai.vercel.app'
).replace(/\/+$/, '');

const TIMEOUT = 120000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function makeUid(value) {
  return crypto.createHash('sha256')
    .update(String(value || 'whatsapp-default'))
    .digest('hex')
    .slice(0, 32);
}

function errorToText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === 'object') {
    const direct = value.message || value.error_description || value.detail || value.reason;
    if (direct) return errorToText(direct);
    if (value.error) return errorToText(value.error);
    try { return JSON.stringify(value); } catch (_) { return '[Unserializable API error object]'; }
  }
  return String(value);
}

async function requestJson(endpoint, body) {
  let response;
  try {
    response = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT)
    });
  } catch (error) {
    throw new Error('Mahiru AI API network error at ' + endpoint + ': ' + errorToText(error));
  }

  const raw = await response.text().catch(() => '');
  let data = {};
  if (raw) {
    try { data = JSON.parse(raw); }
    catch (_) { data = { error: raw.slice(0, 1200) }; }
  }

  if (!response.ok || data.success === false) {
    const detail = errorToText(data.error || data.message || data.details);
    throw new Error(
      'Mahiru AI API ' + endpoint + ' failed (HTTP ' + response.status + ')' +
      (detail ? ': ' + detail : ': ' + (raw.slice(0, 500) || 'Empty response'))
    );
  }

  return data;
}

function normalizeImage(image) {
  if (!image) return null;

  const imageBase64 = String(image.data || '')
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
    .trim();
  const mimeType = String(image.mimeType || 'image/jpeg')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) {
    throw new Error('Unsupported image type: ' + mimeType);
  }

  if (!imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new Error('Invalid image data');
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');
  if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image must be smaller than or equal to 8 MB');
  }

  return { data: imageBase64, mimeType };
}

async function chatWithMahiruAI({ uid, text, system = '', image = null }) {
  const clean = String(text || '').trim().slice(0, 10000);
  const safeSystem = String(system || '').trim().slice(0, 8000);

  // Image requests use the dedicated /api/vision endpoint.
  // Text-only requests continue using /api/chat.
  if (image) {
    const normalizedImage = normalizeImage(image);
    const data = await requestJson('/api/vision', {
      image: normalizedImage.data,
      mimeType: normalizedImage.mimeType,
      prompt: clean || 'এই ছবিটি বিশ্লেষণ করে কী দেখা যাচ্ছে তা বর্ণনা করো। ছবিতে কোনো লেখা থাকলে সেটিও পড়ে বলো।',
      system: safeSystem
    });

    const reply = String(data.reply || data.answer || data.response || '').trim();
    if (!reply) throw new Error('Mahiru Vision API returned no reply');
    console.log('[MAHIRU VISION API]', JSON.stringify({
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      attempts: data.attempts || 0
    }));
    return reply;
  }

  if (!clean) throw new Error('Missing text');

  const data = await requestJson('/api/chat', {
    uid: makeUid(uid),
    messages: [
      ...(safeSystem ? [{ role: 'system', content: safeSystem }] : []),
      { role: 'user', content: clean }
    ]
  });

  const reply = String(data.reply || data.answer || data.response || '').trim();
  if (!reply) throw new Error('Mahiru AI API returned no reply');
  return reply;
}

async function transcribeWithMahiruAI(buffer, mimeType = 'audio/ogg') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Voice audio is empty');
  if (buffer.length > 3 * 1024 * 1024) throw new Error('Voice file exceeds Mahiru AI API 3 MB limit');

  const data = await requestJson('/api/stt', {
    audio_base64: buffer.toString('base64'),
    mime_type: String(mimeType || 'audio/ogg').split(';')[0]
  });

  const transcript = String(data.text || '').trim();
  if (!transcript) throw new Error('Mahiru AI API returned an empty transcription');
  return transcript;
}

async function synthesizeWithMahiruAI(text, voice = 'Aoede') {
  const response = await fetch(API_BASE + '/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/wav'
    },
    body: JSON.stringify({ text: String(text || ''), voice }),
    signal: AbortSignal.timeout(TIMEOUT)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || 'Mahiru TTS API HTTP ' + response.status);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error('Mahiru TTS API returned empty audio');
  return {
    audio,
    mimeType: response.headers.get('content-type') || 'audio/wav'
  };
}

module.exports = {
  API_BASE,
  makeUid,
  chatWithMahiruAI,
  transcribeWithMahiruAI,
  synthesizeWithMahiruAI
};
