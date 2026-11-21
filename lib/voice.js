const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { transcribeWithMahiruAI, synthesizeWithMahiruAI } = require('./mahiruAI');
const TEMP_DIR = path.join(process.cwd(), 'temp');
async function collectAudioStream(audioMessage) {
  const stream = await downloadContentFromMessage(audioMessage, 'audio');
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function transcribeAudio(audioMessage) {
  const buffer = await collectAudioStream(audioMessage);
  if (!buffer.length) throw new Error('Downloaded voice message is empty');
  const transcript = await transcribeWithMahiruAI(buffer, String(audioMessage.mimetype || 'audio/ogg').split(';')[0]);
  console.log('✅ Mahiru AI API voice transcription received');
  return transcript;
}
async function sendVoiceReply(sock, chatId, text, quotedMessage) {
  const clean = String(text || '').trim();
  if (!clean) return;
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  const base = path.join(TEMP_DIR, 'mahiru-voice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  const wav = base + '.wav';
  const ogg = base + '-whatsapp.ogg';
  try {
    const generated = await synthesizeWithMahiruAI(clean, process.env.MAHIRU_TTS_VOICE || 'Aoede');
    fs.writeFileSync(wav, generated.audio);
    console.log('✅ Mahiru AI API generated natural voice');
    let outgoing = wav, mime = generated.mimeType || 'audio/wav', ptt = false;
    try {
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      await promisify(execFile)('ffmpeg', ['-y','-i',wav,'-vn','-ac','1','-ar','48000','-c:a','libopus','-b:a','48k','-application','voip','-compression_level','10','-f','ogg',ogg], { timeout: 90000, windowsHide: true });
      if (!fs.existsSync(ogg) || !fs.statSync(ogg).size) throw new Error('Empty OGG/Opus output');
      outgoing = ogg; mime = 'audio/ogg; codecs=opus'; ptt = true;
      console.log('🎙️ Natural voice converted to OGG/Opus WhatsApp PTT.');
    } catch (error) { console.warn('⚠️ FFmpeg/Opus conversion unavailable:', error.message); }
    await sock.sendMessage(chatId, { audio: { url: outgoing }, mimetype: mime, ptt }, quotedMessage ? { quoted: quotedMessage } : {});
  } finally {
    for (const file of [wav, ogg]) { try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (error) { console.error('Voice temp cleanup failed:', error.message); } }
  }
}
module.exports = { transcribeAudio, sendVoiceReply };
