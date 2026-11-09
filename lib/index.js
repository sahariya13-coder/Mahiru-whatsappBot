
const fs = require('fs');
const path = require('path');

const DEFAULT_WELCOME = `🎉 Welcome to the {Group}! 💗

🌸 স্বাগতম {user}!

🌸 সবাইকে সম্মান করবে।
🚫 কোনো Spam বা অশালীন আচরণ করা যাবে না।
⚠️ Group-এর Rules মেনে চলবে।

🥰 Stay Active & Enjoy! ❤️`;

// Load user and group data
function loadUserGroupData() {
    try {
        const dataPath = path.join(__dirname, '../data/userGroupData.json');
        const dir = path.dirname(dataPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(dataPath)) {
            const defaultData = {
                antibadword: {},
                antilink: {},
                antitag: {},
                welcome: {},
                goodbye: {},
                chatbot: {},
                warnings: {},
                sudo: []
            };

            fs.writeFileSync(dataPath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }

        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        const defaults = {
            antibadword: {},
            antilink: {},
            antitag: {},
            welcome: {},
            goodbye: {},
            chatbot: {},
            warnings: {},
            sudo: []
        };

        for (const key of Object.keys(defaults)) {
            if (!data[key]) data[key] = defaults[key];
        }

        return data;

    } catch (error) {
        console.error('Error loading user group data:', error);

        return {
            antibadword: {},
            antilink: {},
            antitag: {},
            welcome: {},
            goodbye: {},
            chatbot: {},
            warnings: {},
            sudo: []
        };
    }
}

// Save user and group data
function saveUserGroupData(data) {
    try {
        const dataPath = path.join(__dirname, '../data/userGroupData.json');
        const dir = path.dirname(dataPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

        return true;

    } catch (error) {
        console.error('Error saving user group data:', error);
        return false;
    }
}

// ANTILINK
async function setAntilink(groupId, type, action) {
    try {
        const data = loadUserGroupData();

        data.antilink[groupId] = {
            enabled: type === 'on',
            action: action || 'delete'
        };

        return saveUserGroupData(data);
    } catch (error) {
        console.error('Error setting antilink:', error);
        return false;
    }
}

async function getAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();

        if (!data.antilink[groupId]) return null;

        return type === 'on' ? data.antilink[groupId] : null;
    } catch (error) {
        console.error('Error getting antilink:', error);
        return null;
    }
}

async function removeAntilink(groupId) {
    try {
        const data = loadUserGroupData();

        delete data.antilink[groupId];

        return saveUserGroupData(data);
    } catch (error) {
        console.error('Error removing antilink:', error);
        return false;
    }
}

// ANTITAG
async function setAntitag(groupId, type, action) {
    try {
        const data = loadUserGroupData();

        data.antitag[groupId] = {
            enabled: type === 'on',
            action: action || 'delete'
        };

        return saveUserGroupData(data);
    } catch (error) {
        console.error('Error setting antitag:', error);
        return false;
    }
}

async function getAntitag(groupId, type) {
    try {
        const data = loadUserGroupData();

        if (!data.antitag[groupId]) return null;

        return type === 'on' ? data.antitag[groupId] : null;
    } catch (error) {
        console.error('Error getting antitag:', error);
        return null;
    }
}

async function removeAntitag(groupId) {
    try {
        const data = loadUserGroupData();

        delete data.antitag[groupId];

        return saveUserGroupData(data);
    } catch (error) {
        console.error('Error removing antitag:', error);
        return false;
    }
}

// WARNINGS
async function incrementWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();

        if (!data.warnings[groupId]) {
            data.warnings[groupId] = {};
        }

        if (!data.warnings[groupId][userId]) {
            data.warnings[groupId][userId] = 0;
        }

        data.warnings[groupId][userId]++;

        saveUserGroupData(data);

        return data.warnings[groupId][userId];

    } catch (error) {
        console.error('Error incrementing warning count:', error);
        return 0;
    }
}

async function resetWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();

        if (data.warnings[groupId]) {
            data.warnings[groupId][userId] = 0;
            saveUserGroupData(data);
        }

        return true;

    } catch (error) {
        console.error('Error resetting warning count:', error);
        return false;
    }
}

// SUDO
async function isSudo(userId) {
    try {
        const data = loadUserGroupData();

        return data.sudo.includes(userId);
    } catch (error) {
        console.error('Error checking sudo:', error);
        return false;
    }
}

async function addSudo(userJid) {
    try {
        const data = loadUserGroupData();

        if (!data.sudo.includes(userJid)) {
            data.sudo.push(userJid);
        }

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error adding sudo:', error);
        return false;
    }
}

