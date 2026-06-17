import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import type { RiskResult } from './risk';
import type { WalletData } from './casper';
import type { AgentDecision } from './claude';
import type { X402Status } from './x402';
import { generateId } from './utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionEntry {
  id: string;
  timestamp: string;
  action: 'rebalance' | 'alert' | 'hold';
  riskScore: number;
  reasoning: string;
  deployHash?: string;
  explorerUrl?: string;
}

export interface RiskHistoryEntry {
  score: number;
  level: string;
  timestamp: string;
}

export interface DashboardState {
  lastUpdated: string;
  walletAddress: string;
  walletData: WalletData | null;
  riskResult: RiskResult | null;
  lastDecision: AgentDecision | null;
  x402Status: X402Status;
  recentActions: ActionEntry[];
  agentStatus: 'running' | 'paused' | 'error';
  totalCyclesRun: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state (Multi-Tenant)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ACTIONS = 50;
const MAX_RISK_HISTORY = 20;

// State is now keyed by wallet address
const states: Record<string, DashboardState> = {};
const riskHistories: Record<string, RiskHistoryEntry[]> = {};
let paused = false;

const prisma = new PrismaClient();

export function getInitialDashboardState(walletAddress: string): DashboardState {
  return {
    lastUpdated: new Date().toISOString(),
    walletAddress,
    walletData: null,
    riskResult: null,
    lastDecision: null,
    x402Status: {
      totalCalls: 0,
      totalSpentCSPR: '0.000000',
      lastPayment: null,
      averageCostPerCall: '0.000000',
    },
    recentActions: [],
    agentStatus: 'running',
    totalCyclesRun: 0,
  };
}

function ensureState(walletAddress: string) {
  if (!states[walletAddress]) {
    states[walletAddress] = getInitialDashboardState(walletAddress);
  }
  if (!riskHistories[walletAddress]) {
    riskHistories[walletAddress] = [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State mutation functions (called from index.ts)
// ─────────────────────────────────────────────────────────────────────────────

export function updateDashboardState(walletAddress: string, update: {
  walletData?: WalletData;
  riskResult?: RiskResult;
  decision?: AgentDecision;
  x402Status?: X402Status;
  cycleCount?: number;
}): void {
  ensureState(walletAddress);
  const state = states[walletAddress];
  const history = riskHistories[walletAddress];

  state.lastUpdated = new Date().toISOString();

  if (update.walletData) state.walletData = update.walletData;
  if (update.riskResult) {
    state.riskResult = update.riskResult;
    // Add to risk history
    history.push({
      score: update.riskResult.score,
      level: update.riskResult.level,
      timestamp: new Date().toISOString(),
    });
    if (history.length > MAX_RISK_HISTORY) {
      history.shift();
    }
  }
  if (update.decision) state.lastDecision = update.decision;
  if (update.x402Status) state.x402Status = update.x402Status;
  if (update.cycleCount !== undefined) state.totalCyclesRun = update.cycleCount;
}

export function addActionEntry(walletAddress: string, entry: Omit<ActionEntry, 'id'>): void {
  ensureState(walletAddress);
  const state = states[walletAddress];
  const fullEntry: ActionEntry = {
    id: generateId(),
    ...entry,
  };
  state.recentActions.unshift(fullEntry);
  if (state.recentActions.length > MAX_ACTIONS) {
    state.recentActions.pop();
  }
}

export function isPaused(): boolean {
  return paused;
}

export function setAgentStatus(walletAddress: string, status: 'running' | 'paused' | 'error'): void {
  ensureState(walletAddress);
  states[walletAddress].agentStatus = status;
}

// ─────────────────────────────────────────────────────────────────────────────
// Express server
// ─────────────────────────────────────────────────────────────────────────────

export function startApiServer(port: number): void {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ── POST /api/register ─────────────────────────────────────────────────────
  app.post('/api/register', async (req, res) => {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    try {
      const existing = await prisma.userWallet.findUnique({
        where: { address: walletAddress },
      });

      if (!existing) {
        await prisma.userWallet.create({
          data: { address: walletAddress },
        });
        console.log(`[server] Registered new wallet: ${walletAddress}`);
      }
      
      ensureState(walletAddress);
      res.json({ success: true, walletAddress });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Helper to extract wallet from query
  const getWallet = (req: express.Request, res: express.Response): string | null => {
    const walletAddress = req.query.wallet as string;
    if (!walletAddress) {
      res.status(400).json({ error: 'wallet query parameter is required' });
      return null;
    }
    ensureState(walletAddress);
    return walletAddress;
  };

  // ── GET /api/status ────────────────────────────────────────────────────────
  app.get('/api/status', (req, res) => {
    const walletAddress = req.query.wallet as string;
    if (!walletAddress) {
      return res.json({ status: 'ok', uptime: process.uptime() });
    }
    ensureState(walletAddress);
    res.json(states[walletAddress]);
  });

  // ── GET /api/history ───────────────────────────────────────────────────────
  app.get('/api/history', (req, res) => {
    const wallet = getWallet(req, res);
    if (!wallet) return;
    const limit = parseInt(req.query.limit as string) || 20;
    const clamped = Math.min(Math.max(limit, 1), MAX_ACTIONS);
    res.json(states[wallet].recentActions.slice(0, clamped));
  });

  // ── GET /api/risk ──────────────────────────────────────────────────────────
  app.get('/api/risk', (req, res) => {
    const wallet = getWallet(req, res);
    if (!wallet) return;
    res.json({
      current: states[wallet].riskResult,
      history: riskHistories[wallet],
    });
  });

  // ── GET /api/x402 ──────────────────────────────────────────────────────────
  app.get('/api/x402', (req, res) => {
    const wallet = getWallet(req, res);
    if (!wallet) return;
    res.json(states[wallet].x402Status);
  });

  // ── POST /api/pause ────────────────────────────────────────────────────────
  app.post('/api/pause', (_req, res) => {
    paused = true;
    for (const s of Object.values(states)) {
      s.agentStatus = 'paused';
    }
    console.log('[server] ⏸️  Agent paused via API');
    res.json({ status: 'paused' });
  });

  // ── POST /api/resume ───────────────────────────────────────────────────────
  app.post('/api/resume', (_req, res) => {
    paused = false;
    for (const s of Object.values(states)) {
      s.agentStatus = 'running';
    }
    console.log('[server] ▶️  Agent resumed via API');
    res.json({ status: 'running' });
  });

  // ── Start server ───────────────────────────────────────────────────────────
  app.listen(port, () => {
    console.log(`[server] 🌐 Dashboard API running on http://localhost:${port}`);
  });
}
