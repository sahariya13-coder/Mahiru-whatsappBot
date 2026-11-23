/**
 * PRIME MONIR • Maya v2.0 ULTRA — Smart Chat Queue, Global Semaphore, Coalescer & Anti-Spam Engine
 * Tuned for 256MB RAM (Bounded Maps, Global Concurrency Cap + Owner Priority Lane, Presence Failsafe)
 * 100% Backward-Compatible Exports + Dynamic Owner / LID Bypass Parity
 */

let settings = null;
try { settings = require('../settings'); } catch {}

let chalk;
try {
    chalk = require('chalk');
} catch {
    chalk = { cyan: (s) => s, yellow: (s) => s, green: (s) => s, red: (s) => s };
}

let registerCleanupHook = null;
try { ({ registerCleanupHook } = require('./systemOptimizer')); } catch {}

const queueCfg = settings?.maya?.queue || {};

const DEFAULT_CONFIG = {
    // মেসেজ কোয়ালেসিং (পরপর ছোট মেসেজ একত্রিত করা)
    coalesceEnabled: queueCfg.coalesceEnabled !== false,
    coalesceWindowMs: Number(queueCfg.coalesceWindowMs || 2000),
    coalesceMaxWaitMs: Number(queueCfg.coalesceMaxWaitMs || 5500),
    coalesceMaxMessages: 6,
    coalesceMaxChars: 1600,
    maxCoalesceBuffers: 80,              // ২৫৬MB RAM: বাউন্ডেড কোয়ালেস বাফার
    commandPrefixes: ['.', '/', '!'],

    // গ্লোবাল কনকারেন্সি ও পার-চ্যাট সিরিয়াল লক (৫০+ ইউজারে OOM প্রিভেনশন)
    maxGlobalConcurrent: 4,              // একসাথে সর্বোচ্চ ৪টি চ্যাট প্রসেস (RAM স্থির রাখে)
    maxPriorityConcurrent: 2,            // ওনার কমান্ডের জন্য আলাদা ২টি রিজার্ভ ফাস্ট-স্লট
    maxGlobalWaitQueue: 60,              // অতিরিক্ত ট্র্যাফিকে কিউ ওভারফ্লো শিল্ড
    taskTimeoutMs: Number(queueCfg.taskTimeoutMs || 65000),
    maxPendingPerChat: 5,

    // অ্যান্টি-স্প্যাম রেট লিমিটার (স্লাইডিং উইন্ডো + বাউন্ডেড ম্যাপ)
    rateLimitEnabled: queueCfg.rateLimitEnabled !== false,
    rateWindowMs: 60 * 1000,
    maxMessagesPerMinPrivate: Number(queueCfg.maxMessagesPerMinPrivate || 14),
    maxMessagesPerMinGroup: Number(queueCfg.maxMessagesPerMinGroup || 8),
    floodCooldownMs: 45 * 1000,
    warnCooldownMs: 5 * 60 * 1000,
    maxRateMapSize: 250,

    // হিউম্যান প্রেজেন্স ও অ্যান্টি-ব্যান ডিলে
    humanPresenceEnabled: queueCfg.humanPresenceEnabled !== false,
    readReceiptMinMs: 350,
    readReceiptMaxMs: 1100,
    typingHeartbeatMs: 9000,
    maxPresenceDurationMs: 45 * 1000,    // ফরগটেন প্রেজেন্স অটো-স্টপ গার্ড
    minHumanDelayMs: 600,
    maxHumanDelayMs: 2200,

    // মেমোরি সেফটি
    sweepIntervalMs: 10 * 60 * 1000,
    staleEntryTtlMs: 20 * 60 * 1000
};

function sleep(ms) {
    return new Promise((resolve) => {
        const t = setTimeout(resolve, ms);
        if (t.unref) t.unref();
    });
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizePhoneDigits(raw = '') {
    if (typeof settings?.normalizePhone === 'function') {
        return settings.normalizePhone(raw);
    }
    const str = String(raw || '').trim();
    if (!str || str.includes('@lid') || str.endsWith('@g.us')) return '';
    let digits = str.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('01')) digits = `88${digits}`;
    else if (digits.length === 10 && /^1[3-9]/.test(digits)) digits = `880${digits}`;
    else if (digits.startsWith('00880')) digits = digits.slice(2);
    return (digits.length >= 10 && digits.length <= 15) ? digits : '';
}

