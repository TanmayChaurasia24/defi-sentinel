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
export interface RebalanceParams {
    fromWallet: string;
    amount: string;
    reason: string;
    riskScore: number;
}
export interface RebalanceResult {
    success: boolean;
    deployHash: string;
    explorerUrl: string;
    amount: string;
    timestamp: string;
    error?: string;
}
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
export declare function validateRebalanceParams(params: RebalanceParams, liquidBalanceCspr?: number): {
    valid: boolean;
    reason?: string;
};
/**
 * Execute a rebalance transaction on Casper Testnet.
 *
 * Builds a transfer deploy using casper-js-sdk, signs it with the
 * agent's private key, and broadcasts it via CSPR.cloud authenticated RPC.
 */
export declare function executeRebalance(params: RebalanceParams): Promise<RebalanceResult>;
/**
 * Log a completed rebalance to the Sentinel smart contract.
 * Calls the contract's log_rebalance() entry point.
 */
export declare function logRebalanceOnChain(result: RebalanceResult, riskScore: number, walletAddress: string): Promise<void>;
//# sourceMappingURL=transaction.d.ts.map