async function removeSudo(userJid) {
    try {
        const data = loadUserGroupData();

        data.sudo = data.sudo.filter(id => id !== userJid);

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error removing sudo:', error);
        return false;
    }
}

async function getSudoList() {
    try {
        const data = loadUserGroupData();

        return data.sudo;
    } catch (error) {
        console.error('Error getting sudo list:', error);
        return [];
    }
}

// WELCOME SYSTEM
async function addWelcome(jid, enabled, message) {
    try {
        const data = loadUserGroupData();

        const old = data.welcome[jid] || {};

        data.welcome[jid] = {
            enabled: enabled === true,
            message: message || old.message || DEFAULT_WELCOME
        };

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error adding welcome:', error);
        return false;
    }
}

async function delWelcome(jid) {
    try {
        const data = loadUserGroupData();

        const old = data.welcome[jid] || {};

        data.welcome[jid] = {
            enabled: false,
            message: old.message || DEFAULT_WELCOME
        };

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error disabling welcome:', error);
        return false;
    }
}

async function isWelcomeOn(jid) {
    try {
        const data = loadUserGroupData();

        // First-time groups have Welcome ON by default.
        if (!data.welcome[jid]) {
            return true;
        }

        return data.welcome[jid].enabled === true;

    } catch (error) {
        console.error('Error checking welcome:', error);
        return false;
    }
}

async function getWelcome(jid) {
    try {
        const data = loadUserGroupData();

        return data.welcome[jid]?.message || DEFAULT_WELCOME;

    } catch (error) {
        console.error('Error getting welcome:', error);
        return DEFAULT_WELCOME;
    }
}

// GOODBYE SYSTEM
async function addGoodbye(jid, enabled, message) {
    try {
        const data = loadUserGroupData();

        const old = data.goodbye[jid] || {};

        data.goodbye[jid] = {
            enabled: enabled === true,
            message: message || old.message || 'Goodbye {user} 👋'
        };

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error adding goodbye:', error);
        return false;
    }
}

async function delGoodBye(jid) {
    try {
        const data = loadUserGroupData();

        if (data.goodbye[jid]) {
            data.goodbye[jid].enabled = false;
        }

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error disabling goodbye:', error);
        return false;
    }
}

async function isGoodByeOn(jid) {
    try {
        const data = loadUserGroupData();

        return data.goodbye[jid]?.enabled === true;

    } catch (error) {
        console.error('Error checking goodbye:', error);
        return false;
    }
}

async function getGoodbye(jid) {
    try {
        const data = loadUserGroupData();

        return data.goodbye[jid]?.message || null;

    } catch (error) {
        console.error('Error getting goodbye:', error);
        return null;
    }
}

// ANTI BADWORD
async function setAntiBadword(groupId, type, action) {
    try {
        const data = loadUserGroupData();

        data.antibadword[groupId] = {
            enabled: type === 'on',
            action: action || 'delete'
        };

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error setting antibadword:', error);
        return false;
    }
}

async function getAntiBadword(groupId, type) {
    try {
        const data = loadUserGroupData();

        if (!data.antibadword[groupId]) return null;

        return type === 'on' ? data.antibadword[groupId] : null;

    } catch (error) {
        console.error('Error getting antibadword:', error);
        return null;
    }
}

async function removeAntiBadword(groupId) {
    try {
        const data = loadUserGroupData();

        delete data.antibadword[groupId];

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error removing antibadword:', error);
        return false;
    }
}

// CHATBOT
async function setChatbot(groupId, enabled) {
    try {
        const data = loadUserGroupData();

        data.chatbot[groupId] = {
            enabled: enabled
        };

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error setting chatbot:', error);
        return false;
    }
}

async function getChatbot(groupId) {
    try {
        const data = loadUserGroupData();

        return data.chatbot[groupId] || null;

    } catch (error) {
        console.error('Error getting chatbot:', error);
        return null;
    }
}

async function removeChatbot(groupId) {
    try {
        const data = loadUserGroupData();

        delete data.chatbot[groupId];

        return saveUserGroupData(data);

    } catch (error) {
        console.error('Error removing chatbot:', error);
        return false;
    }
}

module.exports = {
    setAntilink,
    getAntilink,
    removeAntilink,

    setAntitag,
    getAntitag,
    removeAntitag,

    incrementWarningCount,
    resetWarningCount,

    isSudo,
    addSudo,
    removeSudo,
    getSudoList,

    addWelcome,
    delWelcome,
    isWelcomeOn,
    getWelcome,

    addGoodbye,
    delGoodBye,
    isGoodByeOn,
    getGoodbye,

    setAntiBadword,
    getAntiBadword,
    removeAntiBadword,

    setChatbot,
    getChatbot,
    removeChatbot
};
