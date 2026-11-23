/**
 * Mahiru Shiina • Mahiru v2.0 ULTRA — Emoji Kitchen Mixer (Zero-Hardcoded-Key & EXIF Branded)
 * Usage: .emix 😎+🥰  or  .emojimix 😎 + 🥰
 * Optional ENV: TENOR_API_KEY (falls back to free Emoji Kitchen endpoint if unset)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const settings = require('../settings');

let webp = null;
try { webp = require('node-webpmux'); } catch {}

const execFileAsync = promisify(execFile);
const FETCH_TIMEOUT_MS = 12000;
const FFMPEG_TIMEOUT_MS = 20000;

function buildStickerExif(emojis = ['😎']) {
    const metadata = {
        'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
        'sticker-pack-name': settings.packname || 'Mahiru Shiina',
        'sticker-pack-publisher': settings.author || 'Mahiru Shiina',
        emojis
    };
    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const jsonBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    return exif;
}

async function fetchEmojiMixImage(emoji1, emoji2) {
    // ১. ENV-তে TENOR_API_KEY থাকলে অফিশিয়াল Tenor Emoji Kitchen API (সঠিক media_formats পাথসহ)
    const tenorKey = String(settings.tenorApiKey || process.env.TENOR_API_KEY || '').trim();
    if (tenorKey) {
        try {
            const url = `https://tenor.googleapis.com/v2/featured?key=${encodeURIComponent(tenorKey)}&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(`${emoji1}_${emoji2}`)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
            if (res.ok) {
                const data = await res.json();
                const first = data?.results?.[0];
                const pngUrl =
                    first?.media_formats?.png_transparent?.url ||
                    first?.media_formats?.tinygif?.url ||
                    first?.media_formats?.gif?.url ||
                    '';
                if (pngUrl) {
                    const imgRes = await fetch(pngUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
                    if (imgRes.ok) {
                        const buf = Buffer.from(await imgRes.arrayBuffer());
                        if (buf.length > 500) return buf;
                    }
                }
            }
        } catch {}
    }

    // ২. জিরো-কী ফ্রি Emoji Kitchen ফ্যালব্যাক (কোনো API কী ছাড়াই কাজ করবে)
    const publicUrls = [
        `https://emojik.vercel.app/s/${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}?size=512`,
        `https://emojik.vercel.app/s/${encodeURIComponent(emoji2)}_${encodeURIComponent(emoji1)}?size=512`
    ];

    for (const url of publicUrls) {
        try {
            const res = await fetch(url, {
                headers: { Accept: 'image/png,image/*;q=0.8' },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            const cType = String(res.headers.get('content-type') || '').toLowerCase();
            if (res.ok && cType.startsWith('image/')) {
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length > 500) return buf;
            }
        } catch {}
    }

    return null;
}

async function emojimixCommand(sock, chatId, msg) {
    const uid = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const tmpDir = path.join(os.tmpdir(), 'mahiru_emix');
    const tempFile = path.join(tmpDir, `emix_in_${uid}.png`);
    const outputFile = path.join(tmpDir, `emix_out_${uid}.webp`);

    try {
        const text =
            msg.message?.conversation?.trim() ||
            msg.message?.extendedTextMessage?.text?.trim() ||
            '';

        const argText = text.replace(/^\S+\s*/, '').trim();
        if (!argText) {
            await sock.sendMessage(chatId, { text: '🎴 উদাহরণ: `.emix 😎+🥰`' }, { quoted: msg });
            return;
        }

        if (!argText.includes('+')) {
            await sock.sendMessage(chatId, {
                text: '✳️ দুটি ইমোজির মাঝে *+* চিহ্ন দিন।\n\n📌 উদাহরণ: `.emix 😎+🥰`'
            }, { quoted: msg });
            return;
        }

        const [emoji1, emoji2] = argText.split('+').map((e) => e.trim()).filter(Boolean);
        if (!emoji1 || !emoji2) {
            await sock.sendMessage(chatId, { text: '❌ সঠিক দুটি ইমোজি দিন, যেমন: `.emix 🔥+😂`' }, { quoted: msg });
            return;
        }

        const imageBuffer = await fetchEmojiMixImage(emoji1, emoji2);
        if (!imageBuffer) {
            await sock.sendMessage(chatId, {
                text: '❌ এই দুটি ইমোজি মিক্স করা যাচ্ছে না! অন্য দুটি সাধারণ ইমোজি দিয়ে চেষ্টা করুন (যেমন: `.emix 😎+🥰`)।'
            }, { quoted: msg });
            return;
        }

        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(tempFile, imageBuffer);

        await execFileAsync(
            'ffmpeg',
            [
                '-y', '-i', tempFile,
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                '-c:v', 'libwebp',
                '-lossless', '0',
                '-quality', '85',
                outputFile
            ],
            { timeout: FFMPEG_TIMEOUT_MS }
        );

        if (!fs.existsSync(outputFile)) {
            throw new Error('Failed to create WebP sticker');
        }

        let stickerBuffer = fs.readFileSync(outputFile);

        // Mahiru Shiina স্টিকার প্যাক EXIF মেটাডেটা যুক্ত করা
        if (webp?.Image) {
            try {
                const img = new webp.Image();
                await img.load(stickerBuffer);
                img.exif = buildStickerExif([emoji1, emoji2]);
                stickerBuffer = await img.save(null);
            } catch {}
        }

        await sock.sendMessage(chatId, { sticker: stickerBuffer }, { quoted: msg });
    } catch (error) {
        console.error('Error in emojimix command:', error?.message || error);
        await sock.sendMessage(chatId, {
            text: '❌ ইমোজি মিক্স করা যায়নি! সঠিক ইমোজি দিয়ে চেষ্টা করুন।\nউদাহরণ: `.emix 😎+🥰`'
        }, { quoted: msg });
    } finally {
        try { fs.rmSync(tempFile, { force: true }); } catch {}
        try { fs.rmSync(outputFile, { force: true }); } catch {}
    }
}

module.exports = emojimixCommand;
