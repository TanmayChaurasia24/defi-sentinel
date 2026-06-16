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
export declare function getInitialDashboardState(walletAddress: string): DashboardState;
export declare function updateDashboardState(walletAddress: string, update: {
    walletData?: WalletData;
    riskResult?: RiskResult;
    decision?: AgentDecision;
    x402Status?: X402Status;
    cycleCount?: number;
}): void;
export declare function addActionEntry(walletAddress: string, entry: Omit<ActionEntry, 'id'>): void;
export declare function isPaused(): boolean;
export declare function setAgentStatus(walletAddress: string, status: 'running' | 'paused' | 'error'): void;
export declare function startApiServer(port: number): void;
//# sourceMappingURL=server.d.ts.map