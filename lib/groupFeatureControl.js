const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/userGroupData.json');

const FEATURES = {
    chatbot: 'chatbot',
    gai: 'chatbot',
    iai: 'chatbot',
    antilink: 'antilink',
    antitag: 'antitag',
    antibadword: 'antibadword',
    welcome: 'welcome',
    goodbye: 'goodbye'
};

function readData() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let data = {};
    if (fs.existsSync(DATA_FILE)) {
        try {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
        } catch (error) {
            throw new Error('userGroupData.json পড়া যায়নি: ' + error.message);
        }
    }

    for (const key of ['chatbot', 'antilink', 'antitag', 'antibadword', 'welcome', 'goodbye']) {
        if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) {
            data[key] = {};
        }
    }
    return data;
}

function saveData(data) {
    const tempFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
}

function setGroupFeature(groupId, featureName, enabled) {
    if (typeof groupId !== 'string' || !groupId.endsWith('@g.us')) {
        throw new Error('সঠিক WhatsApp Group ID দিন।');
    }
    const feature = FEATURES[String(featureName || '').toLowerCase()];
    if (!feature) {
        return { ok: false, supported: Object.keys(FEATURES).filter(key => !['gai', 'iai'].includes(key)) };
    }

    const data = readData();
    const old = data[feature][groupId];

    if (feature === 'chatbot') {
        // chatbot.js reads a boolean per group.
        data.chatbot[groupId] = enabled === true;
    } else if (feature === 'welcome') {
        data.welcome[groupId] = {
            ...(old && typeof old === 'object' ? old : {}),
            enabled: enabled === true
        };
    } else if (feature === 'goodbye') {
        data.goodbye[groupId] = {
            ...(old && typeof old === 'object' ? old : {}),
            enabled: enabled === true
        };
    } else {
        data[feature][groupId] = {
            ...(old && typeof old === 'object' ? old : {}),
            enabled: enabled === true,
            action: old?.action || 'delete'
        };
    }

    saveData(data);
    return { ok: true, feature, enabled: enabled === true };
}

module.exports = { setGroupFeature, FEATURES };
