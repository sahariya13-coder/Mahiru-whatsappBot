/**
 * PRIME MONIR • Maya v3.0 ULTRA — Precision Bangla/English Smart Scheduler
 * Fixes: Unicode-Safe Bangla Clock Regex (\b Bug Fixed) + Zero-Drift Daily Jobs + Spoken Bangla Numbers
 * Features: Phonetic Contact/Group Resolution + Mention/Reply Target + 15s Send Timeout + Atomic Save
 * RAM Profile: 256MB-356MB Cloud Safe | 100% Backward-Compatible Exports
 */
const fs = require('fs');
const path = require('path');

const settings = (() => {
    try { return require('../settings'); } catch { return {}; }
})();

const isOwnerOrSudo = (() => {
    try { return require('./isOwner'); } catch { return async () => false; }
})();

const {
    BOT_NAME,
    BOT_VERSION,
    loadJson,
    saveJson,
    normalizeBn,
    normalizePhone,
    toJid,
    safeSend,
    isOwnerMessage,
    getOwnerJid,
    getContactRole,
    getEffectivePronounStyle,
    logActivity
} = require('./mayaCore');

function getOwnerAgentLazy() {
    try {
        const p = require.resolve('./ownerAgent');
        return require.cache[p]?.exports?.ownerAgent || require('./ownerAgent')?.ownerAgent || null;
    } catch {
        return null;
    }
}

const SCHEDULE_FILE = path.join(process.cwd(), 'data', 'maya_schedules.json');
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const MISSED_GRACE_MS = 15 * 60 * 1000;
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 30 * 1000;
const SEND_TIMEOUT_MS = 15 * 1000;
const MAX_SCHEDULES = 60;
const POLL_INTERVAL_MS = 10 * 1000;

let schedules = loadJson(SCHEDULE_FILE, []);
if (!Array.isArray(schedules)) schedules = [];
schedules = schedules.filter((j) => j && j.id && j.targetTs).slice(-MAX_SCHEDULES);

let activeSock = null;
let tickerTimer = null;
let isTicking = false;
const executingIds = new Set();

function saveSchedules() {
    let tmp = '';
    try {
        fs.mkdirSync(path.dirname(SCHEDULE_FILE), { recursive: true });
        tmp = `${SCHEDULE_FILE}.tmp-${process.pid}-${Date.now()}`;
        fs.writeFileSync(tmp, JSON.stringify(schedules.slice(-MAX_SCHEDULES)), 'utf8');
        fs.renameSync(tmp, SCHEDULE_FILE);
    } catch {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
        try { saveJson(SCHEDULE_FILE, schedules.slice(-MAX_SCHEDULES)); } catch {}
    }
}

const BN_SPOKEN_NUMS = Object.freeze([
    ['পঁয়তাল্লিশ', '45'], ['পঁয়তাল্লিশ', '45'], ['চল্লিশ', '40'], ['পঁয়ত্রিশ', '35'], ['পঁয়ত্রিশ', '35'],
    ['ত্রিশ', '30'], ['পঁচিশ', '25'], ['বিশ', '20'], ['পনেরো', '15'], ['পনের', '15'],
    ['বারো', '12'], ['এগারো', '11'], ['দশ', '10'], ['নয়', '9'], ['নয়', '9'],
    ['আট', '8'], ['সাত', '7'], ['ছয়', '6'], ['ছয়', '6'], ['পাঁচ', '5'], ['পাচ', '5'],
    ['চার', '4'], ['তিন', '3'], ['দুই', '2'], ['এক', '1']
]);

function bnToEnDigits(str = '') {
    let out = normalizeBn(str).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
    for (let i = 0; i < BN_SPOKEN_NUMS.length; i++) {
        const [word, num] = BN_SPOKEN_NUMS[i];
        out = out.replace(
            new RegExp(`(^|[\\s,.:;\\-])${word}(?=\\s*(?:টা|টায়|টায়|বাজে|দিন|ঘণ্টা|ঘন্টা|মিনিট|সেকেন্ড|পর|পরে)|\\s|$)`, 'gi'),
            `$1${num}`
        );
    }
    return out;
}

function toDhakaDate(epochMs = Date.now()) {
    return new Date(epochMs + DHAKA_OFFSET_MS);
}

function fromDhakaComponents(year, monthIdx, day, hour, minute, second = 0) {
    return Date.UTC(year, monthIdx, day, hour, minute, second) - DHAKA_OFFSET_MS;
}

