/**
 * server.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express API server for DeFi Sentinel dashboard.
 *
 * Serves in-memory agent state to the Next.js dashboard frontend.
 * The dashboard polls these endpoints every 10 seconds for live data.
 *
 * Routes:
 *   GET  /api/status   — full DashboardState
 *   GET  /api/history  — action history (supports ?limit=N)
 *   GET  /api/risk     — current risk + historical scores
 *   GET  /api/x402     — x402 payment stats
 *   POST /api/pause    — pause the polling loop
 *   POST /api/resume   — resume the polling loop
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { RiskResult } from './risk';
import type { WalletData } from './casper';
import type { AgentDecision } from './claude';
import type { X402Status } from './x402';
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
export declare function getInitialDashboardState(): DashboardState;
export declare function updateDashboardState(update: {
    walletData?: WalletData;
    riskResult?: RiskResult;
    decision?: AgentDecision;
    x402Status?: X402Status;
    cycleCount?: number;
}): void;
export declare function addActionEntry(entry: Omit<ActionEntry, 'id'>): void;
export declare function isPaused(): boolean;
export declare function setAgentStatus(status: 'running' | 'paused' | 'error'): void;
export declare function startApiServer(port: number): void;
//# sourceMappingURL=server.d.ts.map