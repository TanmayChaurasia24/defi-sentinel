"use strict";
/**
 * utils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utility functions for DeFi Sentinel agent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.motesToCSPR = motesToCSPR;
exports.csprToMotes = csprToMotes;
exports.generateId = generateId;
exports.formatRelativeTime = formatRelativeTime;
exports.sleep = sleep;
const crypto_1 = require("crypto");
// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MOTES_PER_CSPR = 1000000000n;
// ─────────────────────────────────────────────────────────────────────────────
// Mote / CSPR conversions
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Convert a mote string to CSPR with 6 decimal places.
 * Returns '0.000000' on any parse failure.
 */
function motesToCSPR(motes) {
    try {
        const raw = String(motes).split('.')[0].trim();
        if (!raw || raw === '' || raw === '-')
            return '0.000000';
        const bigMotes = BigInt(raw);
        if (bigMotes < 0n)
            return '0.000000';
        const whole = bigMotes / MOTES_PER_CSPR;
        const remainder = bigMotes % MOTES_PER_CSPR;
        const decimalStr = remainder.toString().padStart(9, '0').slice(0, 6);
        return `${whole}.${decimalStr}`;
    }
    catch {
        return '0.000000';
    }
}
/**
 * Convert a CSPR string to motes string.
 * e.g. "50" → "50000000000", "1.5" → "1500000000"
 */
function csprToMotes(cspr) {
    try {
        const parts = cspr.split('.');
        const wholePart = parts[0] || '0';
        const fracPart = (parts[1] || '').padEnd(9, '0').slice(0, 9);
        const bigWhole = BigInt(wholePart) * MOTES_PER_CSPR;
        const bigFrac = BigInt(fracPart);
        return (bigWhole + bigFrac).toString();
    }
    catch {
        return '0';
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────
/** Generate a UUID v4 string. */
function generateId() {
    return (0, crypto_1.randomUUID)();
}
// ─────────────────────────────────────────────────────────────────────────────
// Date / time helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Format an ISO date string into a relative human string.
 * e.g. "2 hours ago", "5 minutes ago", "just now"
 */
function formatRelativeTime(iso) {
    const now = Date.now();
    const then = new Date(iso).getTime();
    if (isNaN(then))
        return 'unknown';
    const diffMs = now - then;
    if (diffMs < 0)
        return 'just now';
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60)
        return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────────────
/** Async sleep for the specified number of milliseconds. */
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=utils.js.map