class ChatQueueEngine {
    constructor(customConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...customConfig };

        // পার-চ্যাট সিরিয়াল লক (chatId -> { chain, pendingCount, lastUsedAt })
        this.locks = new Map();

        // গ্লোবাল কনকারেন্সি সেমাফোর স্টেট
        this.activeNormalSlots = 0;
        this.activePrioritySlots = 0;
        this.globalWaitQueue = []; // { priority, resolve }

        // মেসেজ কোয়ালেসিং বাফার
        this.coalesceBuffers = new Map();

        // বাউন্ডেড রেট লিমিটার
        this.rateMap = new Map();

        // অ্যাক্টিভ প্রেজেন্স সেশন (chatId -> stopFn)
        this.activePresences = new Map();

        // ওনার ও VIP বাইপাস সেট
        this.bypassNumbers = new Set();

        this.metrics = {
            totalEnqueued: 0,
            totalCompleted: 0,
            totalTimedOut: 0,
            totalErrors: 0,
            totalCoalescedBatches: 0,
            totalSavedCalls: 0,
            totalRateLimited: 0,
            totalDroppedOverflow: 0,
            peakConcurrent: 0
        };

        this.isShuttingDown = false;

        // বুটেই সুপার ও ডায়নামিক ওনার নম্বর বাইপাসে লোড
        try {
            if (typeof settings?.getAllOwnerNumbers === 'function') {
                this.setBypassNumbers(settings.getAllOwnerNumbers());
            } else if (Array.isArray(settings?.ownerNumbers)) {
                this.setBypassNumbers(settings.ownerNumbers);
            }
        } catch {}

        this.sweepTimer = setInterval(() => this.sweepStaleState(), this.config.sweepIntervalMs);
        if (this.sweepTimer.unref) this.sweepTimer.unref();

        if (typeof registerCleanupHook === 'function') {
            registerCleanupHook('chatQueue', () => this.sweepStaleState(true));
        }

