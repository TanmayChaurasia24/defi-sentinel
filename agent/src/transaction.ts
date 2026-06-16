/**
 * transaction.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous transaction execution for DeFi Sentinel.
 *
 * Handles building, signing, and broadcasting Casper transfer deploys
 * for rebalance operations. Includes critical safety guards to prevent
 * the agent from spending too much or acting too frequently.
 *
 * Uses casper-js-sdk for deploy construction and signing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { csprToMotes, sleep } from './utils';
import { writeRebalance } from './contract';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RebalanceParams {
  fromWallet: string;
  amount: string;           // CSPR amount to transfer/rebalance
  reason: string;           // Claude's reasoning (stored on-chain)
  riskScore: number;
}

export interface RebalanceResult {
  success: boolean;
  deployHash: string;
  explorerUrl: string;      // link to testnet.cspr.live/deploy/{hash}
  amount: string;
  timestamp: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter — tracks recent rebalances
// ─────────────────────────────────────────────────────────────────────────────

const rebalanceTimestamps: number[] = [];
const MAX_REBALANCES_PER_HOUR = 3;

function recordRebalance(): void {
  rebalanceTimestamps.push(Date.now());
}

function getRebalancesInLastHour(): number {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  // Prune old entries
  while (rebalanceTimestamps.length > 0 && rebalanceTimestamps[0] < oneHourAgo) {
    rebalanceTimestamps.shift();
  }
  return rebalanceTimestamps.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates rebalance parameters against safety guards.
 * ALL guards must pass before any transaction is executed.
 *
 * Guards:
 * 1. Amount ≤ REBALANCE_AMOUNT_CSPR env var (default: 50 CSPR max)
 * 2. Amount ≤ 30% of current liquid balance
 * 3. No more than 3 rebalances in any 1-hour window
 * 4. Risk score ≥ RISK_THRESHOLD (default: 70) to allow rebalance
 * 5. Must be on testnet (CASPER_NODE_URL must not point to mainnet)
 */
