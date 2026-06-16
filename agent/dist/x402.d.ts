/**
 * x402.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * x402 micropayment protocol client for DeFi Sentinel.
 *
 * Implements Casper's HTTP-native payment protocol where the agent
 * automatically pays a tiny amount of CSPR for each API data request,
 * with cryptographic proof attached to the HTTP header.
 *
 * Graceful fallback: if x402 payment fails or returns an error, logs
 * the error but still completes the API call without payment. Never
 * lets x402 block the agent from running.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface X402PaymentProof {
    paymentHeader: string;
    txHash: string;
    amount: string;
    recipient: string;
    timestamp: string;
}
export interface X402Client {
    fetch: (url: string, options?: RequestInit) => Promise<Response>;
    getPaymentHistory: () => X402PaymentProof[];
    getTotalSpent: () => string;
}
export interface X402Status {
    totalCalls: number;
    totalSpentCSPR: string;
    lastPayment: X402PaymentProof | null;
    averageCostPerCall: string;
}
/**
 * Creates an x402 payment client that wraps HTTP requests with
 * automatic micropayment capability.
 */
export declare function createX402Client(config: {
    agentWallet: string;
    agentPrivateKey: string;
    facilitatorUrl: string;
}): X402Client;
/**
 * Returns aggregated x402 payment statistics for the dashboard.
 */
export declare function getX402Status(client: X402Client): X402Status;
/**
 * Wraps a CSPR.cloud API call with x402 payment capability.
 *
 * For the free tier (testnet): if no 402 response, proceeds normally.
 * For the paid tier (mainnet): automatically handles payment on 402.
 *
 * Falls back to standard axios if x402Client is not configured.
 */
export declare function fetchWithPayment(url: string, apiKey: string, x402Client: X402Client | null): Promise<any>;
//# sourceMappingURL=x402.d.ts.map