function withTimeout(promise, ms = SEND_TIMEOUT_MS, label = 'scheduler_timeout') {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
        if (timer.unref) timer.unref();
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

// ==================================================
// ১. ঢাকা সময় ফরম্যাটার (পড়তে সুন্দর বাংলা তারিখ ও সময়)
// ==================================================
function formatDhakaReadable(epochMs) {
    const ts = Number(epochMs);
    if (!ts || Number.isNaN(ts)) return 'অজানা সময়';

    const d = toDhakaDate(ts);
    const months = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
    const day = d.getUTCDate();
    const mon = months[d.getUTCMonth()];
    const h24 = d.getUTCHours();
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = String(h24 % 12 || 12).padStart(2, '0');

    const enToBn = (s) => String(s).replace(/\d/g, (ch) => '০১২৩৪৫৬৭৮৯'[Number(ch)]);
    return `${enToBn(day)} ${mon}, ${enToBn(h12)}:${enToBn(min)} ${ampm}`;
}

// ==================================================
// ২. আল্ট্রা-স্মার্ট ইউনিকোড-সেফ বাংলা / বাংলিশ / ইংরেজি টাইম পার্সার
// ==================================================
function stripPhoneNumbersForTimeParse(text = '') {
    return String(text || '')
        .replace(/(?:\+?880|880|0)1[3-9]\d{8}\b/g, ' ')
        .replace(/\b\d{7,}\b/g, ' ');
}

function parseRelativeOffsetMs(cleanEn) {
    let totalMs = 0;
    let matched = false;
    const matchedParts = [];

    const halfHr = cleanEn.match(/(?:আধা|অর্ধ|half)\s*(?:ঘণ্টা|ঘন্টা|hour|hr)\s*(?:পর|পরে|later|after)?/i);
    if (halfHr) {
        totalMs += 30 * 60 * 1000;
        matched = true;
        matchedParts.push(halfHr[0]);
    }
    const oneHalfHr = cleanEn.match(/(?:দেড়|দেড়|ডের)\s*(?:ঘণ্টা|ঘন্টা|hour|hr)\s*(?:পর|পরে|later|after)?/i);
    if (oneHalfHr) {
        totalMs += 90 * 60 * 1000;
        matched = true;
        matchedParts.push(oneHalfHr[0]);
    }
    const twoHalfHr = cleanEn.match(/(?:আড়াই|আড়াই)\s*(?:ঘণ্টা|ঘন্টা|hour|hr)\s*(?:পর|পরে|later|after)?/i);
    if (twoHalfHr) {
        totalMs += 150 * 60 * 1000;
        matched = true;
        matchedParts.push(twoHalfHr[0]);
    }

    const unitRx = /(\d+(?:\.\d+)?)\s*(দিন|days?|d|ঘণ্টা|ঘন্টা|hours?|hrs?|h|মিনিট|minutes?|mins?|min|m|সেকেন্ড|seconds?|secs?|sec|s)(?=\s|$|[.,!?;:\-]|পর|পরে|বাদে|later|after)/gi;
    const hasAfterHint = /(?:পর|পরে|বাদে|later|after|in\s+\d)/i.test(cleanEn) || /^\s*\d+\s*(?:d|h|m|s|hr|min|sec)(?=\s|$)/i.test(cleanEn);

    for (const m of cleanEn.matchAll(unitRx)) {
        const val = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        if (Number.isNaN(val) || val <= 0) continue;

        const beforeChunk = cleanEn.slice(Math.max(0, m.index - 10), m.index);
        if (/(?:টা|বাজে|:)\s*$/.test(beforeChunk) && !/(?:পর|পরে|বাদে|later|after)/i.test(cleanEn.slice(m.index, m.index + 24))) {
            continue;
        }
        if (unit.length === 1 && !hasAfterHint) continue;

        if (/^(?:দিন|day|days|d)$/.test(unit)) totalMs += val * 24 * 60 * 60 * 1000;
        else if (/^(?:ঘণ্টা|ঘন্টা|hour|hours|hr|hrs|h)$/.test(unit)) totalMs += val * 60 * 60 * 1000;
        else if (/^(?:মিনিট|minute|minutes|min|mins|m)$/.test(unit)) totalMs += val * 60 * 1000;
        else if (/^(?:সেকেন্ড|second|seconds|sec|secs|s)$/.test(unit)) totalMs += val * 1000;

        matched = true;
        matchedParts.push(m[0]);
    }

    if (!matched || totalMs < 5000) return null;
    if (totalMs > 365 * 24 * 60 * 60 * 1000) return null;

    return {
        offsetMs: Math.round(totalMs),
        matchedText: matchedParts.join(' ')
    };
}

function parseClockTimeComponents(cleanEn) {
    let hour = null;
    let minute = 0;
    let ampm = '';
    let matchedText = '';

    // ক) বাংলা বিশেষ সময়: সাড়ে, পৌনে, সোয়া, দেড়টা, আড়াইটা
    let m = cleanEn.match(/(?:সাড়ে|সাড়ে|সারে)\s*(\d{1,2})\s*(?:টা|টায়|টায়|বাজে|-এ|এ)?/i);
    if (m) {
        hour = parseInt(m[1], 10);
        minute = 30;
        matchedText = m[0];
    }

    if (hour === null) {
        m = cleanEn.match(/(?:পৌনে|পোনে)\s*(\d{1,2})\s*(?:টা|টায়|টায়|বাজে|-এ|এ)?/i);
        if (m) {
            const base = parseInt(m[1], 10);
            hour = base <= 1 ? 12 : base - 1;
            minute = 45;
            matchedText = m[0];
        }
    }

    if (hour === null) {
        m = cleanEn.match(/(?:সোয়া|সোয়া)\s*(\d{1,2})\s*(?:টা|টায়|টায়|বাজে|-এ|এ)?/i);
        if (m) {
            hour = parseInt(m[1], 10);
            minute = 15;
            matchedText = m[0];
        }
    }

    if (hour === null) {
        m = cleanEn.match(/(?:দেড়|দেড়|ডের)\s*(?:টা|টায়|টায়|বাজে|-এ|এ)/i);
        if (m) {
            hour = 1;
            minute = 30;
            matchedText = m[0];
        }
    }

    if (hour === null) {
        m = cleanEn.match(/(?:আড়াই|আড়াই)\s*(?:টা|টায়|টায়|বাজে|-এ|এ)/i);
        if (m) {
            hour = 2;
            minute = 30;
            matchedText = m[0];
        }
    }

    // খ) HH:MM (ঐচ্ছিক AM/PM, টা, বাজে)
    if (hour === null) {
        m = cleanEn.match(/(?:^|\s)(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm)?\s*(?:টা|টায়|টায়|বাজে|মিনিট|মিনিটে|-এ|এ)?(?=\s|$|[.,!?;:\-])/i);
        if (m) {
            const h = parseInt(m[1], 10);
            const mn = parseInt(m[2], 10);
            if (h >= 0 && h <= 23 && mn >= 0 && mn <= 59) {
                hour = h;
                minute = mn;
                ampm = (m[3] || '').toLowerCase();
                matchedText = m[0].trim();
            }
        }
    }

    // গ) HH টা MM (যেমন: ১২টা ২০-এ, ৯টা ১৫ মিনিটে)
    if (hour === null) {
        m = cleanEn.match(/(?:^|\s)(\d{1,2})\s*(?:টা|টায়|টায়|ta|tay)\s*(\d{1,2})\s*(?:মিনিট|মিনিটে|মি|min|বাজে|baje|-এ|এ)?\s*(am|pm)?(?=\s|$|[.,!?;:\-])/i);
        if (m) {
            const h = parseInt(m[1], 10);
            const mn = parseInt(m[2], 10);
            if (h >= 0 && h <= 23 && mn >= 0 && mn <= 59) {
                hour = h;
                minute = mn;
                ampm = (m[3] || '').toLowerCase();
                matchedText = m[0].trim();
            }
        }
    }

    // ঘ) শুধু ঘন্টা (ইউনিকোড-সেফ বাউন্ডারি — বাংলা 'টা'/'টায়' এর পর \b বাগ ফিক্সড)
    if (hour === null) {
        m = cleanEn.match(/(?:^|\s)(\d{1,2})\s*(?:(am|pm)|(?:টায়|টায়|টা|বাজে|ta|tay|baje)(?:-এ|এ)?)(?=\s|$|[.,!?;:\-])/i);
        if (m) {
            const h = parseInt(m[1], 10);
            if (h >= 0 && h <= 23) {
                hour = h;
                minute = 0;
                ampm = (m[2] || '').toLowerCase();
                matchedText = m[0].trim();
            }
        }
    }

    if (hour === null) return null;

    if (!ampm) {
        const trailingAmPm = cleanEn.match(/(?:^|\s)(am|pm)(?=\s|$|[.,!?;:\-])/i);
        if (trailingAmPm) ampm = trailingAmPm[1].toLowerCase();
    }

    return { hour, minute, ampm, matchedText };
}

function detectPeriodHint(cleanEn = '') {
    if (/(?:মধ্যরাত|মাঝরাত|midnight)/i.test(cleanEn)) return 'midnight';
    if (/(?:ভোর|ভোরে|সকাল|সকালে|সকালবেলা|morning|sokal|bhor)/i.test(cleanEn)) return 'morning';
    if (/(?:দুপুর|দুপুরে|দুপুরবেলা|noon|dupur)/i.test(cleanEn)) return 'noon';
    if (/(?:বিকাল|বিকালে|বিকেল|বিকেলে|afternoon|bikal|bikel)/i.test(cleanEn)) return 'afternoon';
    if (/(?:সন্ধ্যা|সন্ধ্যায়|সন্ধ্যায়|সন্ধে|evening|sondha)/i.test(cleanEn)) return 'evening';
    if (/(?:রাত|রাতে|রাত্রি|রাত্রে|night|raat|rat)/i.test(cleanEn)) return 'night';
    return '';
}

function resolveHour24(hour, ampm, period) {
    if (hour >= 13 && hour <= 23) return { hour24: hour, definite: true };

    if (ampm === 'am') return { hour24: hour === 12 ? 0 : hour, definite: true };
    if (ampm === 'pm') return { hour24: hour === 12 ? 12 : hour + 12, definite: true };

    if (period === 'midnight' || period === 'morning') return { hour24: hour === 12 ? 0 : hour, definite: true };
    if (period === 'noon') {
        if (hour === 12) return { hour24: 12, definite: true };
        if (hour >= 1 && hour <= 5) return { hour24: hour + 12, definite: true };
        return { hour24: hour, definite: true };
    }
    if (period === 'afternoon' || period === 'evening') {
        if (hour === 12) return { hour24: 12, definite: true };
        return { hour24: hour < 12 ? hour + 12 : hour, definite: true };
    }
    if (period === 'night') {
        if (hour === 12) return { hour24: 0, definite: true };
        if (hour >= 1 && hour <= 4) return { hour24: hour, definite: true };
        return { hour24: hour < 12 ? hour + 12 : hour, definite: true };
    }

    return { hour24: hour, definite: false };
}

function parseNaturalTime(rawInput = '') {
    const cleanEn = stripPhoneNumbersForTimeParse(bnToEnDigits(rawInput)).replace(/\s+/g, ' ').trim();
    if (!cleanEn) {
        return { ok: false, error: '❌ সময় পাওয়া যায়নি। উদাহরণ: `বিকাল ৪:৫০`, `আজ দুপুর ১২:৩০`, `কাল সকাল ৮টা`, বা `১০ মিনিট পর`।' };
    }

    const nowMs = Date.now();
    const nowDhaka = toDhakaDate(nowMs);

    // ১. সরাসরি ISO তারিখ+সময়: 2026-11-23 14:30
    const isoMatch = cleanEn.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})[T\s]+(\d{1,2}):(\d{2})\b/);
    if (isoMatch) {
        const ts = fromDhakaComponents(
            parseInt(isoMatch[1], 10),
            parseInt(isoMatch[2], 10) - 1,
            parseInt(isoMatch[3], 10),
            parseInt(isoMatch[4], 10),
            parseInt(isoMatch[5], 10)
        );
        if (ts > nowMs - 55000) {
            return { ok: true, targetTs: Math.max(ts, nowMs + 5000), matchedText: isoMatch[0], rolledToNextDay: false };
        }
    }

    // ২. রিলেটিভ সময় ("পাঁচ মিনিট পর", "২০ মিনিট পর", "১ ঘণ্টা ৩০ মিনিট পর", "15m", "আধা ঘন্টা পর")
    const rel = parseRelativeOffsetMs(cleanEn);
    if (rel) {
        return {
            ok: true,
            targetTs: nowMs + rel.offsetMs,
            matchedText: rel.matchedText,
            rolledToNextDay: false
        };
    }

    // ৩. ঘড়ির সময় পার্স করা
    const clock = parseClockTimeComponents(cleanEn);
    if (!clock) {
        return {
            ok: false,
            error: '❌ সময় বুঝতে পারিনি। উদাহরণ: `আজ দুপুর ১২:৩০`, `রাত সাড়ে ৯টা`, `কাল সকাল ৮টা`, বা `১০ মিনিট পর`।'
        };
    }

    let year = nowDhaka.getUTCFullYear();
    let monthIdx = nowDhaka.getUTCMonth();
    let day = nowDhaka.getUTCDate();
    let explicitDaySet = false;

    const dmyMatch = cleanEn.match(/\b(\d{1,2})[/\-](\d{1,2})(?:[/\-](20\d{2}))?\b/);
    if (dmyMatch) {
        const dVal = parseInt(dmyMatch[1], 10);
        const mVal = parseInt(dmyMatch[2], 10);
        if (dVal >= 1 && dVal <= 31 && mVal >= 1 && mVal <= 12) {
            day = dVal;
            monthIdx = mVal - 1;
            if (dmyMatch[3]) year = parseInt(dmyMatch[3], 10);
            explicitDaySet = true;
        }
    } else if (/(?:পরশু|পর্শু|day\s+after\s+tomorrow|porshu)/i.test(cleanEn)) {
        day += 2;
        explicitDaySet = true;
    } else if (/(?:আগামীকাল|কালকে|কাল|tomorrow|kal|kalke)/i.test(cleanEn)) {
        day += 1;
        explicitDaySet = true;
    }

    const period = detectPeriodHint(cleanEn);
    const { hour24, definite } = resolveHour24(clock.hour, clock.ampm, period);

    let targetTs;
    let rolledToNextDay = false;

    if (definite) {
        targetTs = fromDhakaComponents(year, monthIdx, day, hour24, clock.minute, 0);
        if (targetTs <= nowMs - 55000) {
            targetTs = fromDhakaComponents(year, monthIdx, day + 1, hour24, clock.minute, 0);
            rolledToNextDay = true;
        }
    } else {
        const hA = clock.hour === 12 ? 12 : clock.hour;
        const hB = clock.hour === 12 ? 0 : (clock.hour + 12) % 24;
        const candidates = [
            fromDhakaComponents(year, monthIdx, day, hA, clock.minute, 0),
            fromDhakaComponents(year, monthIdx, day, hB, clock.minute, 0),
            fromDhakaComponents(year, monthIdx, day + 1, hA, clock.minute, 0),
            fromDhakaComponents(year, monthIdx, day + 1, hB, clock.minute, 0)
        ].sort((a, b) => a - b);

        targetTs = candidates.find((ts) => ts > nowMs - 55000) || candidates[candidates.length - 1];
        if (toDhakaDate(targetTs).getUTCDate() !== nowDhaka.getUTCDate() && !explicitDaySet) {
            rolledToNextDay = true;
        }
    }

    if (targetTs <= nowMs && nowMs - targetTs <= 55000) {
        targetTs = nowMs + 5000;
    }

    return {
        ok: true,
        targetTs,
        matchedText: clock.matchedText,
        rolledToNextDay
    };
}