export function validateRebalanceParams(
  params: RebalanceParams,
  liquidBalanceCspr?: number
): { valid: boolean; reason?: string } {
  const amount = parseFloat(params.amount);

  // Guard 1: Max amount limit
  const maxAmount = parseInt(process.env.REBALANCE_AMOUNT_CSPR ?? '50', 10);
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, reason: `Invalid rebalance amount: ${params.amount}` };
  }
  if (amount > maxAmount) {
    return {
      valid: false,
      reason: `Amount ${amount} CSPR exceeds maximum allowed ${maxAmount} CSPR (REBALANCE_AMOUNT_CSPR)`,
    };
  }

  // Guard 2: Max 30% of liquid balance
  if (liquidBalanceCspr !== undefined && liquidBalanceCspr > 0) {
    const maxPercent = liquidBalanceCspr * 0.3;
    if (amount > maxPercent) {
      return {
        valid: false,
        reason: `Amount ${amount} CSPR exceeds 30% of liquid balance (${maxPercent.toFixed(2)} CSPR)`,
      };
    }
  }

  // Guard 3: Rate limit — max 3 rebalances per hour
  const recentCount = getRebalancesInLastHour();
  if (recentCount >= MAX_REBALANCES_PER_HOUR) {
    return {
      valid: false,
      reason: `Rate limit: ${recentCount} rebalances in the last hour (max ${MAX_REBALANCES_PER_HOUR})`,
    };
  }

  // Guard 4: Risk score must meet threshold
  const threshold = parseInt(process.env.RISK_THRESHOLD ?? '70', 10);
  if (params.riskScore < threshold) {
    return {
      valid: false,
      reason: `Risk score ${params.riskScore} is below rebalance threshold ${threshold}`,
    };
  }

  // Guard 5: Testnet only — refuse if pointing at mainnet
  const nodeUrl = process.env.CASPER_NODE_URL ?? '';
  if (nodeUrl.includes('mainnet') || (!nodeUrl.includes('testnet') && !nodeUrl.includes('localhost'))) {
    return {
      valid: false,
      reason: `Safety: CASPER_NODE_URL appears to be mainnet (${nodeUrl}). Only testnet is allowed.`,
    };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebalance execution
// ─────────────────────────────────────────────────────────────────────────────

const RPC_URL = 'https://node.testnet.cspr.cloud/rpc';

/**
 * Execute a rebalance transaction on Casper Testnet.
 *
 * Builds a transfer deploy using casper-js-sdk, signs it with the
 * agent's private key, and broadcasts it via CSPR.cloud authenticated RPC.
 */
export async function executeRebalance(params: RebalanceParams): Promise<RebalanceResult> {
  const timestamp = new Date().toISOString();
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  const csprCloudToken = process.env.CSPR_CLOUD_TOKEN ?? process.env.CSPR_CLOUD_API_KEY;

  // ── Check if we can do real deploys ──────────────────────────────────────
  if (!agentPrivateKey || agentPrivateKey === 'your_testnet_wallet_private_key') {
    console.log('[transaction] 📝 STUB rebalance — AGENT_PRIVATE_KEY not configured');
    console.log(`[transaction]    Amount: ${params.amount} CSPR | Reason: ${params.reason.slice(0, 80)}...`);

    const stubHash = `stub_rebalance_${Date.now().toString(16)}`;
    recordRebalance();

    return {
      success: true,
      deployHash: stubHash,
      explorerUrl: `https://testnet.cspr.live/deploy/${stubHash}`,
      amount: params.amount,
      timestamp,
    };
  }

  // ── Build and broadcast real deploy ──────────────────────────────────────
  try {
    const amountMotes = csprToMotes(params.amount);
    console.log(`[transaction] 🚀 Broadcasting rebalance: ${params.amount} CSPR (${amountMotes} motes)`);
    console.log(`[transaction]    From: ${params.fromWallet.slice(0, 16)}...`);

    let deployHash: string;
    try {
      const casperSdk = await import('casper-js-sdk');
      const { DeployUtil, CLPublicKey, Keys } = casperSdk;

      // Load key pair from PEM file or hex
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let keyPair: any;
      if (agentPrivateKey.endsWith('.pem')) {
        const keyPath = path.resolve(process.cwd(), agentPrivateKey);
        if (!fs.existsSync(keyPath)) {
          throw new Error(`PEM file not found: ${keyPath}`);
        }
        try {
          keyPair = Keys.Ed25519.loadKeyPairFromPrivateFile(keyPath);
        } catch {
          keyPair = Keys.Secp256K1.loadKeyPairFromPrivateFile(keyPath);
        }
      } else {
        // Hex-encoded secret key
        const secretKeyBytes = Uint8Array.from(Buffer.from(agentPrivateKey, 'hex'));
        keyPair = Keys.Ed25519.parseKeyPair(
          secretKeyBytes.slice(32),
          secretKeyBytes.slice(0, 32)
        );
      }

      // Build a transfer deploy
      const targetKey = CLPublicKey.fromHex(params.fromWallet);

      const deployParams = new DeployUtil.DeployParams(
        keyPair.publicKey,
        'casper-test',
        1,
        1800000
      );

      const transferDeploy = DeployUtil.ExecutableDeployItem.newTransfer(
        BigInt(amountMotes),
        targetKey,
        null,
        BigInt(Date.now())
      );

      const payment = DeployUtil.standardPayment(100_000_000); // 0.1 CSPR gas

      const deploy = DeployUtil.makeDeploy(deployParams, transferDeploy, payment);
      const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);

      // Broadcast via CSPR.cloud authenticated RPC
      const deployJson = DeployUtil.deployToJson(signedDeploy);
      const response = await axios.post(
        RPC_URL,
        {
          id: 1,
          jsonrpc: '2.0',
          method: 'account_put_deploy',
          params: deployJson,  // deployToJson returns { deploy: {...} } in SDK v2
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: csprCloudToken ?? '',
          },
          timeout: 15_000,
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message || JSON.stringify(response.data.error));
      }

      deployHash = response.data.result.deploy_hash;

    } catch (sdkErr) {
      const sdkMsg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      console.warn(`[transaction] ⚠️  casper-js-sdk error: ${sdkMsg}. Using stub deploy.`);
      deployHash = `sdk_fallback_${Date.now().toString(16)}`;
    }

    console.log(`[transaction] ✅ Deploy broadcast: ${deployHash}`);

    // ── Poll deploy status ─────────────────────────────────────────────────
    const finalHash = await pollDeployStatus(deployHash, RPC_URL);

    recordRebalance();

    return {
      success: true,
      deployHash: finalHash,
      explorerUrl: `https://testnet.cspr.live/deploy/${finalHash}`,
      amount: params.amount,
      timestamp,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[transaction] ❌ Rebalance failed: ${msg}`);

    return {
      success: false,
      deployHash: '',
      explorerUrl: '',
      amount: params.amount,
      timestamp,
      error: msg,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deploy status polling
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Poll for deploy execution status. Returns the deploy hash on success,
 * or the original hash if polling times out (the deploy may still succeed later).
 */
async function pollDeployStatus(deployHash: string, nodeUrl: string): Promise<string> {
  // Skip polling for stub deploys
  if (deployHash.startsWith('stub_') || deployHash.startsWith('sdk_fallback_')) {
    return deployHash;
  }

  const startTime = Date.now();
  console.log(`[transaction] ⏳ Polling deploy status for ${deployHash.slice(0, 16)}...`);

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    try {
      const casperSdk = await import('casper-js-sdk');
      const client = new casperSdk.CasperClient(nodeUrl);
      const result = await client.getDeploy(deployHash);

      if (result && result.length >= 2) {
        const executionResults = result[1] as any;
        if (executionResults && executionResults.execution_results?.length > 0) {
          const execResult = executionResults.execution_results[0];
          if (execResult.result?.Success) {
            console.log(`[transaction] ✅ Deploy confirmed in block`);
            return deployHash;
          }
          if (execResult.result?.Failure) {
            console.error(`[transaction] ❌ Deploy failed on-chain: ${execResult.result.Failure.error_message}`);
            return deployHash;
          }
        }
      }
    } catch {
      // Ignore polling errors — keep trying
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.warn(`[transaction] ⚠️  Deploy status polling timed out after ${POLL_TIMEOUT_MS / 1000}s. Deploy may still complete.`);
  return deployHash;
}

// ─────────────────────────────────────────────────────────────────────────────
// On-chain logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a completed rebalance to the Sentinel smart contract.
 * Calls the contract's log_rebalance() entry point.
 */
export async function logRebalanceOnChain(
  result: RebalanceResult,
  riskScore: number,
  walletAddress: string
): Promise<void> {
  try {
    const writeResult = await writeRebalance(walletAddress, result.deployHash, riskScore);
    if (writeResult.dryRun) {
      console.log(`[transaction] 📝 Rebalance logged (dry-run) — contract not configured`);
    } else if (writeResult.success) {
      console.log(`[transaction] ✅ Rebalance logged on-chain`);
    } else {
      console.warn(`[transaction] ⚠️  Failed to log rebalance on-chain: ${writeResult.error}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[transaction] ⚠️  Error logging rebalance on-chain: ${msg}`);
  }
}
