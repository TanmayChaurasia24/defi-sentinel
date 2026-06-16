"use strict";
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
exports.writeRiskScore = writeRiskScore;
exports.writeRebalance = writeRebalance;
exports.writeAction = writeAction;
exports.logAlertOnChain = logAlertOnChain;
exports.getContractActionHistory = getContractActionHistory;
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const casper_js_sdk_1 = require("casper-js-sdk");
dotenv.config();
// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────
const CHAIN_NAME = 'casper-test';
const RPC_URL = 'https://node.testnet.cspr.cloud/rpc';
const GAS_PAYMENT = '3000000000'; // 3 CSPR for contract calls
function getContractHash() {
    return process.env.SENTINEL_CONTRACT_HASH ?? null;
}
function isContractConfigured() {
    const hash = getContractHash();
    return !!hash && hash !== 'will_be_filled_after_deploy';
}
function getCsprCloudToken() {
    return process.env.CSPR_CLOUD_TOKEN ?? process.env.CSPR_CLOUD_API_KEY ?? null;
}
// ─────────────────────────────────────────────────────────────────────────────
// Key loading (supports Ed25519 and Secp256K1 PEM files)
// ─────────────────────────────────────────────────────────────────────────────
let _cachedKeyPair = null;
function loadKeyPair() {
    if (_cachedKeyPair)
        return _cachedKeyPair;
    const keyPathRaw = process.env.AGENT_PRIVATE_KEY;
    if (!keyPathRaw || keyPathRaw === 'your_testnet_wallet_private_key') {
        return null;
    }
    // If it's a .pem file path, resolve and load
    if (keyPathRaw.endsWith('.pem')) {
        const keyPath = path.resolve(process.cwd(), keyPathRaw);
        if (!fs.existsSync(keyPath)) {
            console.error(`[contract] ❌ PEM file not found: ${keyPath}`);
            return null;
        }
        try {
            _cachedKeyPair = casper_js_sdk_1.Keys.Ed25519.loadKeyPairFromPrivateFile(keyPath);
            console.log(`[contract] 🔑 Loaded Ed25519 key from ${keyPath}`);
            return _cachedKeyPair;
        }
        catch {
            try {
                _cachedKeyPair = casper_js_sdk_1.Keys.Secp256K1.loadKeyPairFromPrivateFile(keyPath);
                console.log(`[contract] 🔑 Loaded Secp256K1 key from ${keyPath}`);
                return _cachedKeyPair;
            }
            catch (e2) {
                console.error(`[contract] ❌ Failed to parse PEM key: ${e2}`);
                return null;
            }
        }
    }
    // If it's a hex-encoded key, try to parse
    try {
        const secretKeyBytes = Uint8Array.from(Buffer.from(keyPathRaw, 'hex'));
        _cachedKeyPair = casper_js_sdk_1.Keys.Ed25519.parseKeyPair(secretKeyBytes.slice(32), secretKeyBytes.slice(0, 32));
        return _cachedKeyPair;
    }
    catch {
        console.error('[contract] ❌ AGENT_PRIVATE_KEY is not a valid PEM path or hex string');
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Deploy broadcast helper (uses CSPR.cloud authenticated RPC)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Broadcasts a signed deploy via CSPR.cloud's authenticated RPC endpoint.
 * Returns the deploy hash on success, or throws on failure.
 */
async function broadcastDeploy(signedDeploy) {
    const token = getCsprCloudToken();
    if (!token) {
        throw new Error('CSPR_CLOUD_TOKEN not set — cannot broadcast deploy');
    }
    const deployJson = casper_js_sdk_1.DeployUtil.deployToJson(signedDeploy);
    const response = await axios_1.default.post(RPC_URL, {
        id: 1,
        jsonrpc: '2.0',
        method: 'account_put_deploy',
        params: deployJson, // deployToJson returns { deploy: {...} } in SDK v2
    }, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: token,
        },
        timeout: 15_000,
    });
    if (response.data.error) {
        throw new Error(response.data.error.message || JSON.stringify(response.data.error));
    }
    return response.data.result.deploy_hash;
}
// ─────────────────────────────────────────────────────────────────────────────
// Contract Interaction — Real On-Chain Writes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Writes an updated risk score to the Sentinel contract.
 * Calls the `update_risk_score` entry point.
 */
