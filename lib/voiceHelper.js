let downloadContentFromMessage;
try {
    ({ downloadContentFromMessage } = require('@whiskeysockets/baileys'));
} catch {
    ({ downloadContentFromMessage } = require('baileys'));
}

function getAudioMessage(message) {
    const msg = message?.message || {};
    return (
        msg.audioMessage ||
        msg.ephemeralMessage?.message?.audioMessage ||
        msg.viewOnceMessage?.message?.audioMessage ||
        null
    );
}

async function transcribeVoiceNote(message, apiKey, model = 'gemini-3.5-flash-lite') {
    const audioMsg = getAudioMessage(message);
    if (!audioMsg || !apiKey) return '';

    // ১. হোয়াটসঅ্যাপ থেকে ভয়েস নোট ডাউনলোড
    const stream = await downloadContentFromMessage(audioMsg, 'audio');
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const base64Audio = Buffer.concat(chunks).toString('base64');
    const mimeType = (audioMsg.mimetype || 'audio/ogg').split(';')[0].trim();

    const promptText = 'এই ভয়েস মেসেজে কী বলা হয়েছে তা হুবহু লেখো। কোনো অতিরিক্ত ব্যাখ্যা দিবে না, শুধু ইউজার যা বলেছে তাই লিখবে।';

    // ২. প্রথমে v1beta/interactions দিয়ে চেষ্টা
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                model,
                input: [
                    { type: 'text', text: promptText },
                    { type: 'audio', data: base64Audio, mime_type: mimeType }
                ]
            }),
            signal: AbortSignal.timeout(45000)
        });

        if (res.ok) {
            const data = await res.json();
            const text =
                data?.outputs?.filter(i => i.type === 'text').map(i => i.text).join('') ||
                data?.output_text || '';
            if (text.trim()) return text.trim();
        }
    } catch {}

    // ৩. ফলব্যাক হিসেবে স্ট্যান্ডার্ড generateContent API
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: promptText },
                            { inline_data: { mime_type: mimeType, data: base64Audio } }
                        ]
                    }]
                }),
                signal: AbortSignal.timeout(45000)
            }
        );

        if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
            if (text.trim()) return text.trim();
        }
    } catch (err) {
        console.error('Voice transcribe error:', err.message);
    }

    return '';
}

module.exports = { getAudioMessage, transcribeVoiceNote };
