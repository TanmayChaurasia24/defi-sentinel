/**
 * casper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CSPR.cloud REST API client for DeFi Sentinel.
 *
 * Fetches wallet balances, delegation info, recent deploys, and the current
 * CSPR/USD price from the CSPR.cloud API.
 *
 * All CSPR.cloud balance fields are returned in **motes**.
 * 1 CSPR = 1,000,000,000 motes — always convert before display/scoring.
 *
 * x402 Integration: when an x402Client is configured (via setX402Client),
 * API calls are routed through the x402 payment wrapper so that 402
 * Payment Required responses are handled transparently.
 *
 * Base URL:  https://api.cspr.cloud  (mainnet)
 *            https://api.testnet.cspr.cloud  (testnet — used here)
 * Auth:      authorization: <API_KEY>  (header name is lowercase)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { type X402Client } from './x402';
/**
 * Sets the x402 client used for micropayment-wrapped API calls.
 * Call this once during agent startup after creating the x402 client.
 */
export declare function setX402Client(client: X402Client | null): void;
export interface WalletData {
    address: string;
    /** Liquid (unstaked) balance in CSPR */
    balance: string;
    /** Total delegated/staked balance in CSPR */
    totalDelegated: string;
    /** Number of transfers the account has been involved in */
    transferCount: number;
    /** ISO-8601 date of the last on-chain activity */
    lastActivity: string;
}
export interface ValidatorStake {
    validatorKey: string;
    /** Amount staked with this validator in CSPR */
    stakedAmount: string;
}
export interface DelegationInfo {
    /** Total CSPR delegated across all validators */
    totalStaked: string;
    validators: ValidatorStake[];
    /** delegated / (liquid + delegated) — range 0–1 */
    stakingRatio: number;
}
export interface Deploy {
    deployHash: string;
    blockHash: string;
    timestamp: string;
    /** Cost in CSPR */
    cost: string;
    status: 'success' | 'failed';
}
/**
 * Fetches basic wallet info: liquid balance, staked balance, transfer count.
 *
 * Endpoint: GET /accounts/{account_identifier}
 */
export declare function getWalletData(walletAddress: string): Promise<WalletData>;
/**
 * Fetches the last 10 deploys for a wallet.
 *
 * Endpoint: GET /accounts/{account_identifier}/deploys?page=1&limit=10
 */
export declare function getRecentDeploys(walletAddress: string): Promise<Deploy[]>;
/**
 * Fetches the current CSPR/USD price.
 *
 * Primary:  CSPR.cloud rate-info endpoint
 * Fallback: CoinGecko public API (no key needed)
 */
export declare function getCSPRPrice(): Promise<number>;
/**
 * Fetches staking/delegation info for a wallet.
 *
 * Endpoint: GET /accounts/{account_identifier}/delegations
 *
 * Returns:
 *  - `totalStaked`   — sum of all delegated amounts in CSPR
 *  - `validators`    — per-validator breakdown
 *  - `stakingRatio`  — delegated / (liquid + delegated), used in risk scoring
 */
export declare function getDelegationInfo(walletAddress: string): Promise<DelegationInfo>;
/**
 * Lightweight connectivity check — returns true if the API is reachable.
 * Always returns a boolean — never throws, even if the API key is unset
 * (catches the key-validation error from getApiKey too).
 */
export declare function testApiConnectivity(): Promise<boolean>;
//# sourceMappingURL=casper.d.ts.map