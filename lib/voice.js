const fs = require('fs');
const path = require('path');
const axios = require('axios');
const gTTS = require('gtts');
const googleTTS = require('@sefinek/google-tts-api');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const FormData = require('form-data');

const TEMP_DIR = path.join(process.cwd(), 'temp');
const VOICE_MODELS = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const GROQ_STT_MODEL = 'whisper-large-v3';

async function collectAudioStream(audioMessage) {
    const stream = await downloadContentFromMessage(audioMessage, 'audio');
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function transcribeAudio(audioMessage) {
    const apiKeys = [
        process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_2 || '',
        process.env.GEMINI_API_KEY_3 || '',
        process.env.GEMINI_API_KEY_4 || '',
        process.env.GEMINI_API_KEY_5 || ''
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

    // Groq Whisper is the independent multilingual fallback after Gemini.
    const groqKeys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3, process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5].filter((key, index, all) => key && all.indexOf(key) === index);
    if (groqKeys.length && audioBuffer.length <= 25 * 1024 * 1024) {
      for (let groqIndex = 0; groqIndex < groqKeys.length; groqIndex++) {
        const groqKey = groqKeys[groqIndex];
        try {
            const form = new FormData();
            const extension = mimeType.includes('ogg') ? 'ogg'
                : mimeType.includes('wav') ? 'wav'
                : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
                : mimeType.includes('mp4') ? 'mp4'
                : 'audio';
            form.append('file', audioBuffer, {
                filename: 'mahiru-voice.' + extension,
                contentType: mimeType
            });
            form.append('model', GROQ_STT_MODEL);
            form.append('response_format', 'json');
            form.append('temperature', '0');

            console.log('🎙️ Voice transcription: Groq API key ' + (groqIndex + 1), GROQ_STT_MODEL);
            const response = await axios.post(
                'https://api.groq.com/openai/v1/audio/transcriptions',
                form,
                {
                    headers: {
                        Authorization: `Bearer ${groqKey}`,
                        ...form.getHeaders()
                    },
                    timeout: 90000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                }
            );
            const transcript = String(response.data?.text || '').trim();
            if (transcript) {
                console.log('✅ Groq Whisper transcription succeeded.');
                return transcript;
            }
            lastError = new Error('Groq Whisper returned an empty transcription');
        } catch (error) {
            lastError = error;
            console.error('❌ Groq Whisper API key ' + (groqIndex + 1) + ' failed:', error.response?.data?.error?.message || error.message);
        }
      }
    } else if (groqKeys.length && audioBuffer.length > 25 * 1024 * 1024) {
        console.warn('⚠️ Groq Whisper skipped: audio exceeds the 25 MB Free-tier upload limit.');
    }

    throw new Error('All Gemini and Groq voice transcription attempts failed: ' +
        (lastError?.response?.data?.error?.message || lastError?.message || 'Unknown error'));
}

// Gemini TTS generates expressive, natural-sounding speech. If unavailable,
// retain the existing Google TTS providers as a compatibility fallback.
async function makeTTS(text, fileBase, language) {
    const apiKeys = [
        process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_2 || '',
        process.env.GEMINI_API_KEY_3 || '',
        process.env.GEMINI_API_KEY_4 || '',
        process.env.GEMINI_API_KEY_5 || ''
    ].filter((key, index, all) => key && all.indexOf(key) === index);

    const ttsModels = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
    let lastGeminiError;

    for (let index = 0; index < apiKeys.length; index++) {
        for (const model of ttsModels) {
            try {
                console.log(`🗣️ Natural voice generation: ${model} (key ${index + 1})`);
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                    {
                        contents: [{
                            role: 'user',
                            parts: [{
                                text: [
                                    'Read the text below aloud as a real person speaking naturally in a casual one-to-one conversation.',
                                    'Use a warm, friendly, expressive human voice. Avoid robotic, flat, mechanical, announcer-like, or exaggerated delivery.',
                                    'Use natural conversational rhythm, varied intonation, realistic phrasing, and short pauses only where punctuation or meaning calls for them.',
                                    'Pronounce Bangla with natural Bangladeshi Bengali pronunciation. If Bangla and English are mixed, switch pronunciation naturally for each language instead of forcing one accent.',
                                    'Do not translate, paraphrase, explain, repeat, or add any words. Speak only the exact text between the markers.',
                                    'TEXT TO SPEAK:',
                                    '<<<',
                                    text,
                                    '>>>'
                                ].join('\\n')
                            }]
                        }],
                        generationConfig: {
                            responseModalities: ['AUDIO'],
                            speechConfig: {
                                // Let Gemini detect Bangla, English, or mixed-language text.
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || 'Aoede' }
                                }
                            }
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

                const audioPart = (response.data?.candidates?.[0]?.content?.parts || [])
                    .find(part => part.inlineData?.data || part.inline_data?.data);
                const audioData = audioPart?.inlineData?.data || audioPart?.inline_data?.data;
                if (!audioData) {
                    const blockReason = response.data?.promptFeedback?.blockReason;
                    throw new Error(blockReason
                        ? 'Gemini TTS response blocked: ' + blockReason
                        : 'Gemini TTS response did not contain audio data');
                }

                const audioBuffer = Buffer.from(audioData, 'base64');
                if (!audioBuffer.length) throw new Error('Gemini TTS returned empty audio');

                const mimeType = String(
                    audioPart?.inlineData?.mimeType ||
                    audioPart?.inline_data?.mime_type ||
                    'audio/wav'
                ).toLowerCase();
                const extension = mimeType.includes('ogg') ? '.ogg'
                    : mimeType.includes('mpeg') || mimeType.includes('mp3') ? '.mp3'
                    : mimeType.includes('l16') || mimeType.includes('pcm') ? '.pcm'
                    : '.wav';
                const filePath = fileBase + extension;
                fs.writeFileSync(filePath, audioBuffer);
                console.log(`✅ Gemini TTS generated audio with ${model} (${mimeType}).`);
                return { filePath, mimeType };
            } catch (error) {
                lastGeminiError = error;
                const status = error.response?.status;
                const detail = error.response?.data?.error?.message || error.message;
                console.error(`⚠️ Gemini TTS ${model}, key ${index + 1} failed (${status || 'network'}): ${detail}`);
                if (status === 401 || status === 403) break;
            }
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
    let outgoingMimeType = '';
    let isPtt = false;

    try {
        const generated = await makeTTS(cleanText, fileBase, language);
        generatedPath = generated.filePath;
        outgoingMimeType = generated.mimeType || 'audio/wav';
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
            outgoingMimeType = 'audio/ogg; codecs=opus';
            isPtt = true;
            console.log('🎙️ Natural voice converted to OGG/Opus WhatsApp PTT.');
        } catch (conversionError) {
            console.warn('⚠️ FFmpeg/Opus conversion unavailable:', conversionError.message);
            // If FFmpeg is unavailable, send the original WAV/MP3 as a normal audio attachment.
            // This keeps TTS usable on hosts that do not include the FFmpeg binary.
            outgoingPath = generatedPath;
            outgoingMimeType = generated.mimeType || 'audio/wav';
            isPtt = false;
        }

        await sock.sendMessage(chatId, {
            audio: { url: outgoingPath },
            mimetype: outgoingMimeType || 'audio/wav',
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