        global.chatQueue = this;
    }

    configure(overrides = {}) {
        this.config = { ...this.config, ...overrides };
        return this;
    }

    setBypassNumbers(numbers = []) {
        this.bypassNumbers.clear();
        for (const n of numbers || []) {
            const digits = normalizePhoneDigits(n);
            if (digits) this.bypassNumbers.add(digits);
        }
    }

    isBypassUser(senderJid = '', isOwner = false) {
        if (isOwner) return true;
        if (!senderJid) return false;

        if (typeof global.__PRIME_IS_DYNAMIC_OWNER__ === 'function') {
            try { if (global.__PRIME_IS_DYNAMIC_OWNER__(senderJid, '', null)) return true; } catch {}
        }
        if (typeof settings?.isOwnerJid === 'function') {
            try { if (settings.isOwnerJid(senderJid)) return true; } catch {}
        }

        const digits = normalizePhoneDigits(senderJid);
        return Boolean(digits && this.bypassNumbers.has(digits));
    }

    // --- গ্লোবাল কনকারেন্সি সেমাফোর (২৫৬MB RAM-এ ৫০+ ইউজারেও স্ট্যাবল) ---
    acquireGlobalSlot(priority = false) {
        if (priority) {
            if (this.activePrioritySlots < this.config.maxPriorityConcurrent) {
                this.activePrioritySlots++;
                this.updatePeakConcurrent();
                return Promise.resolve('priority');
            }
        }
        if (this.activeNormalSlots < this.config.maxGlobalConcurrent) {
            this.activeNormalSlots++;
            this.updatePeakConcurrent();
            return Promise.resolve('normal');
        }
        if (!priority && this.globalWaitQueue.length >= this.config.maxGlobalWaitQueue) {
            return Promise.resolve(null); // ওভারফ্লো প্রটেকশন
        }

        return new Promise((resolve) => {
            const waiter = { priority, resolve };
            if (priority) {
                // ওনার টাস্ক কিউয়ের একদম সামনে ঢুকবে
                const firstNormalIdx = this.globalWaitQueue.findIndex((w) => !w.priority);
                if (firstNormalIdx === -1) this.globalWaitQueue.push(waiter);
                else this.globalWaitQueue.splice(firstNormalIdx, 0, waiter);
            } else {
                this.globalWaitQueue.push(waiter);
            }
        });
    }

    releaseGlobalSlot(lane) {
        if (lane === 'priority') {
            this.activePrioritySlots = Math.max(0, this.activePrioritySlots - 1);
        } else if (lane === 'normal') {
            this.activeNormalSlots = Math.max(0, this.activeNormalSlots - 1);
        }

        if (!this.globalWaitQueue.length) return;

        // প্রায়োরিটি ওয়েটার আগে সার্ভ করা
        if (this.activePrioritySlots < this.config.maxPriorityConcurrent) {
            const pIdx = this.globalWaitQueue.findIndex((w) => w.priority);
            if (pIdx !== -1) {
                const [next] = this.globalWaitQueue.splice(pIdx, 1);
                this.activePrioritySlots++;
                this.updatePeakConcurrent();
                next.resolve('priority');
                return;
            }
        }

        if (this.activeNormalSlots < this.config.maxGlobalConcurrent) {
            const next = this.globalWaitQueue.shift();
            if (next) {
                this.activeNormalSlots++;
                this.updatePeakConcurrent();
                next.resolve('normal');
            }
        }
    }

    updatePeakConcurrent() {
        const total = this.activeNormalSlots + this.activePrioritySlots;
        if (total > this.metrics.peakConcurrent) this.metrics.peakConcurrent = total;
    }

    // --- অ্যান্টি-স্প্যাম রেট লিমিটার (বাউন্ডেড LRU ম্যাপ) ---
    checkRateLimit(chatId, senderJid = '', { isGroup = false, isOwner = false } = {}) {
        if (!this.config.rateLimitEnabled || this.isBypassUser(senderJid, isOwner)) {
            return { allowed: true, shouldWarn: false, retryAfterSec: 0 };
        }

        const now = Date.now();
        const key = isGroup ? `${chatId}::${senderJid || 'unknown'}` : chatId;
        let entry = this.rateMap.get(key);

        if (!entry) {
            if (this.rateMap.size >= this.config.maxRateMapSize) {
                this.rateMap.delete(this.rateMap.keys().next().value);
            }
            entry = { timestamps: [], blockedUntil: 0, lastWarnAt: 0, lastSeenAt: now };
        } else {
            this.rateMap.delete(key); // LRU রিফ্রেশ
        }
        entry.lastSeenAt = now;
        this.rateMap.set(key, entry);

        if (entry.blockedUntil > now) {
            this.metrics.totalRateLimited++;
            return {
                allowed: false,
                shouldWarn: false,
                retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000)
            };
        }

        const cutoff = now - this.config.rateWindowMs;
        entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
        entry.timestamps.push(now);

        const limit = isGroup
            ? this.config.maxMessagesPerMinGroup
            : this.config.maxMessagesPerMinPrivate;

        if (entry.timestamps.length > limit) {
            entry.blockedUntil = now + this.config.floodCooldownMs;
            this.metrics.totalRateLimited++;

            const shouldWarn = (now - entry.lastWarnAt) > this.config.warnCooldownMs;
            if (shouldWarn) entry.lastWarnAt = now;

            return {
                allowed: false,
                shouldWarn,
                retryAfterSec: Math.ceil(this.config.floodCooldownMs / 1000)
            };
        }

        return { allowed: true, shouldWarn: false, retryAfterSec: 0 };
    }

    resetRateLimit(chatId, senderJid = '') {
        if (chatId) this.rateMap.delete(chatId);
        if (chatId && senderJid) this.rateMap.delete(`${chatId}::${senderJid}`);
        if (senderJid) this.rateMap.delete(senderJid);
    }

    shouldBypassCoalesce(item = {}) {
        if (!this.config.coalesceEnabled) return true;
        if (item.bypassCoalesce || item.hasMedia || item.isVoice || item.isCommand) return true;

        const text = String(item.text || '').trim();
        if (!text) return true;
        if (this.config.commandPrefixes.some((p) => text.startsWith(p))) return true;
        if (text.length >= 250) return true;
        return false;
    }

    /**
     * পার-চ্যাট সিরিয়াল লক + গ্লোবাল কনকারেন্সি সেমাফোর + ডেডলক গার্ড
     */
    enqueue(chatId, taskFn, { priority = false } = {}) {
        if (this.isShuttingDown || !chatId || typeof taskFn !== 'function') {
            return Promise.resolve(null);
        }

        let state = this.locks.get(chatId);
        if (!state) {
            state = { chain: Promise.resolve(), pendingCount: 0, lastUsedAt: Date.now() };
            this.locks.set(chatId, state);
        }

        if (!priority && state.pendingCount >= this.config.maxPendingPerChat) {
            this.metrics.totalDroppedOverflow++;
            console.log(chalk.yellow(`⚠️ [ChatQueue] Per-chat overflow for ${chatId}, dropping excess.`));
            return Promise.resolve(null);
        }

        state.pendingCount++;
        state.lastUsedAt = Date.now();
        this.metrics.totalEnqueued++;

        const runWithGuards = async () => {
            if (this.isShuttingDown) return null;

            const lane = await this.acquireGlobalSlot(priority);
            if (!lane) {
                this.metrics.totalDroppedOverflow++;
                console.log(chalk.yellow(`⚠️ [ChatQueue] Global queue saturated, dropping non-priority task for ${chatId}.`));
                return null;
            }

            let timer = null;
            let released = false;
            const releaseOnce = () => {
                if (released) return;
                released = true;
                this.releaseGlobalSlot(lane);
            };

            try {
                const result = await Promise.race([
                    Promise.resolve().then(() => taskFn()),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => {
                            const err = new Error(`ChatQueue task timeout (${this.config.taskTimeoutMs}ms)`);
                            err.code = 'QUEUE_TIMEOUT';
                            reject(err);
                        }, this.config.taskTimeoutMs);
                        if (timer.unref) timer.unref();
                    })
                ]);
                this.metrics.totalCompleted++;
                return result;
            } catch (err) {
                if (err?.code === 'QUEUE_TIMEOUT') {
                    this.metrics.totalTimedOut++;
                    console.error(chalk.red(`⏱️ [ChatQueue] Deadlock guard triggered for ${chatId}`));
                } else {
                    this.metrics.totalErrors++;
                    console.error(chalk.red(`⚠️ [ChatQueue:${chatId}] Task error:`), err?.message || err);
                }
                return null;
            } finally {
                if (timer) clearTimeout(timer);
                releaseOnce();
            }
        };

        const nextPromise = state.chain.then(runWithGuards, runWithGuards);
        state.chain = nextPromise.finally(() => {
            state.pendingCount = Math.max(0, state.pendingCount - 1);
            state.lastUsedAt = Date.now();
            if (state.pendingCount === 0 && this.locks.get(chatId) === state) {
                this.locks.delete(chatId);
            }
        });

        return nextPromise;
    }

    /**
     * স্মার্ট ইনবাউন্ড এন্ট্রি পয়েন্ট (র‍্যাম-সাশ্রয়ী কোয়ালেসার + ডুপ্লিকেট লাইন ফিল্টার)
     */
    submitMessage(params, handler) {
        if (this.isShuttingDown || !params?.chatId || typeof handler !== 'function') return;

        const {
            chatId,
            senderId = chatId,
            isGroup = chatId.endsWith('@g.us'),
            priority = false
        } = params;

        const coalesceKey = isGroup ? `${chatId}::${senderId}` : chatId;

        if (this.shouldBypassCoalesce(params)) {
            if (this.coalesceBuffers.has(coalesceKey)) {
                this.flushCoalesceKey(coalesceKey);
            }

            this.enqueue(chatId, () =>
                handler({
                    chatId,
                    senderId,
                    isGroup,
                    combinedText: String(params.text || '').trim(),
                    messages: [params],
                    lastMessage: params.raw || null,
                    isCoalesced: false
                }),
            { priority });
            return;
        }

        const now = Date.now();
        let buf = this.coalesceBuffers.get(coalesceKey);

        if (!buf) {
            // বাফার লিমিট পূর্ণ হলে সবচেয়ে পুরোনো বাফার আগে ফ্লাশ করে RAM বাঁচানো
            if (this.coalesceBuffers.size >= this.config.maxCoalesceBuffers) {
                const oldestKey = this.coalesceBuffers.keys().next().value;
                if (oldestKey) this.flushCoalesceKey(oldestKey);
            }
            buf = {
                chatId,
                senderId,
                isGroup,
                priority,
                items: [],
                lastRaw: null,
                totalChars: 0,
                firstAt: now,
                timer: null,
                handler
            };
            this.coalesceBuffers.set(coalesceKey, buf);
        }

        const cleanText = String(params.text || '').trim();
        // ভারী raw Baileys অবজেক্ট শুধু সর্বশেষটির জন্য রাখা (মেমোরি সাশ্রয়)
        buf.items.push({ chatId, senderId, isGroup, text: cleanText, ts: now });
        buf.lastRaw = params.raw || buf.lastRaw;
        buf.totalChars += cleanText.length;
        buf.handler = handler;

        if (buf.timer) {
            clearTimeout(buf.timer);
            buf.timer = null;
        }

        const elapsed = now - buf.firstAt;
        const remainingMax = this.config.coalesceMaxWaitMs - elapsed;

        if (
            buf.items.length >= this.config.coalesceMaxMessages ||
            buf.totalChars >= this.config.coalesceMaxChars ||
            remainingMax <= 100
        ) {
            this.flushCoalesceKey(coalesceKey);
            return;
        }

        const delayMs = Math.min(this.config.coalesceWindowMs, remainingMax);
        buf.timer = setTimeout(() => this.flushCoalesceKey(coalesceKey), delayMs);
        if (buf.timer.unref) buf.timer.unref();
    }

    flushCoalesceKey(coalesceKey) {
        const buf = this.coalesceBuffers.get(coalesceKey);
        if (!buf) return;

        if (buf.timer) clearTimeout(buf.timer);
        this.coalesceBuffers.delete(coalesceKey);
        if (!buf.items.length) return;

        const isCoalesced = buf.items.length > 1;
        if (isCoalesced) {
            this.metrics.totalCoalescedBatches++;
            this.metrics.totalSavedCalls += buf.items.length - 1;
        }

        // পরপর হুবহু একই টেক্সট (যেমন ডাবল ট্যাপ "হাই", "হাই") ডি-ডুপ্লিকেট করা
        const dedupedLines = [];
        for (const it of buf.items) {
            const line = String(it.text || '').trim();
            if (!line) continue;
            if (!dedupedLines.length || dedupedLines[dedupedLines.length - 1].toLowerCase() !== line.toLowerCase()) {
                dedupedLines.push(line);
            }
        }

        const combinedText = dedupedLines.join('\n');
        const lastMessage = buf.lastRaw || null;
        buf.lastRaw = null;

        this.enqueue(buf.chatId, () =>
            buf.handler({
                chatId: buf.chatId,
                senderId: buf.senderId,
                isGroup: buf.isGroup,
                combinedText,
                messages: buf.items,
                lastMessage,
                isCoalesced
            }),
        { priority: Boolean(buf.priority) });
    }

    flushAllCoalesce() {
        for (const key of Array.from(this.coalesceBuffers.keys())) {
            this.flushCoalesceKey(key);
        }
    }

    async markReadNaturally(sock, messageKey) {
        if (!this.config.humanPresenceEnabled || !sock || !messageKey) return;
        try {
            await sleep(randomInt(this.config.readReceiptMinMs, this.config.readReceiptMaxMs));
            if (typeof sock.readMessages === 'function') {
                await sock.readMessages([messageKey]);
            }
        } catch {}
    }

    /**
     * হিউম্যান প্রেজেন্স হার্টবিট + ৪৫ সেকেন্ডের অটো-স্টপ মেমোরি শিল্ড
     */
    startPresence(sock, chatId, mode = 'composing') {
        if (!this.config.humanPresenceEnabled || !sock || !chatId) {
            return async () => {};
        }

        const prevStop = this.activePresences.get(chatId);
        if (prevStop) {
            try { prevStop(true); } catch {}
        }

        let stopped = false;
        const sendState = async (state) => {
            try {
                if (typeof sock.sendPresenceUpdate === 'function') {
                    await sock.sendPresenceUpdate(state, chatId);
                }
            } catch {}
        };

        sendState(mode);
        const interval = setInterval(() => {
            if (!stopped) sendState(mode);
        }, this.config.typingHeartbeatMs);
        if (interval.unref) interval.unref();

        const autoStopTimer = setTimeout(() => {
            stop(false).catch(() => {});
        }, this.config.maxPresenceDurationMs);
        if (autoStopTimer.unref) autoStopTimer.unref();

        const stop = async (silent = false) => {
            if (stopped) return;
            stopped = true;
            clearInterval(interval);
            clearTimeout(autoStopTimer);
            if (this.activePresences.get(chatId) === stop) {
                this.activePresences.delete(chatId);
            }
            if (!silent) await sendState('paused');
        };

        this.activePresences.set(chatId, stop);
        return stop;
    }

    async withPresence(sock, chatId, mode, fn) {
        const stop = this.startPresence(sock, chatId, mode);
        try {
            return await fn();
        } finally {
            await stop();
        }
    }

    async humanReplyDelay(replyText = '', alreadyElapsedMs = 0) {
        if (!this.config.humanPresenceEnabled) return;
        const len = String(replyText || '').length;
        const targetMs = Math.min(
            this.config.maxHumanDelayMs,
            Math.max(this.config.minHumanDelayMs, Math.round(len * 12))
        );
        const remaining = targetMs - alreadyElapsedMs;
        if (remaining > 150) await sleep(remaining);
    }

    sweepStaleState(aggressive = false) {
        const now = Date.now();
        const ttl = aggressive ? 4 * 60 * 1000 : this.config.staleEntryTtlMs;

        for (const [key, entry] of this.rateMap.entries()) {
            if (entry.blockedUntil <= now && (now - entry.lastSeenAt) > ttl) {
                this.rateMap.delete(key);
            }
        }
        while (this.rateMap.size > this.config.maxRateMapSize) {
            this.rateMap.delete(this.rateMap.keys().next().value);
        }

        for (const [chatId, state] of this.locks.entries()) {
            if (state.pendingCount === 0 && (now - state.lastUsedAt) > ttl) {
                this.locks.delete(chatId);
            }
        }

        if (aggressive) {
            for (const [key, buf] of this.coalesceBuffers.entries()) {
                if (now - buf.firstAt > this.config.coalesceMaxWaitMs * 2) {
                    this.flushCoalesceKey(key);
                }
            }
        }
    }

    getStats() {
        return {
            activeChats: this.locks.size,
            activeGlobalSlots: this.activeNormalSlots + this.activePrioritySlots,
            waitingGlobalTasks: this.globalWaitQueue.length,
            pendingCoalesceBuffers: this.coalesceBuffers.size,
            trackedRateUsers: this.rateMap.size,
            activePresences: this.activePresences.size,
            coalesceEnabled: this.config.coalesceEnabled,
            rateLimitEnabled: this.config.rateLimitEnabled,
            ...this.metrics
        };
    }

    shutdown() {
        this.isShuttingDown = true;
        clearInterval(this.sweepTimer);

        for (const [, buf] of this.coalesceBuffers.entries()) {
            if (buf.timer) clearTimeout(buf.timer);
            buf.lastRaw = null;
        }
        this.coalesceBuffers.clear();

        while (this.globalWaitQueue.length) {
            const w = this.globalWaitQueue.shift();
            try { w.resolve(null); } catch {}
        }

        for (const [, stop] of this.activePresences.entries()) {
            try { stop(true); } catch {}
        }
        this.activePresences.clear();
    }
}

const chatQueue = new ChatQueueEngine();

module.exports = {
    ChatQueueEngine,
    chatQueue,
    enqueueChat: (chatId, fn, opts) => chatQueue.enqueue(chatId, fn, opts),
    submitMessage: (params, handler) => chatQueue.submitMessage(params, handler),
    checkRateLimit: (chatId, senderJid, opts) => chatQueue.checkRateLimit(chatId, senderJid, opts),
    resetRateLimit: (chatId, senderJid) => chatQueue.resetRateLimit(chatId, senderJid),
    setBypassNumbers: (nums) => chatQueue.setBypassNumbers(nums),
    startPresence: (sock, chatId, mode) => chatQueue.startPresence(sock, chatId, mode),
    withPresence: (sock, chatId, mode, fn) => chatQueue.withPresence(sock, chatId, mode, fn),
    markReadNaturally: (sock, key) => chatQueue.markReadNaturally(sock, key),
    humanReplyDelay: (text, elapsed) => chatQueue.humanReplyDelay(text, elapsed),
    getQueueStats: () => chatQueue.getStats(),
    shutdownChatQueue: () => chatQueue.shutdown()
};
