/**
 * claude.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI agent decision engine for DeFi Sentinel.
 *
 * Uses the official OpenRouter SDK to access free AI models
 * and make autonomous decisions: rebalance / alert / hold.
 *
 * Supports multi-turn tool use — the model can call MCP tools to gather
 * additional on-chain data before making a decision.
 *
 * Graceful fallback: if OPENROUTER_API_KEY is unset, falls back to
 * deterministic risk-engine-based decisions.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { RiskResult } from './risk';
import type { WalletData, DelegationInfo, Deploy } from './casper';
export interface AgentDecision {
    action: 'rebalance' | 'alert' | 'hold';
    reasoning: string;
    confidence: number;
    urgency: 'low' | 'medium' | 'high';
    suggestedAmount?: string;
    warnings: string[];
    timestamp: string;
}
export interface AgentContext {
    walletAddress: string;
    walletData: WalletData;
    delegationInfo: DelegationInfo;
    riskResult: RiskResult;
    csprPrice: number;
    priceChange24h: number;
    recentDeploys: Deploy[];
    previousDecision?: AgentDecision;
}
/**
 * Ask the AI agent what action to take given the current risk state.
 *
 * If OPENROUTER_API_KEY is set: calls OpenRouter with free AI models.
 * If not: falls back to deterministic risk-engine-based decision.
 */
export declare function runAgentDecision(context: AgentContext): Promise<AgentDecision>;
/**
 * @deprecated Use runAgentDecision() instead. Kept for backward compatibility.
 */
export declare function getAgentDecision(riskResult: RiskResult, walletData: WalletData, delegationInfo: DelegationInfo): Promise<AgentDecision>;
//# sourceMappingURL=claude.d.ts.map