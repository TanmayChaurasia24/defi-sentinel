/**
 * risk.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DeFi Sentinel risk scoring engine.
 *
 * Pure TypeScript — no external dependencies, no network calls.
 * Accepts wallet + market data, returns a 0–100 risk score with a
 * granular breakdown of which factors contributed.
 *
 * Score thresholds:
 *   0–39   → safe    → recommendation: hold
 *   40–69  → warning → recommendation: alert
 *   70–100 → danger  → recommendation: rebalance
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { WalletData, DelegationInfo } from './casper';
export interface RiskInput {
    walletData: WalletData;
    delegationInfo: DelegationInfo;
    /** Current CSPR/USD price */
    csprPrice: number;
    /** 24-hour price change as a percentage, e.g. -12 means -12% */
    priceChange24h: number;
}
export interface RiskFactor {
    /** Short name for the factor, e.g. "High staking ratio" */
    name: string;
    /** Points this factor added to the total risk score */
    contribution: number;
    /** Human-readable description for the dashboard */
    description: string;
}
export type RiskLevel = 'safe' | 'warning' | 'danger';
export type Recommendation = 'hold' | 'alert' | 'rebalance';
export interface RiskResult {
    /** Final score clamped to [0, 100] */
    score: number;
    level: RiskLevel;
    factors: RiskFactor[];
    recommendation: Recommendation;
    /** ISO timestamp of when this score was computed */
    computedAt: string;
}
/**
 * Computes a deterministic risk score from on-chain and market data.
 *
 * Each factor is evaluated independently; their points are summed and
 * clamped to [0, 100].
 */
export declare function computeRiskScore(input: RiskInput): RiskResult;
export declare function scoreToLevel(score: number): RiskLevel;
export declare function levelToRecommendation(level: RiskLevel): Recommendation;
/**
 * Formats a RiskResult into a single-line console summary.
 * Example: "[82/100] 🔴 DANGER → rebalance | Extreme staking ratio (+35), Severe price crash (+30)"
 */
export declare function formatRiskSummary(result: RiskResult): string;
//# sourceMappingURL=risk.d.ts.map