// ==================================================
// ৩. শিডিউল CRUD ও জিরো-ড্রিফট এক্সিকিউশন ইঞ্জিন
// ==================================================
function computeNextDailyTs(job, fromMs = Date.now()) {
    const baseD = toDhakaDate(job.targetTs || fromMs);
    const h = Number.isInteger(job.dailyHour) ? job.dailyHour : baseD.getUTCHours();
    const m = Number.isInteger(job.dailyMinute) ? job.dailyMinute : baseD.getUTCMinutes();
    const nowD = toDhakaDate(fromMs);

    let nextTs = fromDhakaComponents(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate(), h, m, 0);
    if (nextTs <= fromMs + 10000) {
        nextTs = fromDhakaComponents(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate() + 1, h, m, 0);
    }
    return nextTs;
}

function addSchedule({ targetJid, targetLabel = '', targetTs, text = 'হ্যালো!', type = 'text', daily = false } = {}) {
    const cleanJid = String(targetJid || '').includes('@') ? targetJid : toJid(targetJid);
    const tsNum = Number(targetTs);
    const d = toDhakaDate(tsNum);
    const id = Math.random().toString(36).slice(2, 7).toUpperCase();

    const job = {
        id,
        targetJid: cleanJid || targetJid,
        targetLabel: targetLabel || (cleanJid ? `+${normalizePhone(cleanJid) || cleanJid.split('@')[0]}` : 'Unknown'),
        targetTs: tsNum,
        text: String(text || 'হ্যালো!').trim().slice(0, 600),
        type: ['text', 'voice', 'call'].includes(type) ? type : 'text',
        daily: Boolean(daily),
        dailyHour: daily ? d.getUTCHours() : null,
        dailyMinute: daily ? d.getUTCMinutes() : null,
        retries: 0,
        createdAt: Date.now()
    };

    schedules.push(job);
    if (schedules.length > MAX_SCHEDULES) schedules = schedules.slice(-MAX_SCHEDULES);
    saveSchedules();
    return job;
}

