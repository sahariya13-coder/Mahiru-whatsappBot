const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'userGroupData.json');
const LEGACY_FILE = path.join(DATA_DIR, 'groupAccess.json');

function readData() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            users: [],
            groups: [],
            groupActivation: { active: [] }
        }, null, 2));
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // One-time migration from the old groupAccess.json file.
    if (!data.groupActivation || !Array.isArray(data.groupActivation.active)) {
        let oldActive = [];

        try {
            if (fs.existsSync(LEGACY_FILE)) {
                const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
                if (Array.isArray(legacy.active)) oldActive = legacy.active;
            }
        } catch (error) {
            console.error('[GroupAccess] Legacy migration read error:', error);
        }

        data.groupActivation = {
            active: [...new Set(oldActive.filter(id =>
                typeof id === 'string' && id.endsWith('@g.us')
            ))]
        };

        writeData(data);
        console.log('[GroupAccess] Migrated legacy activation data.');
    }

    return data;
}

function writeData(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const tempFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
}

module.exports = {
    isActive(id) {
        if (typeof id !== 'string' || !id.endsWith('@g.us')) return false;

        try {
            const data = readData();
            return data.groupActivation.active.includes(id);
        } catch (error) {
            console.error('[GroupAccess] Activation check error:', error);
            return false;
        }
    },

    setActive(id, active) {
        if (typeof id !== 'string' || !id.endsWith('@g.us')) {
            throw new Error('Invalid WhatsApp group ID');
        }

        const data = readData();
        const groups = new Set(data.groupActivation.active);

        if (active === true) {
            groups.add(id);
        } else {
            groups.delete(id);
        }

        data.groupActivation.active = [...groups];
        writeData(data);

        const saved = data.groupActivation.active.includes(id) === (active === true);
        console.log(
            '[GroupAccess] ' + id + ': ' + (active ? 'ACTIVE' : 'INACTIVE')
        );

        return saved;
    }
};
