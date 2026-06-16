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

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as dotenv from 'dotenv';
import { fetchWithPayment, type X402Client } from './x402';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MOTES_PER_CSPR = 1_000_000_000n; // BigInt for precision
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_000;

// Use testnet endpoint during development
const BASE_URL =
  process.env.CSPR_CLOUD_BASE_URL ?? 'https://api.testnet.cspr.cloud';

// ─────────────────────────────────────────────────────────────────────────────
// x402 client injection
// ─────────────────────────────────────────────────────────────────────────────

let _x402Client: X402Client | null = null;

/**
 * Sets the x402 client used for micropayment-wrapped API calls.
 * Call this once during agent startup after creating the x402 client.
 */
export function setX402Client(client: X402Client | null): void {
  _x402Client = client;
  if (client) {
    console.log('[casper] 💸 x402 micropayment client attached');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript interfaces
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// API helper — uses x402 when available, otherwise standard axios
// ─────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const apiKey = process.env.CSPR_CLOUD_API_KEY;
  if (!apiKey || apiKey === 'your_cspr_cloud_key_here') {
    throw new Error(
      'CSPR_CLOUD_API_KEY is not set. Please copy .env.example → .env and add your key.'
    );
  }
  return apiKey;
}

/**
 * Makes an authenticated GET request to CSPR.cloud.
 * If an x402 client is configured, uses fetchWithPayment to handle 402 responses.
 * Otherwise falls back to standard axios.
 */
async function apiGet(path: string): Promise<any> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}${path}`;

  // x402-enabled path
  if (_x402Client) {
    return fetchWithPayment(url, apiKey, _x402Client);
  }

  // Standard axios path
  const { data } = await axios.get(url, {
    timeout: 10_000,
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json',
    },
  });
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retries an async operation up to `MAX_RETRIES` times with exponential backoff.
 * Throws on the final failure.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = RETRY_DELAY_MS * attempt;
      const msg =
        err instanceof AxiosError
          ? `HTTP ${err.response?.status ?? 'timeout'}`
          : String(err);
      console.warn(
        `[casper] ${label} — attempt ${attempt}/${MAX_RETRIES} failed (${msg}). Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a mote string/number to CSPR with 6 decimal places.
 * Guards against negative values and non-numeric strings from malformed API
 * responses — returns '0.000000' on any parse failure.
 */
