const axios = require('axios');

const http = axios.create({
    timeout: 12000,
    headers: {
        'User-Agent': 'Mahiru-WhatsApp-Bot/1.0'
    }
});

const WEATHER_CODES = {
    0: 'আকাশ পরিষ্কার',
    1: 'প্রায় পরিষ্কার',
    2: 'আংশিক মেঘলা',
    3: 'মেঘলা',
    45: 'কুয়াশা',
    48: 'ঘন কুয়াশা',
    51: 'হালকা গুঁড়ি গুঁড়ি বৃষ্টি',
    53: 'মাঝারি গুঁড়ি গুঁড়ি বৃষ্টি',
    55: 'ঘন গুঁড়ি গুঁড়ি বৃষ্টি',
    56: 'হালকা জমাট গুঁড়ি বৃষ্টি',
    57: 'ঘন জমাট গুঁড়ি বৃষ্টি',
    61: 'হালকা বৃষ্টি',
    63: 'মাঝারি বৃষ্টি',
    65: 'ভারী বৃষ্টি',
    66: 'হালকা জমাট বৃষ্টি',
    67: 'ভারী জমাট বৃষ্টি',
    71: 'হালকা তুষারপাত',
    73: 'মাঝারি তুষারপাত',
    75: 'ভারী তুষারপাত',
    77: 'তুষারকণা',
    80: 'হালকা বৃষ্টির ঝাপটা',
    81: 'মাঝারি বৃষ্টির ঝাপটা',
    82: 'প্রবল বৃষ্টির ঝাপটা',
    85: 'হালকা তুষার ঝাপটা',
    86: 'ভারী তুষার ঝাপটা',
    95: 'বজ্রসহ বৃষ্টি',
    96: 'শিলাবৃষ্টিসহ বজ্রঝড়',
    99: 'প্রবল শিলাবৃষ্টিসহ বজ্রঝড়'
};

module.exports = async function (sock, chatId, message, city) {
    try {
        const cityName = String(city || '').trim();

        if (!cityName) {
            await sock.sendMessage(
                chatId,
                { text: 'ব্যবহার: .weather Dhaka\nশহরের নাম লিখে আবার চেষ্টা করুন।' },
                { quoted: message }
            );
            return;
        }

        // Open-Meteo geocoding is free and does not require an API key.
        const geoResponse = await http.get(
            'https://geocoding-api.open-meteo.com/v1/search',
            {
                params: {
                    name: cityName,
                    count: 1,
                    language: 'en',
                    format: 'json'
                }
            }
        );

        const place = geoResponse.data?.results?.[0];

        if (!place) {
            await sock.sendMessage(
                chatId,
                { text: 'শহরটি খুঁজে পাওয়া যায়নি। ইংরেজি বানানে শহরের নাম লিখুন।' },
                { quoted: message }
            );
            return;
        }

        const weatherResponse = await http.get(
            'https://api.open-meteo.com/v1/forecast',
            {
                params: {
                    latitude: place.latitude,
                    longitude: place.longitude,
                    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
                    timezone: 'auto'
                }
            }
        );

        const current = weatherResponse.data?.current;

        if (!current || typeof current.temperature_2m !== 'number') {
            throw new Error('Weather provider returned incomplete current-weather data.');
        }

        const condition = WEATHER_CODES[current.weather_code] || 'তথ্য পাওয়া যায়নি';
        const temp = Math.round(current.temperature_2m * 10) / 10;
        const feelsLike = Math.round(current.apparent_temperature * 10) / 10;
        const humidity = current.relative_humidity_2m;
        const wind = current.wind_speed_10m;
        const precipitation = current.precipitation;

        const weatherText = [
            `আবহাওয়া: ${place.name}${place.admin1 ? ', ' + place.admin1 : ''}, ${place.country}`,
            `অবস্থা: ${condition}`,
            `তাপমাত্রা: ${temp}°C`,
            `অনুভূত হচ্ছে: ${feelsLike}°C`,
            `আর্দ্রতা: ${humidity}%`,
            `বাতাসের গতি: ${wind} km/h`,
            `বৃষ্টিপাত: ${precipitation} mm`,
            '',
            'তথ্যসূত্র: Open-Meteo'
        ].join('\n');

        await sock.sendMessage(chatId, { text: weatherText }, { quoted: message });
    } catch (error) {
        const status = error.response?.status;
        const providerMessage = error.response?.data?.reason || error.response?.data?.message;

        console.error('[WEATHER] Request failed:', {
            status: status || 'NETWORK_ERROR',
            message: providerMessage || error.message
        });

        let userMessage = 'দুঃখিত, এই মুহূর্তে আবহাওয়ার তথ্য পাওয়া যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।';

        if (error.code === 'ECONNABORTED') {
            userMessage = 'আবহাওয়া সার্ভারে সংযোগ পেতে সময় বেশি লাগছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
        } else if (status === 429) {
            userMessage = 'আবহাওয়ার অনুরোধের সীমা পূর্ণ হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
        } else if (status === 404) {
            userMessage = 'শহরের আবহাওয়ার তথ্য পাওয়া যায়নি। শহরের নামের বানান পরীক্ষা করুন।';
        }

        try {
            await sock.sendMessage(chatId, { text: userMessage }, { quoted: message });
        } catch (sendError) {
            console.error('[WEATHER] Failed to send error message:', sendError.message);
        }
    }
};
