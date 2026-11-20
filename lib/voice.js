const fs = require('fs');
const path = require('path');
const axios = require('axios');
const gTTS = require('gtts');
const googleTTS = require('@sefinek/google-tts-api');
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

                if (status === 401) break;
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

// Gemini TTS generates expressive, natural-sounding speech. If unavailable,
// retain the existing Google TTS providers as a compatibility fallback.
async function makeTTS(text, fileBase, language) {
    const apiKeys = [
        process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_2 || ''
    ].filter((key, index, all) => key && all.indexOf(key) === index);

    let lastGeminiError;
    for (let index = 0; index < apiKeys.length; index++) {
        try {
            console.log(`🗣️ Natural voice generation: Gemini 3.8 Flash TTS (key ${index + 1})`);
            const response = await axios.post(
                'https://generativelanguage.googleapis.com/v1beta/interactions',
                {
                    model: 'gemini-3.8-flash-tts',
                    input: [{
                        type: 'user_input',
                        content: [{
                            type: 'text',
                            text,
                            annotations: [{
                                type: 'speech_metadata',
                                style: language === 'bn'
                                    ? 'Speak fluent, natural conversational Bangla with a warm, friendly young adult female voice. Use authentic Bangladeshi Bengali pronunciation and intonation, smooth connected speech, human-like rhythm, subtle natural pauses, and gentle emotional expression. Do not sound robotic, overly formal, or like a newsreader. Read the text exactly; do not translate, add, or omit words.'
                                    : 'Speak in a warm, natural, friendly young adult female conversational voice. Use human-like rhythm, expressive intonation, smooth connected speech, and subtle natural pauses. Do not sound robotic, overly formal, or like a newsreader. Read the text exactly; do not add or omit words.'
                            }]
                        }]
                    }],
                    response_format: { type: 'audio' },
                    generation_config: {
                        speech_config: [{ voice: 'Kore' }]
                    }
                },
                {
                    headers: {
                        'x-goog-api-key': apiKeys[index],
                        'Content-Type': 'application/json'
                    },
                    timeout: 120000,
                    maxBodyLength: Infinity
                }
            );

            const audioData = response.data?.output_audio?.data;
            if (!audioData) {
                throw new Error('Gemini TTS response did not contain output_audio.data');
            }

            const audioBuffer = Buffer.from(audioData, 'base64');
            if (!audioBuffer.length) throw new Error('Gemini TTS returned empty audio');

            const mimeType = String(response.data?.output_audio?.mime_type || 'audio/wav').toLowerCase();
            const extension = mimeType.includes('ogg') ? '.ogg'
                : mimeType.includes('mpeg') || mimeType.includes('mp3') ? '.mp3'
                : mimeType.includes('l16') || mimeType.includes('pcm') ? '.pcm'
                : '.wav';
            const filePath = fileBase + extension;
            fs.writeFileSync(filePath, audioBuffer);
            console.log(`✅ Gemini natural voice generated (${mimeType}).`);
            return { filePath, mimeType };
        } catch (error) {
            lastGeminiError = error;
            const status = error.response?.status;
            const detail = error.response?.data?.error?.message || error.message;
            console.error(`⚠️ Gemini TTS key ${index + 1} failed (${status || 'network'}): ${detail}`);
            if (status === 401) break;
        }
    }

    console.warn('⚠️ Gemini TTS unavailable; using standard TTS fallback:',
        lastGeminiError?.response?.data?.error?.message || lastGeminiError?.message || 'No Gemini API key');

    const fallbackPath = fileBase + '.mp3';
    if (language === 'bn') {
        const parts = await googleTTS.getAllAudioBase64(text, {
            lang: 'bn',
            slow: false,
            host: 'https://translate.google.com',
            timeout: 30000
        });

        if (!Array.isArray(parts) || !parts.length) {
            throw new Error('Bengali TTS returned no audio segments');
        }

        const audioBuffers = parts.map(part => Buffer.from(part.base64, 'base64'));
        const audioBuffer = Buffer.concat(audioBuffers);
        if (!audioBuffer.length) throw new Error('Bengali TTS returned empty audio');
        fs.writeFileSync(fallbackPath, audioBuffer);
    } else {
        await new Promise((resolve, reject) => {
            const tts = new gTTS(text, language);
            tts.save(fallbackPath, error => error ? reject(error) : resolve());
        });
    }

    return { filePath: fallbackPath, mimeType: 'audio/mpeg' };
}

async function sendVoiceReply(sock, chatId, text, quotedMessage) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const language = /[\u0980-\u09FF]/.test(cleanText) ? 'bn' : 'en';
    const fileBase = path.join(TEMP_DIR, 'mahiru-voice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    const oggPath = fileBase + '-whatsapp.ogg';
    let generatedPath = '';
    let outgoingPath = '';
    let isPtt = false;

    try {
        const generated = await makeTTS(cleanText, fileBase, language);
        generatedPath = generated.filePath;
        if (!fs.existsSync(generatedPath) || fs.statSync(generatedPath).size === 0) {
            throw new Error('TTS generated an empty audio file');
        }

        // WhatsApp voice notes must be OGG/Opus. Convert WAV/MP3/PCM safely.
        try {
            const { execFile } = require('child_process');
            const { promisify } = require('util');
            const execFileAsync = promisify(execFile);
            await execFileAsync('ffmpeg', [
                '-y', '-i', generatedPath, '-vn',
                '-ac', '1', '-ar', '48000',
                '-c:a', 'libopus', '-b:a', '48k',
                '-application', 'voip', '-compression_level', '10',
                '-f', 'ogg', oggPath
            ], { timeout: 90000, windowsHide: true });

            if (!fs.existsSync(oggPath) || fs.statSync(oggPath).size === 0) {
                throw new Error('FFmpeg generated an empty OGG/Opus file');
            }
            outgoingPath = oggPath;
            isPtt = true;
            console.log('🎙️ Natural voice converted to OGG/Opus WhatsApp PTT.');
        } catch (conversionError) {
            console.warn('⚠️ FFmpeg/Opus conversion unavailable:', conversionError.message);
            if (generated.mimeType === 'audio/mpeg' || generated.mimeType.includes('mp3')) {
                outgoingPath = generatedPath;
            } else {
                throw new Error('Cannot safely send generated TTS audio without FFmpeg: ' + conversionError.message);
            }
        }

        await sock.sendMessage(chatId, {
            audio: { url: outgoingPath },
            mimetype: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
            ptt: isPtt
        }, quotedMessage ? { quoted: quotedMessage } : {});
    } finally {
        for (const filePath of [generatedPath, oggPath]) {
            if (!filePath) continue;
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
