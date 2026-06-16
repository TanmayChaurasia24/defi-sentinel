"use strict";
/**
 * index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DeFi Sentinel — Main entry point.
 *
 * Starts the autonomous polling loop that:
 *  1. Fetches wallet data from CSPR.cloud
 *  2. Computes a risk score
 *  3. Runs the Claude AI agent for decision-making
 *  4. Executes rebalance transactions when needed (with safety guards)
 *  5. Logs everything to the Sentinel smart contract
 *  6. Serves live state via Express API for the dashboard
 *
 * Run:  npm run dev
 * Stop: Ctrl+C (graceful shutdown)
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
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const node_cron_1 = __importDefault(require("node-cron"));
const casper_1 = require("./casper");
const risk_1 = require("./risk");
const contract_1 = require("./contract");
const mcp_1 = require("./mcp");
const claude_1 = require("./claude");
const transaction_1 = require("./transaction");
const x402_1 = require("./x402");
const server_1 = require("./server");
// ─────────────────────────────────────────────────────────────────────────────
// ANSI colour helpers
// ─────────────────────────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
};
function colourForLevel(level) {
    switch (level) {
        case 'danger': return C.red;
        case 'warning': return C.yellow;
        default: return C.green;
    }
}
function ts() {
    return new Date().toISOString();
}
function log(msg) {
    console.log(`${C.dim}[${ts()}]${C.reset} ${msg}`);
}
function loadAndValidateConfig() {
    const required = [
        'CSPR_CLOUD_API_KEY',
        'WATCHED_WALLET',
    ];
    const missing = required.filter((k) => !process.env[k] || process.env[k] === `your_${k.toLowerCase().replace(/_/g, '_')}_here`);
    if (missing.length > 0) {
        console.error(`${C.red}${C.bold}❌  Missing required environment variables:${C.reset}`);
        missing.forEach((k) => console.error(`   • ${k}`));
        console.error(`\n   Copy agent/.env.example → agent/.env and fill in the values.\n`);
        process.exit(1);
    }
    // ── SAFETY: Refuse to run on mainnet ──────────────────────────────────────
    const nodeUrl = process.env.CASPER_NODE_URL ?? 'https://rpc.testnet.casperlabs.io';
    if (nodeUrl.includes('mainnet')) {
        console.error(`${C.red}${C.bold}❌  CASPER_NODE_URL points to MAINNET. DeFi Sentinel only runs on testnet.${C.reset}`);
        console.error(`   URL: ${nodeUrl}`);
        console.error(`   Change CASPER_NODE_URL to a testnet endpoint and restart.`);
        process.exit(1);
    }
    // Soft warnings for optional vars
    if (!process.env.SENTINEL_CONTRACT_HASH || process.env.SENTINEL_CONTRACT_HASH === 'will_be_filled_after_deploy') {
        console.warn(`${C.yellow}⚠️   SENTINEL_CONTRACT_HASH not set — contract writes will be dry-run stubs.${C.reset}`);
    }
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_key_here') {
        console.warn(`${C.yellow}⚠️   ANTHROPIC_API_KEY not set — using deterministic fallback (no Claude AI).${C.reset}`);
    }
    return {
        watchedWallet: process.env.WATCHED_WALLET,
        pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS ?? '60', 10),
        riskThreshold: parseInt(process.env.RISK_THRESHOLD ?? '70', 10),
        csrCloudApiKey: process.env.CSPR_CLOUD_API_KEY,
        contractHash: process.env.SENTINEL_CONTRACT_HASH ?? null,
        nodeUrl,
        dashboardApiPort: parseInt(process.env.DASHBOARD_API_PORT ?? '4000', 10),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Startup banner
// ─────────────────────────────────────────────────────────────────────────────
function printBanner(config) {
    console.log('');
    console.log(`${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.cyan}${C.bold}║         🛡️  DeFi Sentinel — Agent v0.2.0                  ║${C.reset}`);
    console.log(`${C.cyan}${C.bold}║     Autonomous AI Risk Monitor (Casper Testnet)           ║${C.reset}`);
    console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
    console.log('');
    console.log(`${C.bold}  Configuration:${C.reset}`);
    console.log(`  Watching:    ${C.cyan}${config.watchedWallet}${C.reset}`);
    console.log(`  Node:        ${C.dim}${config.nodeUrl}${C.reset}`);
    console.log(`  Interval:    ${config.pollIntervalSeconds}s`);
    console.log(`  Threshold:   ${config.riskThreshold}/100`);
    console.log(`  Contract:    ${config.contractHash ? config.contractHash.slice(0, 20) + '...' : C.yellow + 'NOT SET (dry-run)' + C.reset}`);
    console.log(`  API Server:  http://localhost:${config.dashboardApiPort}`);
    console.log(`  Claude AI:   ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here' ? C.green + 'ENABLED' + C.reset : C.yellow + 'FALLBACK (deterministic)' + C.reset}`);
    console.log('');
}
// ─────────────────────────────────────────────────────────────────────────────
// Connectivity health check
// ─────────────────────────────────────────────────────────────────────────────
async function runStartupChecks() {
    log(`${C.bold}Running startup connectivity checks...${C.reset}`);
    // CSPR.cloud
    const apiOk = await (0, casper_1.testApiConnectivity)();
    if (apiOk) {
        log(`${C.green}✅  CSPR.cloud API — reachable${C.reset}`);
    }
    else {
        log(`${C.red}❌  CSPR.cloud API — UNREACHABLE. Check your CSPR_CLOUD_API_KEY.${C.reset}`);
    }
    // MCP server
    const mcpOk = await (0, mcp_1.testMcpConnectivity)();
    if (mcpOk) {
        log(`${C.green}✅  MCP Server — reachable at ${process.env.MCP_SERVER_URL ?? 'http://localhost:3000'}${C.reset}`);
    }
    else {
        log(`${C.yellow}⚠️   MCP Server — not running (tools will use local data)${C.reset}`);
    }
    console.log('');
}
// ─────────────────────────────────────────────────────────────────────────────
// State tracking
// ─────────────────────────────────────────────────────────────────────────────
let lastDecision = undefined;
let lastScore = null;
let pollCount = 0;
let x402Client = null;
const SCORE_DELTA_THRESHOLD = 5;
// ─────────────────────────────────────────────────────────────────────────────
// Agent decision pretty-printer
// ─────────────────────────────────────────────────────────────────────────────
function printAgentDecision(decision, riskResult) {
    const actionColour = decision.action === 'rebalance' ? C.red
        : decision.action === 'alert' ? C.yellow : C.green;
    console.log('');
    console.log(`${C.magenta}${C.bold}┌──────────────────────────────────────────────────────────┐${C.reset}`);
    console.log(`${C.magenta}${C.bold}│  🤖 DeFi Sentinel AI Decision                           │${C.reset}`);
    console.log(`${C.magenta}${C.bold}├──────────────────────────────────────────────────────────┤${C.reset}`);
    console.log(`${C.magenta}│${C.reset}  Action:     ${actionColour}${C.bold}${decision.action.toUpperCase()}${C.reset}`);
    console.log(`${C.magenta}│${C.reset}  Confidence: ${decision.confidence}%`);
    console.log(`${C.magenta}│${C.reset}  Urgency:    ${decision.urgency}`);
    console.log(`${C.magenta}│${C.reset}  Risk Score: ${riskResult.score}/100 (${riskResult.level})`);
    if (decision.suggestedAmount) {
        console.log(`${C.magenta}│${C.reset}  Amount:     ${decision.suggestedAmount} CSPR`);
    }
    console.log(`${C.magenta}│${C.reset}`);
    console.log(`${C.magenta}│${C.reset}  ${C.dim}Reasoning:${C.reset}`);
    // Word-wrap reasoning to fit in the box
    const words = decision.reasoning.split(' ');
    let line = '  ';
    for (const word of words) {
        if (line.length + word.length > 56) {
            console.log(`${C.magenta}│${C.reset}${line}`);
            line = '  ';
        }
        line += word + ' ';
    }
    if (line.trim())
        console.log(`${C.magenta}│${C.reset}${line}`);
    if (decision.warnings.length > 0) {
        console.log(`${C.magenta}│${C.reset}`);
        console.log(`${C.magenta}│${C.reset}  ${C.yellow}Warnings:${C.reset}`);
        decision.warnings.forEach((w) => {
            console.log(`${C.magenta}│${C.reset}    ${C.yellow}⚠${C.reset} ${w.slice(0, 52)}`);
        });
    }
    console.log(`${C.magenta}${C.bold}└──────────────────────────────────────────────────────────┘${C.reset}`);
    console.log('');
}
// ─────────────────────────────────────────────────────────────────────────────
// Main poll function — runs every POLL_INTERVAL_SECONDS
// ─────────────────────────────────────────────────────────────────────────────
async function runPoll(config) {
    // Skip if paused via dashboard API
    if ((0, server_1.isPaused)()) {
        log(`${C.yellow}⏸️  Agent is paused — skipping cycle${C.reset}`);
        return;
    }
    pollCount++;
    const pollLabel = `${C.dim}[Poll #${pollCount}]${C.reset}`;
    try {
        // ── 1. Fetch wallet data ─────────────────────────────────────────────────
        log(`${pollLabel} Fetching wallet data for ${config.watchedWallet.slice(0, 12)}...`);
        const [walletData, delegationInfo, csprPrice] = await Promise.all([
            (0, casper_1.getWalletData)(config.watchedWallet),
            (0, casper_1.getDelegationInfo)(config.watchedWallet),
            (0, casper_1.getCSPRPrice)(),
        ]);
        // Fetch recent deploys (for agent context)
        let recentDeploys = [];
        try {
            recentDeploys = await (0, casper_1.getRecentDeploys)(config.watchedWallet);
        }
        catch {
            recentDeploys = [];
        }
        // Price change — placeholder for now (would come from price history endpoint)
        const priceChange24h = 0;
        // ── 2. Compute risk score ────────────────────────────────────────────────
        const riskResult = (0, risk_1.computeRiskScore)({
            walletData,
            delegationInfo,
            csprPrice,
            priceChange24h,
        });
        // ── 3. Log risk summary to console ───────────────────────────────────────
        const colour = colourForLevel(riskResult.level);
        const summary = (0, risk_1.formatRiskSummary)(riskResult);
        console.log(`\n  ${colour}${C.bold}${summary}${C.reset}`);
        console.log(`  ${C.dim}Liquid: ${walletData.balance} CSPR  |  Staked: ${delegationInfo.totalStaked} CSPR  |  ` +
            `CSPR price: $${csprPrice.toFixed(4)}  |  Staking ratio: ${(delegationInfo.stakingRatio * 100).toFixed(1)}%${C.reset}`);
        if (riskResult.factors.length > 0) {
            console.log(`  ${C.bold}Risk factors:${C.reset}`);
            riskResult.factors.forEach((f) => {
                console.log(`    ${colour}▶${C.reset} ${f.name} (${colour}+${f.contribution} pts${C.reset}): ${C.dim}${f.description}${C.reset}`);
            });
        }
        // ── 4. Run Claude AI agent decision ──────────────────────────────────────
        const context = {
            walletAddress: config.watchedWallet,
            walletData,
            delegationInfo,
            riskResult,
            csprPrice,
            priceChange24h,
            recentDeploys,
            previousDecision: lastDecision,
        };
        const decision = await (0, claude_1.runAgentDecision)(context);
        lastDecision = decision;
        // ── 5. Print Claude's decision (formatted box) ───────────────────────────
        printAgentDecision(decision, riskResult);
        // ── 6. Execute action based on decision ──────────────────────────────────
        if (decision.action === 'rebalance') {
            const params = {
                fromWallet: config.watchedWallet,
                amount: decision.suggestedAmount || process.env.REBALANCE_AMOUNT_CSPR || '50',
                reason: decision.reasoning,
                riskScore: riskResult.score,
            };
            const liquidBalance = parseFloat(walletData.balance);
            const validation = (0, transaction_1.validateRebalanceParams)(params, liquidBalance);
            if (validation.valid) {
                const result = await (0, transaction_1.executeRebalance)(params);
                if (result.success) {
                    await (0, transaction_1.logRebalanceOnChain)(result, riskResult.score, config.watchedWallet);
                    log(`${C.green}✅ Rebalance executed: ${result.deployHash}${C.reset}`);
                    log(`${C.cyan}🔗 Explorer: ${result.explorerUrl}${C.reset}`);
                    (0, server_1.addActionEntry)({
                        timestamp: result.timestamp,
                        action: 'rebalance',
                        riskScore: riskResult.score,
                        reasoning: decision.reasoning,
                        deployHash: result.deployHash,
                        explorerUrl: result.explorerUrl,
                    });
                }
                else {
                    log(`${C.red}❌ Rebalance failed: ${result.error}${C.reset}`);
                    (0, server_1.addActionEntry)({
                        timestamp: new Date().toISOString(),
                        action: 'rebalance',
                        riskScore: riskResult.score,
                        reasoning: `FAILED: ${result.error}`,
                    });
                }
            }
            else {
                log(`${C.yellow}🛡️  Rebalance blocked by safety guard: ${validation.reason}${C.reset}`);
                (0, server_1.addActionEntry)({
                    timestamp: new Date().toISOString(),
                    action: 'hold',
                    riskScore: riskResult.score,
                    reasoning: `Rebalance blocked: ${validation.reason}`,
                });
            }
        }
        else if (decision.action === 'alert') {
            // Log alert on-chain
            await (0, contract_1.logAlertOnChain)(config.watchedWallet, riskResult.score, decision.warnings);
            (0, server_1.addActionEntry)({
                timestamp: new Date().toISOString(),
                action: 'alert',
                riskScore: riskResult.score,
                reasoning: decision.reasoning,
            });
        }
        else {
            // Hold — just log it
            (0, server_1.addActionEntry)({
                timestamp: new Date().toISOString(),
                action: 'hold',
                riskScore: riskResult.score,
                reasoning: decision.reasoning,
            });
        }
        // ── 7. Write risk score to contract if changed significantly ─────────────
        const scoreDelta = lastScore === null ? 101 : Math.abs(riskResult.score - lastScore);
        if (scoreDelta > SCORE_DELTA_THRESHOLD) {
            const deltaLabel = lastScore === null ? 'first poll' : `${scoreDelta} pts`;
            log(`${pollLabel} Score changed (${deltaLabel}) — writing to Sentinel contract...`);
            const scoreWriteResult = await (0, contract_1.writeRiskScore)(config.watchedWallet, riskResult.score);
            const actionWriteResult = await (0, contract_1.writeAction)(config.watchedWallet, riskResult);
            void actionWriteResult;
            if (scoreWriteResult.dryRun) {
                log(`${pollLabel} ${C.yellow}[DRY-RUN] Contract write simulated — set SENTINEL_CONTRACT_HASH to enable.${C.reset}`);
            }
            else if (scoreWriteResult.success) {
                log(`${pollLabel} ${C.green}✅ Contract updated — deploy hash: ${scoreWriteResult.deployHash}${C.reset}`);
            }
            else {
                log(`${pollLabel} ${C.red}❌ Contract write failed: ${scoreWriteResult.error}${C.reset}`);
            }
        }
        else {
            log(`${pollLabel} Score delta ${scoreDelta} pts ≤ threshold — skipping contract write.`);
        }
        lastScore = riskResult.score;
        // ── 8. Update dashboard state ────────────────────────────────────────────
        const x402Status = x402Client ? (0, x402_1.getX402Status)(x402Client) : {
            totalCalls: 0,
            totalSpentCSPR: '0.000000',
            lastPayment: null,
            averageCostPerCall: '0.000000',
        };
        (0, server_1.updateDashboardState)({
            walletData,
            riskResult,
            decision,
            x402Status,
            cycleCount: pollCount,
        });
    }
    catch (err) {
        // Log but never crash — agent must keep running
        const msg = err instanceof Error ? err.message : String(err);
        log(`${C.red}❌  Poll #${pollCount} failed: ${msg}${C.reset}`);
        if (err instanceof Error && err.stack) {
            console.error(`${C.dim}${err.stack}${C.reset}`);
        }
        (0, server_1.setAgentStatus)('error');
    }
    console.log('');
}
// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    const config = loadAndValidateConfig();
    printBanner(config);
    // ── Initialize x402 client ─────────────────────────────────────────────────
    const x402Wallet = process.env.X402_AGENT_WALLET;
    const x402Key = process.env.X402_AGENT_PRIVATE_KEY;
    const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? 'https://x402.cspr.cloud';
    if (x402Wallet && x402Key && x402Wallet !== 'your_x402_micropayment_wallet_address') {
        x402Client = (0, x402_1.createX402Client)({
            agentWallet: x402Wallet,
            agentPrivateKey: x402Key,
            facilitatorUrl,
        });
        (0, casper_1.setX402Client)(x402Client);
        log(`${C.green}✅  x402 client initialized — CSPR.cloud calls now use micropayments${C.reset}`);
    }
    else {
        log(`${C.yellow}⚠️   x402 not configured — API calls proceed without micropayments${C.reset}`);
    }
    // ── Start Express API server ───────────────────────────────────────────────
    (0, server_1.startApiServer)(config.dashboardApiPort);
    // ── Run connectivity checks ────────────────────────────────────────────────
    await runStartupChecks();
    log(`${C.green}${C.bold}DeFi Sentinel is running... (press Ctrl+C to stop)${C.reset}`);
    console.log('');
    // Run once immediately on startup
    await runPoll(config);
    // ── Schedule recurring polls ───────────────────────────────────────────────
    const intervalSec = config.pollIntervalSeconds;
    let cronExpression;
    if (intervalSec < 60) {
        cronExpression = `*/${intervalSec} * * * * *`;
    }
    else {
        const minutes = Math.max(1, Math.floor(intervalSec / 60));
        cronExpression = `0 */${minutes} * * * *`;
    }
    const task = node_cron_1.default.schedule(cronExpression, () => {
        void runPoll(config);
    });
    log(`${C.dim}Next poll in ${config.pollIntervalSeconds}s ` +
        `(cron: "${cronExpression}")${C.reset}`);
    // ── Graceful shutdown ──────────────────────────────────────────────────────
    function shutdown(signal) {
        console.log('');
        log(`${C.yellow}${signal} received — shutting down gracefully...${C.reset}`);
        task.stop();
        log(`${C.bold}DeFi Sentinel stopped after ${pollCount} poll(s).${C.reset}`);
        process.exit(0);
    }
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
main().catch((err) => {
    console.error(`${C.red}${C.bold}Fatal error:${C.reset}`, err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map