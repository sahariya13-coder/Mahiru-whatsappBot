const crypto = require('crypto');
const API_BASE = String(process.env.MAHIRU_AI_API_URL || 'https://mahiru-ai-eight.vercel.app').replace(/\/+$/, '');
const TIMEOUT = 120000;
function makeUid(value) { return crypto.createHash('sha256').update(String(value || 'whatsapp-default')).digest('hex').slice(0, 32); }
async function requestJson(endpoint, body) {
  const response = await fetch(API_BASE + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || data.message || 'Mahiru AI API HTTP ' + response.status);
  return data;
}
async function chatWithMahiruAI({ uid, text, system = '' }) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Missing text');
  const data = await requestJson('/api/chat', { uid: makeUid(uid), messages: [...(system ? [{ role: 'system', content: String(system) }] : []), { role: 'user', content: clean }] });
  const reply = String(data.reply || data.answer || data.response || '').trim();
  if (!reply) throw new Error('Mahiru AI API returned no reply');
  return reply;
}
async function transcribeWithMahiruAI(buffer, mimeType = 'audio/ogg') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Voice audio is empty');
  if (buffer.length > 3 * 1024 * 1024) throw new Error('Voice file exceeds Mahiru AI API 3 MB limit');
  const data = await requestJson('/api/stt', { audio_base64: buffer.toString('base64'), mime_type: String(mimeType || 'audio/ogg').split(';')[0] });
  const transcript = String(data.text || '').trim();
  if (!transcript) throw new Error('Mahiru AI API returned an empty transcription');
  return transcript;
}
async function synthesizeWithMahiruAI(text, voice = 'Aoede') {
  const response = await fetch(API_BASE + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' }, body: JSON.stringify({ text: String(text || ''), voice }), signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || data.message || 'Mahiru TTS API HTTP ' + response.status); }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error('Mahiru TTS API returned empty audio');
  return { audio, mimeType: response.headers.get('content-type') || 'audio/wav' };
}
module.exports = { API_BASE, makeUid, chatWithMahiruAI, transcribeWithMahiruAI, synthesizeWithMahiruAI };
