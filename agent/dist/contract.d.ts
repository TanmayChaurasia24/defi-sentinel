/**
 * contract.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DeFi Sentinel on-chain interaction module.
 *
 * Writes agent actions to the SentinelContract deployed on Casper Testnet.
 * Uses the casper-js-sdk to build and sign deploy objects, then submits
 * them via the CSPR.cloud authenticated RPC endpoint.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { RiskResult } from './risk';
export interface ContractWriteResult {
    success: boolean;
    deployHash?: string;
    error?: string;
    /** True if this was a dry-run (contract not configured) */
    dryRun: boolean;
}
/**
 * Writes an updated risk score to the Sentinel contract.
 * Calls the `update_risk_score` entry point.
 */
export declare function writeRiskScore(walletAddress: string, score: number): Promise<ContractWriteResult>;
/**
 * Logs a rebalance action to the Sentinel contract.
 * Calls the `log_rebalance` entry point.
 */
export declare function writeRebalance(walletAddress: string, deployHash: string, score: number): Promise<ContractWriteResult>;
/**
 * Logs an alert or hold action to the Sentinel contract.
 * Calls the `log_action` entry point.
 */
export declare function writeAction(walletAddress: string, result: RiskResult): Promise<ContractWriteResult>;
export interface ContractAction {
    actionType: string;
    score: number;
    timestamp: number;
    deployHash?: string;
}
/**
 * Logs an alert action to the Sentinel contract.
 * Called when the agent decides to alert (risk score 40–69).
 */
export declare function logAlertOnChain(walletAddress: string, riskScore: number, warnings: string[]): Promise<void>;
/**
 * Fetches action history from the Sentinel contract.
 * Returns empty array — dashboard uses in-memory action log from server.ts.
 */
export declare function getContractActionHistory(_walletAddress: string, limit: number): Promise<ContractAction[]>;
//# sourceMappingURL=contract.d.ts.map