function getPendingSchedules() {
    return schedules
        .filter((j) => j && j.targetTs)
        .sort((a, b) => a.targetTs - b.targetTs);
}

function cancelScheduleById(idOrIndex = '') {
    const token = bnToEnDigits(String(idOrIndex || '')).trim().toUpperCase();
    if (!token) return false;

    const before = schedules.length;
    schedules = schedules.filter((j) => String(j.id || '').toUpperCase() !== token);
    if (schedules.length < before) {
        saveSchedules();
        return true;
    }

    const idx = parseInt(token, 10);
    const sorted = getPendingSchedules();
    if (!Number.isNaN(idx) && idx >= 1 && idx <= sorted.length) {
        const targetId = sorted[idx - 1].id;
        schedules = schedules.filter((j) => j.id !== targetId);
        saveSchedules();
        return true;
    }
    return false;
}

function clearAllSchedules() {
    const count = schedules.length;
    schedules = [];
    saveSchedules();
    return count;
}

async function deliverScheduledJob(sock, job) {
    if (!sock || !sock.user) throw new Error('Socket not connected');

    if (job.type === 'call') {
        const ownerJid = getOwnerJid(sock);
        await withTimeout(safeSend(sock, ownerJid, {
            text: `📞 *শিডিউল কল রিমাইন্ডার (\`${job.id}\`)*\n──────────────\n• *নম্বর:* ${job.targetLabel}\n• *নোট:* ${job.text}\n• *সময়:* \`${formatDhakaReadable(Date.now())}\``
        }));
        return;
    }

    if (job.type === 'voice') {
        try {
            const { sendVoiceReply } = require('./neuralVoice');
            const role = getContactRole(job.targetJid, job.targetJid);
            const style = getEffectivePronounStyle(job.targetJid, job.targetJid, role);
            const sentVoice = await withTimeout(
                sendVoiceReply(sock, job.targetJid, undefined, job.text, role, style, job.text),
                20000,
                'voice_schedule_timeout'
            );
            if (sentVoice) return;
        } catch {}
    }

    await withTimeout(safeSend(sock, job.targetJid, { text: job.text }));
}

