const fs = require('fs');
const path = require('path');
const axios = require('axios');
const gTTS = require('gtts');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const TEMP_DIR = path.join(process.cwd(), 'temp');

async function collectAudioStream(audioMessage) {
    const stream = await downloadContentFromMessage(audioMessage, 'audio');
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function transcribeAudio(audioMessage) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    const audioBuffer = await collectAudioStream(audioMessage);
    if (!audioBuffer.length) throw new Error('Downloaded voice message is empty');

    const mimeType = String(audioMessage.mimetype || 'audio/ogg')
        .split(';')[0]
        .trim();

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
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

    if (!transcript) {
        throw new Error('Gemini returned an empty transcription');
    }

    return transcript;
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
    const filePath = path.join(
        TEMP_DIR,
        `mahiru-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`
    );

    try {
        await makeTTS(cleanText, filePath, language);
        await sock.sendMessage(chatId, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg',
            ptt: true
        }, quotedMessage ? { quoted: quotedMessage } : {});
    } finally {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (error) {
            console.error('Voice temp cleanup failed:', error.message);
        }
    }
}

module.exports = {
    transcribeAudio,
    sendVoiceReply
};
