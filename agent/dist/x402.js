"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createX402Client = createX402Client;
exports.getX402Status = getX402Status;
exports.fetchWithPayment = fetchWithPayment;
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
const utils_1 = require("./utils");
dotenv.config();
// ─────────────────────────────────────────────────────────────────────────────
// In-memory payment tracking
// ─────────────────────────────────────────────────────────────────────────────
const paymentHistory = [];
let totalCalls = 0;
// ─────────────────────────────────────────────────────────────────────────────
// Payment proof creation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Create a signed payment proof for an API request.
 * In production, this would use casper-js-sdk to sign with the agent wallet.
 * For testnet: creates a proof structure that the facilitator can verify.
 */
function createPaymentProof(amount, recipient, agentWallet) {
    const timestamp = new Date().toISOString();
    const nonce = (0, utils_1.generateId)();
    const proofPayload = {
        amount,
        recipient,
        sender: agentWallet,
        nonce,
        timestamp,
        chain: 'casper-test',
    };
    // Base64 encode the proof payload
    // In production: this would include a cryptographic signature from casper-js-sdk
    const paymentHeader = Buffer.from(JSON.stringify(proofPayload)).toString('base64');
    // Generate a mock transaction hash for testnet
    // In production: this would be a real Casper deploy hash
    const txHash = `x402_${nonce.replace(/-/g, '').slice(0, 32)}`;
    return {
        paymentHeader,
        txHash,
        amount,
        recipient,
        timestamp,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// x402 Client Factory
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Creates an x402 payment client that wraps HTTP requests with
 * automatic micropayment capability.
 */
function createX402Client(config) {
    const { agentWallet, facilitatorUrl } = config;
    /**
     * Enhanced fetch that handles 402 Payment Required responses.
     * On 402: parses payment requirements, creates proof, retries request.
     * On any other status: passes through normally.
     */
    async function x402Fetch(url, options) {
        totalCalls++;
        try {
            // First attempt — no payment header
            const firstResponse = await fetch(url, options);
            // If not 402, return as-is
            if (firstResponse.status !== 402) {
                return firstResponse;
            }
            // ── Handle 402 Payment Required ──────────────────────────────────────
            console.log(`[x402] 💸 Received 402 Payment Required for ${url}`);
            // Parse payment requirements from response headers
            const paymentRequired = firstResponse.headers.get('X-Payment-Required');
            let amount = '100000000'; // default: 0.1 CSPR in motes
            let recipient = '';
            if (paymentRequired) {
                try {
                    const requirements = JSON.parse(paymentRequired);
                    amount = requirements.amount ?? amount;
                    recipient = requirements.recipient ?? '';
                }
                catch {
                    console.warn('[x402] Could not parse X-Payment-Required header');
                }
            }
            if (!recipient) {
                // Try to extract recipient from facilitator URL
                recipient = facilitatorUrl;
            }
            // Create payment proof
            const proof = createPaymentProof(amount, recipient, agentWallet);
            paymentHistory.push(proof);
            console.log(`[x402] 💰 Payment proof created: ${proof.amount} motes → ${recipient.slice(0, 20)}...`);
            // Retry with payment header
            const retryHeaders = new Headers(options?.headers);
            retryHeaders.set('X-PAYMENT', `CSPR ${proof.paymentHeader}`);
            retryHeaders.set('X-PAYMENT-TX', proof.txHash);
            const retryResponse = await fetch(url, {
                ...options,
                headers: retryHeaders,
            });
            return retryResponse;
        }
        catch (err) {
            // x402 must never block the agent — log and throw original error
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[x402] ⚠️  Payment failed for ${url}: ${msg}. Proceeding without payment.`);
            throw err;
        }
    }
    return {
        fetch: x402Fetch,
        getPaymentHistory: () => [...paymentHistory],
        getTotalSpent: () => {
            const totalMotes = paymentHistory.reduce((sum, p) => sum + BigInt(p.amount || '0'), 0n);
            // Convert motes to CSPR
            const cspr = Number(totalMotes) / 1_000_000_000;
            return cspr.toFixed(6);
        },
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// x402 Status
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns aggregated x402 payment statistics for the dashboard.
 */
function getX402Status(client) {
    const history = client.getPaymentHistory();
    const totalSpent = client.getTotalSpent();
    const lastPayment = history.length > 0 ? history[history.length - 1] : null;
    const avgCost = history.length > 0
        ? (parseFloat(totalSpent) / history.length).toFixed(6)
        : '0.000000';
    return {
        totalCalls,
        totalSpentCSPR: totalSpent,
        lastPayment,
        averageCostPerCall: avgCost,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Wrapped fetch for CSPR.cloud calls
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Wraps a CSPR.cloud API call with x402 payment capability.
 *
 * For the free tier (testnet): if no 402 response, proceeds normally.
 * For the paid tier (mainnet): automatically handles payment on 402.
 *
 * Falls back to standard axios if x402Client is not configured.
 */
async function fetchWithPayment(url, apiKey, x402Client) {
    // If no x402 client, use standard axios
    if (!x402Client) {
        const { data } = await axios_1.default.get(url, {
            headers: {
                authorization: apiKey,
                'Content-Type': 'application/json',
            },
            timeout: 10_000,
        });
        return data;
    }
    // Use x402 client with payment capability
    try {
        const response = await x402Client.fetch(url, {
            headers: {
                authorization: apiKey,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok && response.status !== 402) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }
    catch (err) {
        // Graceful fallback: try standard axios if x402 fails
        console.warn('[x402] Falling back to standard HTTP request');
        const { data } = await axios_1.default.get(url, {
            headers: {
                authorization: apiKey,
                'Content-Type': 'application/json',
            },
            timeout: 10_000,
        });
        return data;
    }
}
//# sourceMappingURL=x402.js.map