async function tickSchedules() {
    if (isTicking || !activeSock || !activeSock.user || !schedules.length) return;

    isTicking = true;
    const now = Date.now();
    let changed = false;

    try {
        for (const job of [...schedules]) {
            if (!job || !job.id || executingIds.has(job.id)) continue;
            if (job.targetTs > now) continue;

            if (now - job.targetTs > MISSED_GRACE_MS) {
                if (job.daily) {
                    job.targetTs = computeNextDailyTs(job, now);
                    job.retries = 0;
                } else {
                    schedules = schedules.filter((j) => j.id !== job.id);
                }
                changed = true;
                continue;
            }

            executingIds.add(job.id);
            try {
                await deliverScheduledJob(activeSock, job);
                logActivity('msg', `Schedule -> ${job.targetLabel}`, `[${job.type.toUpperCase()}] ${job.text}`);

                if (job.daily) {
                    job.targetTs = computeNextDailyTs(job, Date.now());
                    job.retries = 0;
                } else {
                    schedules = schedules.filter((j) => j.id !== job.id);
                }
                changed = true;

                const ownerJid = getOwnerJid(activeSock);
                if (ownerJid && ownerJid !== job.targetJid) {
                    safeSend(activeSock, ownerJid, {
                        text: `✅ *শিডিউল ডেলিভারি সম্পন্ন (\`${job.id}\`)*\n• প্রাপক: ${job.targetLabel}\n• মেসেজ: "${job.text.slice(0, 120)}"`
                    }).catch(() => {});
                }
            } catch (err) {
                job.retries = (job.retries || 0) + 1;
                if (job.retries <= MAX_RETRY_COUNT) {
                    job.targetTs = Date.now() + RETRY_DELAY_MS;
                    console.warn(`⚠️ [Scheduler] Retry ${job.retries}/${MAX_RETRY_COUNT} for ${job.id}: ${err?.message || err}`);
                } else {
                    console.error(`❌ [Scheduler] Dropped ${job.id} after ${MAX_RETRY_COUNT} retries: ${err?.message || err}`);
                    if (job.daily) {
                        job.targetTs = computeNextDailyTs(job, Date.now());
                        job.retries = 0;
                    } else {
                        schedules = schedules.filter((j) => j.id !== job.id);
                    }
                }
                changed = true;
            } finally {
                executingIds.delete(job.id);
            }
        }
    } finally {
        if (changed) saveSchedules();
        isTicking = false;
    }
}

