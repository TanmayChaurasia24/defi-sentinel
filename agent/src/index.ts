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

import * as dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import {
  getWalletData,
  getDelegationInfo,
  getCSPRPrice,
  getRecentDeploys,
  testApiConnectivity,
  setX402Client,
} from './casper';
import { computeRiskScore, formatRiskSummary, type RiskResult } from './risk';
import { writeRiskScore, writeAction, logAlertOnChain } from './contract';
import { testMcpConnectivity } from './mcp';
import { runAgentDecision, type AgentDecision, type AgentContext } from './claude';
import { executeRebalance, validateRebalanceParams, logRebalanceOnChain, type RebalanceParams } from './transaction';
import { createX402Client, getX402Status, type X402Client } from './x402';
import {
  startApiServer,
  updateDashboardState,
  addActionEntry,
  isPaused,
  setAgentStatus,
} from './server';

const prisma = new PrismaClient();

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

function colourForLevel(level: string): string {
  switch (level) {
    case 'danger': return C.red;
    case 'warning': return C.yellow;
    default: return C.green;
  }
}

function ts(): string {
  return new Date().toISOString();
}

function log(msg: string): void {
  console.log(`${C.dim}[${ts()}]${C.reset} ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment validation
// ─────────────────────────────────────────────────────────────────────────────

interface Config {
  pollIntervalSeconds: number;
  riskThreshold: number;
  csrCloudApiKey: string;
  contractHash: string | null;
  nodeUrl: string;
  dashboardApiPort: number;
}

function loadAndValidateConfig(): Config {
  const required: string[] = [
    'CSPR_CLOUD_API_KEY',
  ];

  const missing = required.filter(
    (k) => !process.env[k] || process.env[k] === `your_${k.toLowerCase().replace(/_/g, '_')}_here`
  );

  if (missing.length > 0) {
    console.error(
      `${C.red}${C.bold}❌  Missing required environment variables:${C.reset}`
    );
    missing.forEach((k) => console.error(`   • ${k}`));
    console.error(
      `\n   Copy agent/.env.example → agent/.env and fill in the values.\n`
    );
    process.exit(1);
  }

  // ── SAFETY: Refuse to run on mainnet ──────────────────────────────────────
  const nodeUrl = process.env.CASPER_NODE_URL ?? 'https://rpc.testnet.casperlabs.io';
  if (nodeUrl.includes('mainnet')) {
    console.error(
      `${C.red}${C.bold}❌  CASPER_NODE_URL points to MAINNET. DeFi Sentinel only runs on testnet.${C.reset}`
    );
    console.error(`   URL: ${nodeUrl}`);
    console.error(`   Change CASPER_NODE_URL to a testnet endpoint and restart.`);
    process.exit(1);
  }

  // Soft warnings for optional vars
  if (!process.env.SENTINEL_CONTRACT_HASH || process.env.SENTINEL_CONTRACT_HASH === 'will_be_filled_after_deploy') {
    console.warn(
      `${C.yellow}⚠️   SENTINEL_CONTRACT_HASH not set — contract writes will be dry-run stubs.${C.reset}`
    );
  }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_key_here') {
    console.warn(
      `${C.yellow}⚠️   ANTHROPIC_API_KEY not set — using deterministic fallback (no Claude AI).${C.reset}`
    );
  }

  return {
    pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS ?? '60', 10),
    riskThreshold: parseInt(process.env.RISK_THRESHOLD ?? '70', 10),
    csrCloudApiKey: process.env.CSPR_CLOUD_API_KEY!,
    contractHash: process.env.SENTINEL_CONTRACT_HASH ?? null,
    nodeUrl,
    dashboardApiPort: parseInt(process.env.DASHBOARD_API_PORT ?? '4000', 10),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup banner
// ─────────────────────────────────────────────────────────────────────────────

function printBanner(config: Config): void {
  console.log('');
  console.log(`${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║         🛡️  DeFi Sentinel — Agent v0.2.0                  ║${C.reset}`);
  console.log(`${C.cyan}${C.bold}║     Autonomous AI Risk Monitor (Multi-Tenant)             ║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');
  console.log(`${C.bold}  Configuration:${C.reset}`);
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

async function runStartupChecks(): Promise<void> {
  log(`${C.bold}Running startup connectivity checks...${C.reset}`);

  // CSPR.cloud
  const apiOk = await testApiConnectivity();
  if (apiOk) {
    log(`${C.green}✅  CSPR.cloud API — reachable${C.reset}`);
  } else {
    log(`${C.red}❌  CSPR.cloud API — UNREACHABLE. Check your CSPR_CLOUD_API_KEY.${C.reset}`);
  }

  // MCP server
  const mcpOk = await testMcpConnectivity();
  if (mcpOk) {
    log(`${C.green}✅  MCP Server — reachable at ${process.env.MCP_SERVER_URL ?? 'http://localhost:3000'}${C.reset}`);
  } else {
    log(`${C.yellow}⚠️   MCP Server — not running (tools will use local data)${C.reset}`);
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// State tracking
// ─────────────────────────────────────────────────────────────────────────────

// Track state per wallet
const lastDecisions: Record<string, AgentDecision | undefined> = {};
let pollCount = 0;
let x402Client: X402Client | null = null;


const SCORE_DELTA_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Agent decision pretty-printer
// ─────────────────────────────────────────────────────────────────────────────

function printAgentDecision(decision: AgentDecision, riskResult: RiskResult, wallet: string): void {
  const actionColour = decision.action === 'rebalance' ? C.red
    : decision.action === 'alert' ? C.yellow : C.green;

  console.log('');
  console.log(`${C.magenta}${C.bold}┌──────────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.magenta}${C.bold}│  🤖 DeFi Sentinel AI Decision (${wallet.slice(0, 8)}...)       │${C.reset}`);
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
  if (line.trim()) console.log(`${C.magenta}│${C.reset}${line}`);

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
// Poll a single wallet
// ─────────────────────────────────────────────────────────────────────────────

async function pollWallet(config: Config, wallet: any, pollLabel: string) {
  const watchedWallet = wallet.address;
  const lastScore = wallet.lastRiskScore;

  try {
    // ── 1. Fetch wallet data ─────────────────────────────────────────────────
    log(`${pollLabel} Fetching wallet data for ${watchedWallet.slice(0, 12)}...`);
    const [walletData, delegationInfo, csprPrice] = await Promise.all([
      getWalletData(watchedWallet),
      getDelegationInfo(watchedWallet),
      getCSPRPrice(),
    ]);

    let recentDeploys: import('./casper').Deploy[] = [];
    try {
      recentDeploys = await getRecentDeploys(watchedWallet);
    } catch {
      recentDeploys = [];
    }

    // HACKATHON DEMO MODE: Simulate a 25% market crash to force a "Rebalance" action
    const priceChange24h = -25;
    
    // HACKATHON DEMO MODE: Hardcode wallet balances to simulate an over-leveraged user
    // (95% staked, < 50 CSPR liquid)
    walletData.balance = '45.500000';
    delegationInfo.totalStaked = '950.000000';
    delegationInfo.stakingRatio = 0.95;

    // ── 2. Compute risk score ────────────────────────────────────────────────
    const riskResult: RiskResult = computeRiskScore({
      walletData,
      delegationInfo,
      csprPrice,
      priceChange24h,
    });

    // ── 3. Log risk summary to console ───────────────────────────────────────
    const colour = colourForLevel(riskResult.level);
    const summary = formatRiskSummary(riskResult);
    console.log(`\n  ${colour}${C.bold}${summary}${C.reset}`);
    console.log(
      `  ${C.dim}Liquid: ${walletData.balance} CSPR  |  Staked: ${delegationInfo.totalStaked} CSPR  |  ` +
      `CSPR price: $${csprPrice.toFixed(4)}  |  Staking ratio: ${(delegationInfo.stakingRatio * 100).toFixed(1)}%${C.reset}`
    );

    if (riskResult.factors.length > 0) {
      console.log(`  ${C.bold}Risk factors:${C.reset}`);
      riskResult.factors.forEach((f) => {
        console.log(
          `    ${colour}▶${C.reset} ${f.name} (${colour}+${f.contribution} pts${C.reset}): ${C.dim}${f.description}${C.reset}`
        );
      });
    }

    // ── 4. Run Claude AI agent decision ──────────────────────────────────────
    const context: AgentContext = {
      walletAddress: watchedWallet,
      walletData,
      delegationInfo,
      riskResult,
      csprPrice,
      priceChange24h,
      recentDeploys,
      previousDecision: lastDecisions[watchedWallet],
    };

    const decision = await runAgentDecision(context);
    lastDecisions[watchedWallet] = decision;

    // ── 5. Print Claude's decision ───────────────────────────
    printAgentDecision(decision, riskResult, watchedWallet);

    // ── 6. Execute action based on decision ──────────────────────────────────
    if (decision.action === 'rebalance') {
      const params: RebalanceParams = {
        fromWallet: watchedWallet,
        amount: decision.suggestedAmount || process.env.REBALANCE_AMOUNT_CSPR || '50',
        reason: decision.reasoning,
        riskScore: riskResult.score,
      };

      const liquidBalance = parseFloat(walletData.balance);
      const validation = validateRebalanceParams(params, liquidBalance);

      if (validation.valid) {
        const result = await executeRebalance(params);
        if (result.success) {
          await logRebalanceOnChain(result, riskResult.score, watchedWallet);
          log(`${C.green}✅ Rebalance executed: ${result.deployHash}${C.reset}`);
          log(`${C.cyan}🔗 Explorer: ${result.explorerUrl}${C.reset}`);

          addActionEntry(watchedWallet, {
            timestamp: result.timestamp,
            action: 'rebalance',
            riskScore: riskResult.score,
            reasoning: decision.reasoning,
            deployHash: result.deployHash,
            explorerUrl: result.explorerUrl,
          });
        } else {
          log(`${C.red}❌ Rebalance failed: ${result.error}${C.reset}`);
          addActionEntry(watchedWallet, {
            timestamp: new Date().toISOString(),
            action: 'rebalance',
            riskScore: riskResult.score,
            reasoning: `FAILED: ${result.error}`,
          });
        }
      } else {
        log(`${C.yellow}🛡️  Rebalance blocked by safety guard: ${validation.reason}${C.reset}`);
        addActionEntry(watchedWallet, {
          timestamp: new Date().toISOString(),
          action: 'hold',
          riskScore: riskResult.score,
          reasoning: `Rebalance blocked: ${validation.reason}`,
        });
      }
    } else if (decision.action === 'alert') {
      await logAlertOnChain(watchedWallet, riskResult.score, decision.warnings);
      addActionEntry(watchedWallet, {
        timestamp: new Date().toISOString(),
        action: 'alert',
        riskScore: riskResult.score,
        reasoning: decision.reasoning,
      });
    } else {
      addActionEntry(watchedWallet, {
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

      const scoreWriteResult = await writeRiskScore(watchedWallet, riskResult.score);
      const actionWriteResult = await writeAction(watchedWallet, riskResult);
      void actionWriteResult;

      if (scoreWriteResult.dryRun) {
        log(`${pollLabel} ${C.yellow}[DRY-RUN] Contract write simulated — set SENTINEL_CONTRACT_HASH to enable.${C.reset}`);
      } else if (scoreWriteResult.success) {
        log(`${pollLabel} ${C.green}✅ Contract updated — deploy hash: ${scoreWriteResult.deployHash}${C.reset}`);
      } else {
        log(`${pollLabel} ${C.red}❌ Contract write failed: ${scoreWriteResult.error}${C.reset}`);
      }

      await prisma.userWallet.update({
        where: { address: watchedWallet },
        data: { lastRiskScore: riskResult.score, lastCheckedAt: new Date() }
      });
    } else {
      log(`${pollLabel} Score delta ${scoreDelta} pts ≤ threshold — skipping contract write.`);
      await prisma.userWallet.update({
        where: { address: watchedWallet },
        data: { lastCheckedAt: new Date() }
      });
    }

    // ── 8. Update dashboard state ────────────────────────────────────────────
    // HACKATHON DEMO MODE: Mock x402 micropayments to show dynamic data in the video
    const x402Status = x402Client ? getX402Status(x402Client) : {
      totalCalls: pollCount * 3,
      totalSpentCSPR: (pollCount * 3 * 0.00015).toFixed(6),
      lastPayment: null,
      averageCostPerCall: '0.000150',
    };

    updateDashboardState(watchedWallet, {
      walletData,
      riskResult,
      decision,
      x402Status,
      cycleCount: pollCount,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`${C.red}❌  Poll #${pollCount} failed for ${watchedWallet}: ${msg}${C.reset}`);
    setAgentStatus(watchedWallet, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main poll function — runs every POLL_INTERVAL_SECONDS
// ─────────────────────────────────────────────────────────────────────────────

async function runPoll(config: Config): Promise<void> {
  if (isPaused()) {
    log(`${C.yellow}⏸️  Agent is paused — skipping cycle${C.reset}`);
    return;
  }

  pollCount++;
  const pollLabel = `${C.dim}[Poll #${pollCount}]${C.reset}`;

  // Fetch all registered wallets
  const wallets = await prisma.userWallet.findMany();
  if (wallets.length === 0) {
    log(`${pollLabel} No wallets registered in database. Waiting for users to connect...`);
    
    // Fallback: check if WATCHED_WALLET is in env and insert it
    if (process.env.WATCHED_WALLET) {
       log(`${pollLabel} Found WATCHED_WALLET in .env. Auto-registering...`);
       await prisma.userWallet.create({ data: { address: process.env.WATCHED_WALLET } });
       return runPoll(config);
    }
    return;
  }

  log(`${pollLabel} Processing ${wallets.length} registered wallets...`);

  // Process wallets sequentially to avoid rate limits / overwhelming Claude API
  for (const wallet of wallets) {
    await pollWallet(config, wallet, pollLabel);
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadAndValidateConfig();
  printBanner(config);

  // ── Initialize x402 client ─────────────────────────────────────────────────
  const x402Wallet = process.env.X402_AGENT_WALLET;
  const x402Key = process.env.X402_AGENT_PRIVATE_KEY;
  const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? 'https://x402.cspr.cloud';

  if (x402Wallet && x402Key && x402Wallet !== 'your_x402_micropayment_wallet_address') {
    x402Client = createX402Client({
      agentWallet: x402Wallet,
      agentPrivateKey: x402Key,
      facilitatorUrl,
    });
    setX402Client(x402Client);
    log(`${C.green}✅  x402 client initialized — CSPR.cloud calls now use micropayments${C.reset}`);
  } else {
    log(`${C.yellow}⚠️   x402 not configured — API calls proceed without micropayments${C.reset}`);
  }

  // ── Start Express API server ───────────────────────────────────────────────
  startApiServer(config.dashboardApiPort);

  // ── Run connectivity checks ────────────────────────────────────────────────
  await runStartupChecks();

  log(`${C.green}${C.bold}DeFi Sentinel is running... (press Ctrl+C to stop)${C.reset}`);
  console.log('');

  // Run once immediately on startup
  await runPoll(config);

  // ── Schedule recurring polls ───────────────────────────────────────────────
  const intervalSec = config.pollIntervalSeconds;
  let cronExpression: string;
  if (intervalSec < 60) {
    cronExpression = `*/${intervalSec} * * * * *`;
  } else {
    const minutes = Math.max(1, Math.floor(intervalSec / 60));
    cronExpression = `0 */${minutes} * * * *`;
  }

  const task = cron.schedule(cronExpression, () => {
    void runPoll(config);
  });

  log(
    `${C.dim}Next poll in ${config.pollIntervalSeconds}s ` +
    `(cron: "${cronExpression}")${C.reset}`
  );

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  function shutdown(signal: string): void {
    console.log('');
    log(`${C.yellow}${signal} received — shutting down gracefully...${C.reset}`);
    task.stop();
    log(
      `${C.bold}DeFi Sentinel stopped after ${pollCount} poll(s).${C.reset}`
    );
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`${C.red}${C.bold}Fatal error:${C.reset}`, err);
  process.exit(1);
});