function motesToCspr(motes: string | number): string {
  try {
    // Truncate any decimal portion the API might return (motes are always integers)
    const raw = String(motes).split('.')[0].trim();
    if (!raw || raw === '' || raw === '-' ) return '0.000000';
    const bigMotes = BigInt(raw);
    // Treat negative balances (shouldn't happen but API bugs exist) as zero
    if (bigMotes < 0n) return '0.000000';
    const whole = bigMotes / MOTES_PER_CSPR;
    const remainder = bigMotes % MOTES_PER_CSPR;
    const decimalStr = remainder.toString().padStart(9, '0').slice(0, 6);
    return `${whole}.${decimalStr}`;
  } catch {
    return '0.000000';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches basic wallet info: liquid balance, staked balance, transfer count.
 *
 * Endpoint: GET /accounts/{account_identifier}
 */
export async function getWalletData(walletAddress: string): Promise<WalletData> {
  return withRetry('getWalletData', async () => {
    try {
      const data = await apiGet(`/accounts/${walletAddress}`);

      // CSPR.cloud returns balance data nested under `data` in their envelope
      const account = data.data ?? data;

      const balanceMotes: string = account.balance ?? '0';
      const delegatedMotes: string = account.delegated_balance ?? '0';

      return {
        address: walletAddress,
        balance: motesToCspr(balanceMotes),
        totalDelegated: motesToCspr(delegatedMotes),
        transferCount: Number(account.transfer_count ?? 0),
        lastActivity: account.last_deploys_at ?? new Date(0).toISOString(),
      };
    } catch (err: any) {
      if (err instanceof AxiosError && err.response?.status === 404) {
        return {
          address: walletAddress,
          balance: '0.000000',
          totalDelegated: '0.000000',
          transferCount: 0,
          lastActivity: new Date(0).toISOString(),
        };
      }
      throw err;
    }
  });
}

/**
 * Fetches the last 10 deploys for a wallet.
 *
 * Endpoint: GET /accounts/{account_identifier}/deploys?page=1&limit=10
 */
export async function getRecentDeploys(walletAddress: string): Promise<Deploy[]> {
  return withRetry('getRecentDeploys', async () => {
    try {
      const data = await apiGet(
        `/accounts/${walletAddress}/deploys?page=1&limit=10`
      );

      const items: unknown[] = data.data ?? data ?? [];

      return items.map((d: any) => ({
        deployHash: d.deploy_hash ?? '',
        blockHash: d.block_hash ?? '',
        timestamp: d.timestamp ?? new Date(0).toISOString(),
        cost: motesToCspr(d.cost ?? 0),
        status: d.error_message ? ('failed' as const) : ('success' as const),
      }));
    } catch (err: any) {
      if (err instanceof AxiosError && err.response?.status === 404) {
        return [];
      }
      throw err;
    }
  });
}

/**
 * Fetches the current CSPR/USD price.
 *
 * Primary:  CSPR.cloud rate-info endpoint
 * Fallback: CoinGecko public API (no key needed)
 */
export async function getCSPRPrice(): Promise<number> {
  // ── Primary: CSPR.cloud ────────────────────────────────────────────────
  try {
    const data = await apiGet('/rates/USD');
    const rate = data.data?.rate ?? data.rate;
    if (typeof rate === 'number' && rate > 0) return rate;
  } catch {
    console.warn('[casper] CSPR.cloud price fetch failed, falling back to CoinGecko...');
  }

  // ── Fallback: CoinGecko ────────────────────────────────────────────────
  return withRetry('getCSPRPrice:coingecko', async () => {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd',
      { timeout: 8_000 }
    );
    const price = data?.['casper-network']?.usd;
    if (typeof price !== 'number' || price <= 0) {
      throw new Error('CoinGecko returned invalid CSPR price');
    }
    return price;
  });
}

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
export async function getDelegationInfo(walletAddress: string): Promise<DelegationInfo> {
  return withRetry('getDelegationInfo', async () => {
    try {
      // Fetch both in parallel
      const [walletData, delegData] = await Promise.all([
        apiGet(`/accounts/${walletAddress}`),
        apiGet(`/accounts/${walletAddress}/delegations?page=1&limit=100`),
      ]);

      const account = walletData.data ?? walletData;
      const delegItems: unknown[] = delegData.data ?? delegData ?? [];

      let totalStakedMotes = 0n;
      const validators: ValidatorStake[] = delegItems.map((d: any) => {
        const staked = BigInt(String(d.stake ?? d.staked_amount ?? 0).split('.')[0]);
        totalStakedMotes += staked;
        return {
          validatorKey: d.validator_public_key ?? d.validator ?? '',
          stakedAmount: motesToCspr(staked.toString()),
        };
      });

      const liquidMotes = BigInt(String(account.balance ?? 0).split('.')[0]);
      const totalMotes = liquidMotes + totalStakedMotes;

      const stakingRatio =
        totalMotes === 0n
          ? 0
          : Number(totalStakedMotes * 10000n / totalMotes) / 10000;

      return {
        totalStaked: motesToCspr(totalStakedMotes.toString()),
        validators,
        stakingRatio,
      };
    } catch (err: any) {
      if (err instanceof AxiosError && err.response?.status === 404) {
        return {
          totalStaked: '0.000000',
          validators: [],
          stakingRatio: 0,
        };
      }
      throw err;
    }
  });
}

/**
 * Lightweight connectivity check — returns true if the API is reachable.
 * Always returns a boolean — never throws, even if the API key is unset
 * (catches the key-validation error from getApiKey too).
 */
export async function testApiConnectivity(): Promise<boolean> {
  try {
    await apiGet('/blocks?page=1&limit=1');
    return true;
  } catch {
    // Intentionally silent — caller logs the result
    return false;
  }
}