function startScheduler(sock) {
    if (sock) activeSock = sock;
    if (tickerTimer) return;

    const ver = settings?.version || BOT_VERSION || '3.0.0-ULTRA';
    console.log(`⏰ ${BOT_NAME} v${ver} Smart Scheduler started (${schedules.length} pending).`);
    tickerTimer = setInterval(() => tickSchedules().catch(() => {}), POLL_INTERVAL_MS);
    if (tickerTimer.unref) tickerTimer.unref();
}

function stopScheduler() {
    if (tickerTimer) {
        clearInterval(tickerTimer);
        tickerTimer = null;
    }
}

function getSchedulerStats() {
    return {
        pendingCount: schedules.length,
        executingCount: executingIds.size,
        active: Boolean(tickerTimer)
    };
}

// ==================================================
// ৪. .sch / .schedule ডট-কমান্ড (ফোনেটিক নাম + গ্রুপ + মেনশন + পাইপ সাপোর্ট)
// ==================================================
async function isAuthorizedSchedulerCaller(sock, chatId, message) {
    if (message?.key?.fromMe) return true;
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId || '';
    const altId = message?.key?.participantAlt || message?.key?.remoteJidAlt || '';
    if (typeof isOwnerOrSudo?.isBlockedIdentity === 'function' && isOwnerOrSudo.isBlockedIdentity(senderId, altId)) {
        return false;
    }
    if (isOwnerMessage(message, senderId, sock)) return true;
    try { return Boolean(await isOwnerOrSudo(senderId, sock, chatId, message)); } catch { return false; }
}

function resolveScheduleTarget(sock, chatId, message, rawTarget = '') {
    const clean = normalizeBn(rawTarget).trim();
    if (!clean || /^(?:here|এখানে|this|এই\s*চ্যাট|এই\s*গ্রুপ)$/i.test(clean)) {
        return { ok: true, jid: chatId, label: chatId.endsWith('@g.us') ? 'এই গ্রুপ' : 'এই চ্যাট' };
    }

    const phoneDigits = normalizePhone(bnToEnDigits(clean));
    if (phoneDigits && phoneDigits.length >= 11 && /^\+?[\d০-৯\s-]+$/.test(clean)) {
        return { ok: true, jid: toJid(phoneDigits), label: `+${phoneDigits}` };
    }

    // মেনশন বা রিপ্লাই করা ইউজার
    const ctxInfo = message?.message?.extendedTextMessage?.contextInfo || {};
    if (Array.isArray(ctxInfo.mentionedJid) && ctxInfo.mentionedJid.length && /^@/.test(clean)) {
        const jid = ctxInfo.mentionedJid[0];
        return { ok: true, jid, label: `+${normalizePhone(jid) || jid.split('@')[0]}` };
    }

    // ownerAgent-এর বাংলা↔ইংরেজি ফোনেটিক কন্টাক্ট/গ্রুপ রিজল্ভার ব্যবহার
    const oa = getOwnerAgentLazy();
    if (oa?.resolveActionTarget) {
        const res = oa.resolveActionTarget(clean, { sock, chatId }, { allowGroups: true });
        if (res?.status === 'ok' && res.target?.chatId) {
            return { ok: true, jid: res.target.chatId, label: res.target.name || clean };
        }
        if (res?.status === 'ambiguous' && res.matches?.length) {
            const opts = res.matches.map((m, i) => `${i + 1}. ${m.name} (\`${m.phone || m.chatId}\`)`).join('\n');
            return { ok: false, error: `🤔 একাধিক ম্যাচ পাওয়া গেছে—নম্বর দিয়ে শিডিউল দাও:\n${opts}` };
        }
    }

    return { ok: false, error: `❌ "${clean}" নামে কোনো কন্টাক্ট বা গ্রুপ পাওয়া যায়নি। ফোন নম্বর অথবা \`here\` দিন।` };
}