async function writeRiskScore(walletAddress, score) {
    if (!isContractConfigured()) {
        console.log(`[contract] 📝 STUB update_risk_score(wallet=${walletAddress.slice(0, 12)}..., score=${score})`);
        return { success: true, dryRun: true, deployHash: 'stub_deploy_hash' };
    }
    const keyPair = loadKeyPair();
    if (!keyPair) {
        return { success: false, dryRun: false, error: 'AGENT_PRIVATE_KEY not configured or invalid' };
    }
    try {
        const contractHash = getContractHash();
        const contractHashBytes = casper_js_sdk_1.Contracts.contractHashToByteArray(contractHash);
        // Build the wallet address as a CLKey argument
        const walletKey = casper_js_sdk_1.CLPublicKey.fromHex(walletAddress);
        const args = casper_js_sdk_1.RuntimeArgs.fromMap({
            wallet: walletKey,
            score: casper_js_sdk_1.CLValueBuilder.u8(Math.min(score, 100)),
        });
        const deploy = casper_js_sdk_1.DeployUtil.makeDeploy(new casper_js_sdk_1.DeployUtil.DeployParams(keyPair.publicKey, CHAIN_NAME, 1, 1800000), casper_js_sdk_1.DeployUtil.ExecutableDeployItem.newStoredContractByHash(contractHashBytes, 'update_risk_score', args), casper_js_sdk_1.DeployUtil.standardPayment(GAS_PAYMENT));
        const signedDeploy = casper_js_sdk_1.DeployUtil.signDeploy(deploy, keyPair);
        const deployHash = await broadcastDeploy(signedDeploy);
        console.log(`[contract] ✅ update_risk_score → ${deployHash}`);
        return { success: true, dryRun: false, deployHash };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[contract] ❌ update_risk_score failed: ${msg}`);
        return { success: false, dryRun: false, error: msg };
    }
}
/**
 * Logs a rebalance action to the Sentinel contract.
 * Calls the `log_rebalance` entry point.
 */
async function writeRebalance(walletAddress, deployHash, score) {
    if (!isContractConfigured()) {
        console.log(`[contract] 📝 STUB log_rebalance(wallet=${walletAddress.slice(0, 12)}..., hash=${deployHash}, score=${score})`);
        return { success: true, dryRun: true };
    }
    const keyPair = loadKeyPair();
    if (!keyPair) {
        return { success: false, dryRun: false, error: 'AGENT_PRIVATE_KEY not configured or invalid' };
    }
    try {
        const contractHash = getContractHash();
        const contractHashBytes = casper_js_sdk_1.Contracts.contractHashToByteArray(contractHash);
        const walletKey = casper_js_sdk_1.CLPublicKey.fromHex(walletAddress);
        const args = casper_js_sdk_1.RuntimeArgs.fromMap({
            wallet: walletKey,
            deploy_hash: casper_js_sdk_1.CLValueBuilder.string(deployHash),
            score: casper_js_sdk_1.CLValueBuilder.u8(Math.min(score, 100)),
        });
        const deploy = casper_js_sdk_1.DeployUtil.makeDeploy(new casper_js_sdk_1.DeployUtil.DeployParams(keyPair.publicKey, CHAIN_NAME, 1, 1800000), casper_js_sdk_1.DeployUtil.ExecutableDeployItem.newStoredContractByHash(contractHashBytes, 'log_rebalance', args), casper_js_sdk_1.DeployUtil.standardPayment(GAS_PAYMENT));
        const signedDeploy = casper_js_sdk_1.DeployUtil.signDeploy(deploy, keyPair);
        const resultHash = await broadcastDeploy(signedDeploy);
        console.log(`[contract] ✅ log_rebalance → ${resultHash}`);
        return { success: true, dryRun: false, deployHash: resultHash };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[contract] ❌ log_rebalance failed: ${msg}`);
        return { success: false, dryRun: false, error: msg };
    }
}
/**
 * Logs an alert or hold action to the Sentinel contract.
 * Calls the `log_action` entry point.
 */
