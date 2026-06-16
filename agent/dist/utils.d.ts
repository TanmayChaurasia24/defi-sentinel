/**
 * utils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utility functions for DeFi Sentinel agent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * Convert a mote string to CSPR with 6 decimal places.
 * Returns '0.000000' on any parse failure.
 */
export declare function motesToCSPR(motes: string): string;
/**
 * Convert a CSPR string to motes string.
 * e.g. "50" → "50000000000", "1.5" → "1500000000"
 */
export declare function csprToMotes(cspr: string): string;
/** Generate a UUID v4 string. */
export declare function generateId(): string;
/**
 * Format an ISO date string into a relative human string.
 * e.g. "2 hours ago", "5 minutes ago", "just now"
 */
export declare function formatRelativeTime(iso: string): string;
/** Async sleep for the specified number of milliseconds. */
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=utils.d.ts.map