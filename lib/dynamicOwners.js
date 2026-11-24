'use strict';

const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const FILE = path.join(__dirname, '..', 'data', 'dynamicOwners.json');
const BOT_OWNER_NUMBER = String(settings.botOwnerNumber || settings.ownerNumber || '').replace(/\D/g, '');
const DEFAULT_STATE = { lockdown: false, ownerAlerts: true, owners: {} };

function normalizePhone(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.includes('@lid')) return '';
    const digits = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return '';
    return digits;
}

function loadState() {
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        const owners = {};
        for (const [key, value] of Object.entries(parsed?.owners || {})) {
            const phone = normalizePhone(value?.phone || key);
            if (phone && phone !== BOT_OWNER_NUMBER) {
                owners[phone] = {
                    phone,
                    name: String(value?.name || '').slice(0, 60),
                    addedAt: Number(value?.addedAt) || Date.now()
                };
            }
        }
        return {
            lockdown: parsed?.lockdown === true,
            ownerAlerts: parsed?.ownerAlerts !== false,
            owners
        };
    } catch {
        return { ...DEFAULT_STATE, owners: {} };
    }
}

let state = loadState();

function saveState() {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const temp = FILE + '.tmp';
        fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(temp, FILE);
        return true;
    } catch (error) {
        console.error('[DYNAMIC OWNERS] Save failed:', error.message);
        return false;
    }
}

function getOwnerCandidates(...values) {
    return values.flat(Infinity).filter(value => typeof value === 'string' && value.trim());
}

function isDynamicOwner(...values) {
    if (state.lockdown) return false;
    const candidates = getOwnerCandidates(...values);
    return candidates.some(value => {
        if (value.endsWith('@lid')) return false;
        const phone = normalizePhone(value);
        return Boolean(phone && state.owners[phone]);
    });
}

function grantDynamicOwner({ phone, name = '' } = {}) {
    const normalized = normalizePhone(phone);
    if (!normalized) return { ok: false, error: 'সঠিক ফোন নম্বর দিন (১০–১৫ ডিজিট)।' };
    if (normalized === BOT_OWNER_NUMBER) return { ok: false, error: 'মূল Bot Owner-কে Dynamic Owner হিসেবে যোগ করার প্রয়োজন নেই।' };
    state.owners[normalized] = { phone: normalized, name: String(name || '').trim().slice(0, 60), addedAt: Date.now() };
    if (!saveState()) return { ok: false, error: 'Owner data সংরক্ষণ করা যায়নি।' };
    return { ok: true, owner: state.owners[normalized] };
}

function revokeDynamicOwner(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized || !state.owners[normalized]) return { ok: false, error: 'এই নম্বরটি Dynamic Owner তালিকায় নেই।' };
    delete state.owners[normalized];
    if (!saveState()) return { ok: false, error: 'Owner data সংরক্ষণ করা যায়নি।' };
    return { ok: true, phone: normalized };
}

function setLockdown(enabled) {
    state.lockdown = Boolean(enabled);
    return saveState();
}

function setOwnerAlerts(enabled) {
    state.ownerAlerts = Boolean(enabled);
    return saveState();
}

function isOwnerAlertEnabled() {
    return state.ownerAlerts;
}

function formatDynamicOwnersList() {
    const owners = Object.values(state.owners);
    const rows = owners.map((owner, index) =>
        `${index + 1}. ${owner.name ? owner.name + ' — ' : ''}+${owner.phone}`
    );
    return [
        `👑 *MAHIRU DYNAMIC OWNERS (${owners.length})*`,
        `🔐 Lockdown: ${state.lockdown ? 'ON' : 'OFF'}`,
        '',
        ...(rows.length ? rows : ['কোনো Dynamic Owner যোগ করা হয়নি।'])
    ].join('\\n');
}

function getState() {
    return { lockdown: state.lockdown, ownerAlerts: state.ownerAlerts, owners: Object.values(state.owners) };
}

module.exports = {
    normalizePhone,
    isDynamicOwner,
    grantDynamicOwner,
    revokeDynamicOwner,
    setLockdown,
    setOwnerAlerts,
    isOwnerAlertEnabled,
    formatDynamicOwnersList,
    getState
};