function extractMessageFromNaturalSch(rawText = '', matchedTime = '', phoneRaw = '') {
    let msg = normalizeBn(rawText);
    if (phoneRaw) msg = msg.replace(phoneRaw, ' ');
    if (matchedTime) {
        const escaped = matchedTime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        msg = msg.replace(new RegExp(escaped, 'i'), ' ');
    }

    msg = msg
        .replace(/\b(?:here|daily|everyday|voice|call|pm|am)\b/gi, ' ')
        .replace(/(?:আজকে|আজ|কালকে|কাল|আগামীকাল|পরশু|প্রতিদিন|রোজ|ভোর|ভোরে|সকাল|সকালে|দুপুর|দুপুরে|বিকাল|বিকালে|বিকেল|বিকেলে|সন্ধ্যা|সন্ধ্যায়|রাত|রাতে|মধ্যরাত|বাজে|মিনিট|ঘণ্টা|ঘন্টা|সেকেন্ড|পর|পরে|বাদে|এই\s*নাম্বারে|নাম্বারে|নম্বরে|এখানে|মেসেজ\s*দিও|মেসেজ\s*দিবা|মেসেজ\s*দাও|মেসেজ\s*পাঠাও|পাঠাইও|পাঠাও|ভয়েস\s*দিও|ভয়েস\s*দিও|কল\s*রিমাইন্ডার|লিখে\s*দাও)/gi, ' ')
        .replace(/[০-৯0-9]{1,2}\s*(?:টায়|টায়|টা|:)\s*[০-৯0-9]{0,2}(?:-এ|এ)?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return msg || 'হ্যালো!';
}

async function handleScheduleCommand(sock, chatId, message, rawArgs = '') {
    if (!(await isAuthorizedSchedulerCaller(sock, chatId, message))) return;
    if (sock) activeSock = sock;

    const input = normalizeBn(rawArgs).trim();
    const lower = input.toLowerCase();

    if (!input || lower === 'list') {
        const list = getPendingSchedules();
        if (!list.length) {
            return safeSend(sock, chatId, {
                text: `⏰ *শিডিউল তালিকা খালি*\n──────────────\n• নাম/নম্বর দিয়ে: \`.sch হুমায়রা | বিকাল ৫টা | কেমন আছো\`\n• ন্যাচারাল: \`.sch আজ দুপুর ১২:৩০ 017xxxxxxxx কেমন আছো\`\n• এই চ্যাটে: \`.sch ১০ মিনিট পর here হ্যালো\`\n• প্রতিদিন: \`.sch প্রতিদিন সকাল ৮টা 017xxxxxxxx শুভ সকাল\``
            }, { quoted: message });
        }
        const rows = list.map((j, i) =>
            `${i + 1}. \`${j.id}\` • *${j.targetLabel}*\n   🕒 ${formatDhakaReadable(j.targetTs)} [${j.type.toUpperCase()}${j.daily ? ' 🔁' : ''}]\n   💬 "${j.text.slice(0, 80)}"`
        ).join('\n');
        return safeSend(sock, chatId, {
            text: `⏰ *পেন্ডিং শিডিউল (${list.length}টি)*\n──────────────\n${rows}\n\n_বাতিল করতে: \`.sch del <ID বা #>\` | সব মুছতে: \`.sch clear\`_`
        }, { quoted: message });
    }

    if (lower === 'clear') {
        const n = clearAllSchedules();
        return safeSend(sock, chatId, { text: `🧹 সব শিডিউল বাতিল করা হয়েছে (${n}টি)।` }, { quoted: message });
    }

    if (/^(?:del|delete|cancel|rm)\s+/i.test(lower)) {
        const id = input.split(/\s+/)[1] || '';
        const ok = cancelScheduleById(id);
        return safeSend(sock, chatId, {
            text: ok ? `🗑️ শিডিউল \`${id.toUpperCase()}\` বাতিল করা হয়েছে।` : `❌ \`${id}\` আইডির কোনো শিডিউল পাওয়া যায়নি।`
        }, { quoted: message });
    }

    // ক) পাইপ ফরম্যাট: .sch <নাম/নম্বর/গ্রুপ/here> | <সময়> | <মেসেজ> [| voice] [| daily]
    if (input.includes('|')) {
        const parts = input.split('|').map((p) => p.trim()).filter(Boolean);
        if (parts.length < 3) {
            return safeSend(sock, chatId, { text: '❌ পাইপ নিয়ম: `.sch হুমায়রা | বিকাল ৫টা | কেমন আছো`' }, { quoted: message });
        }

        const targetRes = resolveScheduleTarget(sock, chatId, message, parts[0]);
        if (!targetRes.ok) return safeSend(sock, chatId, { text: targetRes.error }, { quoted: message });

        const parsed = parseNaturalTime(parts[1]);
        if (!parsed.ok) return safeSend(sock, chatId, { text: parsed.error }, { quoted: message });

        const extra = parts.slice(3).join(' ').toLowerCase();
        const type = /(?:voice|ভয়েস|ভয়েস)/.test(extra) ? 'voice' : /(?:call|কল)/.test(extra) ? 'call' : 'text';
        const daily = /(?:daily|প্রতিদিন|রোজ)/.test(`${parts[1]} ${extra}`);

        const job = addSchedule({
            targetJid: targetRes.jid,
            targetLabel: targetRes.label,
            targetTs: parsed.targetTs,
            text: parts[2],
            type,
            daily
        });

        return safeSend(sock, chatId, {
            text: `⏰ *শিডিউল সেট হয়েছে (\`${job.id}\`)*\n──────────────\n• *প্রাপক:* ${job.targetLabel}\n• *সময়:* \`${formatDhakaReadable(job.targetTs)}\` [${job.type.toUpperCase()}${job.daily ? ' 🔁' : ''}]\n• *মেসেজ:* "${job.text}"`
        }, { quoted: message });
    }

    // খ) ন্যাচারাল ফরম্যাট: .sch আজ ১২টা ২০ 01342707642 কেমন আছো
    const inputEn = bnToEnDigits(input);
    const phoneMatch = inputEn.match(/(?:\+?88)?01[3-9]\d{8}/);
    const isHere = /(?:^|\s)(?:here|এখানে|এই\s*চ্যাটে)(?:\s|$)/i.test(input);
    const ctxInfo = message?.message?.extendedTextMessage?.contextInfo || {};
    const mentionedJid = Array.isArray(ctxInfo.mentionedJid) ? ctxInfo.mentionedJid[0] : '';

    let targetJid = '';
    let targetLabel = '';
    if (phoneMatch) {
        targetJid = toJid(phoneMatch[0]);
        targetLabel = `+${normalizePhone(phoneMatch[0])}`;
    } else if (mentionedJid) {
        targetJid = mentionedJid;
        targetLabel = `+${normalizePhone(mentionedJid) || mentionedJid.split('@')[0]}`;
    } else if (isHere) {
        targetJid = chatId;
        targetLabel = chatId.endsWith('@g.us') ? 'এই গ্রুপ' : 'এই চ্যাট';
    } else if (ctxInfo.participant) {
        targetJid = ctxInfo.participant;
        targetLabel = `+${normalizePhone(ctxInfo.participant) || ctxInfo.participant.split('@')[0]}`;
    }

    if (!targetJid) {
        return safeSend(sock, chatId, {
            text: '❌ প্রাপক পাওয়া যায়নি। নম্বর, মেনশন, `here` অথবা পাইপ ফরম্যাট ব্যবহার করো।\nউদাহরণ: `.sch হুমায়রা | ১০ মিনিট পর | কেমন আছো`'
        }, { quoted: message });
    }

    const parsed = parseNaturalTime(input);
    if (!parsed.ok) {
        return safeSend(sock, chatId, { text: parsed.error }, { quoted: message });
    }

    const daily = /(?:প্রতিদিন|রোজ|daily|everyday)/i.test(input);
    const type = /(?:ভয়েস|ভয়েস|\bvoice\b)/i.test(input) ? 'voice' : /(?:কল\s*রিমাইন্ডার|\bcall\b)/i.test(input) ? 'call' : 'text';
    const msgText = extractMessageFromNaturalSch(input, parsed.matchedText, phoneMatch ? phoneMatch[0] : '');

    const job = addSchedule({
        targetJid,
        targetLabel,
        targetTs: parsed.targetTs,
        text: msgText,
        type,
        daily
    });

    const rollNote = parsed.rolledToNextDay ? '\n_ℹ️ আজকের সময় পার হওয়ায় পরের আসন্ন স্লটে সেট হয়েছে।_' : '';
    return safeSend(sock, chatId, {
        text: `⏰ *শিডিউল সেট হয়েছে (\`${job.id}\`)*\n──────────────\n• *প্রাপক:* ${job.targetLabel}\n• *সময়:* \`${formatDhakaReadable(job.targetTs)}\` [${job.type.toUpperCase()}${job.daily ? ' 🔁' : ''}]\n• *মেসেজ:* "${job.text}"${rollNote}`
    }, { quoted: message });
}

module.exports = {
    startScheduler,
    stopScheduler,
    parseNaturalTime,
    addSchedule,
    formatDhakaReadable,
    getPendingSchedules,
    cancelScheduleById,
    clearAllSchedules,
    getSchedulerStats,
    handleScheduleCommand
};
