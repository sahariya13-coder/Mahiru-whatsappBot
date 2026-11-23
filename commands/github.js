const fetch = require('node-fetch');
const moment = require('moment-timezone');

const REPOSITORY_API = 'https://api.github.com/repos/sahariya13-coder/Mahiru-whatsappBot';

async function githubCommand(sock, chatId, message) {
    try {
        const response = await fetch(REPOSITORY_API, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Mahiru-WhatsApp-Bot'
            },
            timeout: 15000
        });

        if (!response.ok) {
            throw new Error('GitHub API returned HTTP ' + response.status);
        }

        const repository = await response.json();
        const updatedAt = repository.updated_at
            ? moment(repository.updated_at).tz('Asia/Dhaka').format('DD/MM/YY - hh:mm A')
            : 'তথ্য পাওয়া যায়নি';

        const text = [
            '*乂 MAHIRU SHIINA 乂*',
            '',
            '✩ *Repository:* ' + (repository.full_name || 'Mahiru WhatsApp Bot'),
            '✩ *Description:* ' + (repository.description || 'WhatsApp Bot'),
            '✩ *Stars:* ' + Number(repository.stargazers_count || 0).toLocaleString('en-US'),
            '✩ *Forks:* ' + Number(repository.forks_count || 0).toLocaleString('en-US'),
            '✩ *Watchers:* ' + Number(repository.subscribers_count || 0).toLocaleString('en-US'),
            '✩ *Size:* ' + (Number(repository.size || 0) / 1024).toFixed(2) + ' MB',
            '✩ *Last Updated:* ' + updatedAt,
            '✩ *URL:* ' + (repository.html_url || 'https://github.com/sahariya13-coder/Mahiru-whatsappBot'),
            '',
            'Powered by MSK'
        ].join('\n');

        await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (error) {
        console.error('[GITHUB COMMAND] Failed to fetch repository:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ GitHub Repository-এর তথ্য আনা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।'
        }, { quoted: message });
    }
}

module.exports = githubCommand;
