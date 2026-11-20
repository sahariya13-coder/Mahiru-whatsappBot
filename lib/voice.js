const fs = require('fs');
const path = require('path');
const axios = require('axios');
const gTTS = require('gtts');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const TEMP_DIR = path.join(process.cwd(), 'temp');
const VOICE_MODELS = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

async function collectAudioStream(audioMessage) {
    const stream = await downloadContentFromMessage(audioMessage, 'audio');
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function transcribeAudio(audioMessage) {
    const apiKeys = [
        process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_2 || ''
    ].filter((key, index, all) => key && all.indexOf(key) === index);

    if (!apiKeys.length) {
        throw new Error('Neither GEMINI_API_KEY nor GEMINI_API_KEY_2 is configured');
    }

    const audioBuffer = await collectAudioStream(audioMessage);
    if (!audioBuffer.length) throw new Error('Downloaded voice message is empty');

    const mimeType = String(audioMessage.mimetype || 'audio/ogg')
        .split(';')[0]
        .trim();

    let lastError;
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
        const apiKey = apiKeys[keyIndex];
        for (const model of VOICE_MODELS) {
            try {
                console.log(`🎙️ Voice transcription: API key ${keyIndex + 1}, model ${model}`);
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
                    {
                        contents: [{
                            role: 'user',
                            parts: [
                                {
                                    text: 'Transcribe this WhatsApp voice message exactly. Detect whether it is Bangla, English, or mixed Bangla-English. Return only the spoken words as plain text. Do not translate, summarize, or add explanations.'
                                },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: audioBuffer.toString('base64')
                                    }
                                }
                            ]
                        }],
                        generationConfig: {
                            temperature: 0,
                            maxOutputTokens: 1024
                        }
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 90000,
                        maxBodyLength: Infinity
                    }
                );

                const parts = response.data?.candidates?.[0]?.content?.parts || [];
                const transcript = parts
                    .map(part => part.text || '')
                    .join('')
                    .trim();

                if (transcript) return transcript;
                lastError = new Error(`${model} returned an empty transcription`);
            } catch (error) {
                lastError = error;
                const status = error.response?.status;
                const detail = error.response?.data?.error?.message || error.message;
                console.error(`❌ Voice API key ${keyIndex + 1}, ${model} failed (${status || 'network'}): ${detail}`);

                // An invalid key cannot work with another model; move to the next key.
                if (status === 401) break;

                // Try the next model/key for model, quota, permission, and server errors.
                if (status === 400 || status === 403 || status === 404 || status === 429 ||
                    (status >= 500 && status <= 599) || !status) {
                    continue;
                }
            }
        }
    }

    throw new Error('All Gemini voice transcription attempts failed: ' +
        (lastError?.response?.data?.error?.message || lastError?.message || 'Unknown error'));
}

function makeTTS(text, filePath, language) {
    return new Promise((resolve, reject) => {
        const tts = new gTTS(text, language);
        tts.save(filePath, error => error ? reject(error) : resolve());
    });
}

async function sendVoiceReply(sock, chatId, text, quotedMessage) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const language = /[\u0980-\u09FF]/.test(cleanText) ? 'bn' : 'en';
    const fileBase = \`mahiru-voice-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
    const mp3Path = path.join(TEMP_DIR, \`\${fileBase}.mp3\`);
    const oggPath = path.join(TEMP_DIR, \`\${fileBase}.ogg\`);
    let outgoingPath = mp3Path;
    let isPtt = false;

    try {
        await makeTTS(cleanText, mp3Path, language);
        if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) {
            throw new Error('TTS generated an empty audio file');
        }

        // WhatsApp voice notes must be OGG/Opus. Never label an MP3 as PTT.
        try {
            const { execFile } = require('child_process');
            const { promisify } = require('util');
            const execFileAsync = promisify(execFile);
            await execFileAsync('ffmpeg', [
                '-y', '-i', mp3Path, '-vn',
                '-ac', '1', '-ar', '48000',
                '-c:a', 'libopus', '-b:a', '32k',
                '-application', 'voip', '-f', 'ogg', oggPath
            ], { timeout: 60000, windowsHide: true });

            if (!fs.existsSync(oggPath) || fs.statSync(oggPath).size === 0) {
                throw new Error('FFmpeg generated an empty OGG/Opus file');
            }
            outgoingPath = oggPath;
            isPtt = true;
            console.log('🎙️ Voice reply converted to OGG/Opus PTT.');
        } catch (conversionError) {
            console.warn('⚠️ FFmpeg/Opus conversion unavailable; sending playable MP3 audio instead:', conversionError.message);
        }

        await sock.sendMessage(chatId, {
            audio: { url: outgoingPath },
            mimetype: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
            ptt: isPtt
        }, quotedMessage ? { quoted: quotedMessage } : {});
    } finally {
        for (const filePath of [mp3Path, oggPath]) {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (error) {
                console.error('Voice temp cleanup failed:', error.message);
            }
        }
    }
}

module.exports = {
    transcribeAudio,
    sendVoiceReply
};