async function writeAction(walletAddress, result) {
    const actionType = result.recommendation === 'rebalance' ? 'rebalance' : result.recommendation;
    if (!isContractConfigured()) {
        console.log(`[contract] 📝 STUB log_action(wallet=${walletAddress.slice(0, 12)}..., action=${actionType}, score=${result.score})`);
        return { success: true, dryRun: true };
    }
    const keyPair = loadKeyPair();
    if (!keyPair) {
        return { success: false, dryRun: false, error: 'AGENT_PRIVATE_KEY not configured or invalid' };
    }
    try {
        const contractHash = getContractHash();
        const contractHashBytes = casper_js_sdk_1.Contracts.contractHashToByteArray(contractHash);
        const walletKey = casper_js_sdk_1.CLPublicKey.fromHex(walletAddress);
        const args = casper_js_sdk_1.RuntimeArgs.fromMap({
            wallet: walletKey,
            action_type: casper_js_sdk_1.CLValueBuilder.string(actionType),
            score: casper_js_sdk_1.CLValueBuilder.u8(Math.min(result.score, 100)),
        });
        const deploy = casper_js_sdk_1.DeployUtil.makeDeploy(new casper_js_sdk_1.DeployUtil.DeployParams(keyPair.publicKey, CHAIN_NAME, 1, 1800000), casper_js_sdk_1.DeployUtil.ExecutableDeployItem.newStoredContractByHash(contractHashBytes, 'log_action', args), casper_js_sdk_1.DeployUtil.standardPayment(GAS_PAYMENT));
        const signedDeploy = casper_js_sdk_1.DeployUtil.signDeploy(deploy, keyPair);
        const deployHash = await broadcastDeploy(signedDeploy);
        console.log(`[contract] ✅ log_action(${actionType}) → ${deployHash}`);
        return { success: true, dryRun: false, deployHash };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[contract] ❌ log_action failed: ${msg}`);
        return { success: false, dryRun: false, error: msg };
    }
}
/**
 * Logs an alert action to the Sentinel contract.
 * Called when the agent decides to alert (risk score 40–69).
 */
async function logAlertOnChain(walletAddress, riskScore, warnings) {
    if (!isContractConfigured()) {
        console.log(`[contract] 📝 STUB log_alert(wallet=${walletAddress.slice(0, 12)}..., score=${riskScore}, warnings=${warnings.length})`);
        return;
    }
    const keyPair = loadKeyPair();
    if (!keyPair) {
        console.warn('[contract] ⚠️  Cannot log alert — AGENT_PRIVATE_KEY not configured');
        return;
    }
    try {
        const contractHash = getContractHash();
        const contractHashBytes = casper_js_sdk_1.Contracts.contractHashToByteArray(contractHash);
        const walletKey = casper_js_sdk_1.CLPublicKey.fromHex(walletAddress);
        const args = casper_js_sdk_1.RuntimeArgs.fromMap({
            wallet: walletKey,
            action_type: casper_js_sdk_1.CLValueBuilder.string('alert'),
            score: casper_js_sdk_1.CLValueBuilder.u8(Math.min(riskScore, 100)),
        });
        const deploy = casper_js_sdk_1.DeployUtil.makeDeploy(new casper_js_sdk_1.DeployUtil.DeployParams(keyPair.publicKey, CHAIN_NAME, 1, 1800000), casper_js_sdk_1.DeployUtil.ExecutableDeployItem.newStoredContractByHash(contractHashBytes, 'log_action', args), casper_js_sdk_1.DeployUtil.standardPayment(GAS_PAYMENT));
        const signedDeploy = casper_js_sdk_1.DeployUtil.signDeploy(deploy, keyPair);
        const deployHash = await broadcastDeploy(signedDeploy);
        console.log(`[contract] 🔔 log_alert → ${deployHash} (score=${riskScore})`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[contract] ⚠️  log_alert failed: ${msg}`);
    }
}
/**
 * Fetches action history from the Sentinel contract.
 * Returns empty array — dashboard uses in-memory action log from server.ts.
 */
async function getContractActionHistory(_walletAddress, limit) {
    void limit;
    // Dashboard uses in-memory action log from server.ts
    return [];
}
//# sourceMappingURL=contract.js.map