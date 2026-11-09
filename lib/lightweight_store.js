const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', 'baileys_store.json');

let MAX_MESSAGES = 20;
try {
    const settings = require('../settings');
    if (Number.isInteger(settings.maxStoreMessages) && settings.maxStoreMessages > 0) {
        MAX_MESSAGES = settings.maxStoreMessages;
    }
} catch (error) {
    // Keep the default when settings are unavailable.
}

let saveTimer = null;
let isWriting = false;

const store = {
    messages: {},
    contacts: {},
    chats: {},

    readFromFile(filePath = STORE_FILE) {
        try {
            if (!fs.existsSync(filePath)) return;

            const raw = fs.readFileSync(filePath, 'utf8');
            if (!raw.trim()) return;

            const data = JSON.parse(raw);
            this.contacts = data.contacts && typeof data.contacts === 'object' ? data.contacts : {};
            this.chats = data.chats && typeof data.chats === 'object' ? data.chats : {};
            this.messages = data.messages && typeof data.messages === 'object' ? data.messages : {};
            this.cleanupData();

            console.log('[STORE] Loaded saved WhatsApp data.');
        } catch (error) {
            console.error('[STORE] Could not load saved data:', error.message);
        }
    },

    writeToFile(filePath = STORE_FILE) {
        if (isWriting) return false;
        isWriting = true;

        const tempFile = filePath + '.tmp-' + process.pid;
        try {
            fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });

            const data = JSON.stringify({
                contacts: this.contacts,
                chats: this.chats,
                messages: this.messages
            });

            // Write to a temporary file first so an interrupted write cannot
            // leave the main JSON file half-written.
            fs.writeFileSync(tempFile, data, 'utf8');
            fs.renameSync(tempFile, filePath);
            return true;
        } catch (error) {
            console.error('[STORE] Could not save data:', error.message);
            try {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            } catch (_) {}
            return false;
        } finally {
            isWriting = false;
        }
    },

    scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            this.writeToFile();
        }, 1000);

        if (typeof saveTimer.unref === 'function') saveTimer.unref();
    },

    cleanupData() {
        if (!this.messages || typeof this.messages !== 'object') {
            this.messages = {};
            return;
        }

        for (const jid of Object.keys(this.messages)) {
            const chatMessages = this.messages[jid];

            if (Array.isArray(chatMessages)) {
                this.messages[jid] = chatMessages.slice(-MAX_MESSAGES);
            } else if (chatMessages && typeof chatMessages === 'object') {
                this.messages[jid] = Object.values(chatMessages).slice(-MAX_MESSAGES);
            } else {
                delete this.messages[jid];
            }
        }
    },

    bind(ev) {
        ev.on('messages.upsert', ({ messages = [] }) => {
            for (const msg of messages) {
                const jid = msg?.key?.remoteJid;
                if (!jid) continue;

                if (!Array.isArray(this.messages[jid])) this.messages[jid] = [];
                this.messages[jid].push(msg);

                if (this.messages[jid].length > MAX_MESSAGES) {
                    this.messages[jid] = this.messages[jid].slice(-MAX_MESSAGES);
                }
            }
            if (messages.length) this.scheduleSave();
        });

        ev.on('contacts.update', contacts => {
            for (const contact of contacts || []) {
                if (!contact?.id) continue;
                const previous = this.contacts[contact.id] || {};
                this.contacts[contact.id] = {
                    ...previous,
                    id: contact.id,
                    name: contact.notify || contact.name || previous.name || ''
                };
            }
            if (contacts?.length) this.scheduleSave();
        });

        ev.on('contacts.upsert', contacts => {
            for (const contact of contacts || []) {
                if (!contact?.id) continue;
                this.contacts[contact.id] = {
                    ...(this.contacts[contact.id] || {}),
                    ...contact
                };
            }
            if (contacts?.length) this.scheduleSave();
        });

        ev.on('chats.set', ({ chats = [] } = {}) => {
            this.chats = {};
            for (const chat of chats) {
                if (!chat?.id) continue;
                this.chats[chat.id] = {
                    id: chat.id,
                    subject: chat.subject || '',
                    ...(chat.name ? { name: chat.name } : {})
                };
            }
            this.scheduleSave();
        });

        ev.on('chats.upsert', chats => {
            for (const chat of chats || []) {
                if (!chat?.id) continue;
                this.chats[chat.id] = {
                    ...(this.chats[chat.id] || {}),
                    ...chat
                };
            }
            if (chats?.length) this.scheduleSave();
        });

        ev.on('chats.update', chats => {
            for (const chat of chats || []) {
                if (!chat?.id) continue;
                this.chats[chat.id] = {
                    ...(this.chats[chat.id] || {}),
                    ...chat
                };
            }
            if (chats?.length) this.scheduleSave();
        });
    },

    async loadMessage(jid, id) {
        return this.messages[jid]?.find(message => message?.key?.id === id) || null;
    },

    getStats() {
        let totalMessages = 0;
        for (const chatMessages of Object.values(this.messages)) {
            if (Array.isArray(chatMessages)) totalMessages += chatMessages.length;
        }

        return {
            messages: totalMessages,
            contacts: Object.keys(this.contacts).length,
            chats: Object.keys(this.chats).length,
            maxMessagesPerChat: MAX_MESSAGES
        };
    }
};

// Flush pending data when Node.js is shutting down.
process.once('exit', () => {
    if (saveTimer) clearTimeout(saveTimer);
    store.writeToFile();
});

module.exports = store;
