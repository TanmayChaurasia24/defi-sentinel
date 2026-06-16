"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRiskScore = computeRiskScore;
exports.scoreToLevel = scoreToLevel;
exports.levelToRecommendation = levelToRecommendation;
exports.formatRiskSummary = formatRiskSummary;
// ─────────────────────────────────────────────────────────────────────────────
// Scoring table (all values in points)
// ─────────────────────────────────────────────────────────────────────────────
const SCORING = {
    STAKING_RATIO_HIGH: { threshold: 0.80, points: 35 }, // > 80% staked
    STAKING_RATIO_MED: { threshold: 0.60, points: 20 }, // 60–80% staked
    PRICE_CRASH: { threshold: -10, points: 30 }, // 24h change < -10%
    PRICE_DIP: { threshold: -5, points: 15 }, // 24h change < -5%
    LIQUID_CRITICAL: { threshold: 100, points: 20 }, // < 100 CSPR liquid
    LIQUID_LOW: { threshold: 500, points: 10 }, // < 500 CSPR liquid
    NO_RECENT_ACTIVITY: { days: 30, points: 5 }, // last tx > 30 days ago
};
// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────
const THRESHOLD_WARNING = 40;
const THRESHOLD_DANGER = 70;
// ─────────────────────────────────────────────────────────────────────────────
// Main scoring function
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Computes a deterministic risk score from on-chain and market data.
 *
 * Each factor is evaluated independently; their points are summed and
 * clamped to [0, 100].
 */
function computeRiskScore(input) {
    const { walletData, delegationInfo, priceChange24h } = input;
    const factors = [];
    let rawScore = 0;
    // ── Factor 1: Staking ratio ──────────────────────────────────────────────
    const ratio = delegationInfo.stakingRatio; // already 0–1
    if (ratio > SCORING.STAKING_RATIO_HIGH.threshold) {
        const pts = SCORING.STAKING_RATIO_HIGH.points;
        rawScore += pts;
        factors.push({
            name: 'Extreme staking ratio',
            contribution: pts,
            description: `${(ratio * 100).toFixed(1)}% of total balance is staked (>80%). Liquidation risk if price drops.`,
        });
    }
    else if (ratio > SCORING.STAKING_RATIO_MED.threshold) {
        const pts = SCORING.STAKING_RATIO_MED.points;
        rawScore += pts;
        factors.push({
            name: 'High staking ratio',
            contribution: pts,
            description: `${(ratio * 100).toFixed(1)}% of total balance is staked (60–80%). Monitor closely.`,
        });
    }
    // ── Factor 2: Price volatility ───────────────────────────────────────────
    if (priceChange24h < SCORING.PRICE_CRASH.threshold) {
        const pts = SCORING.PRICE_CRASH.points;
        rawScore += pts;
        factors.push({
            name: 'Severe price crash',
            contribution: pts,
            description: `CSPR dropped ${priceChange24h.toFixed(2)}% in 24h (<-10%). Collateral value at risk.`,
        });
    }
    else if (priceChange24h < SCORING.PRICE_DIP.threshold) {
        const pts = SCORING.PRICE_DIP.points;
        rawScore += pts;
        factors.push({
            name: 'Price dip',
            contribution: pts,
            description: `CSPR dropped ${priceChange24h.toFixed(2)}% in 24h (<-5%). Worth monitoring.`,
        });
    }
    // ── Factor 3: Liquid balance ─────────────────────────────────────────────
    const liquidCspr = parseFloat(walletData.balance);
    if (liquidCspr < SCORING.LIQUID_CRITICAL.threshold) {
        const pts = SCORING.LIQUID_CRITICAL.points;
        rawScore += pts;
        factors.push({
            name: 'Critical liquid balance',
            contribution: pts,
            description: `Only ${liquidCspr.toFixed(2)} CSPR liquid (<100 CSPR). Insufficient for gas fees.`,
        });
    }
    else if (liquidCspr < SCORING.LIQUID_LOW.threshold) {
        const pts = SCORING.LIQUID_LOW.points;
        rawScore += pts;
        factors.push({
            name: 'Low liquid balance',
            contribution: pts,
            description: `${liquidCspr.toFixed(2)} CSPR liquid (<500 CSPR). Consider adding liquidity.`,
        });
    }
    // ── Factor 4: Inactivity ─────────────────────────────────────────────────
    const lastActivity = new Date(walletData.lastActivity);
    const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    if (!isNaN(daysSinceActivity) &&
        daysSinceActivity > SCORING.NO_RECENT_ACTIVITY.days) {
        const pts = SCORING.NO_RECENT_ACTIVITY.points;
        rawScore += pts;
        factors.push({
            name: 'Prolonged inactivity',
            contribution: pts,
            description: `No transactions in ${Math.floor(daysSinceActivity)} days (>30 days). Wallet may be unmonitored.`,
        });
    }
    // ── Finalise ─────────────────────────────────────────────────────────────
    const score = Math.min(Math.max(Math.round(rawScore), 0), 100);
    const level = scoreToLevel(score);
    return {
        score,
        level,
        factors,
        recommendation: levelToRecommendation(level),
        computedAt: new Date().toISOString(),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Level / recommendation helpers
// ─────────────────────────────────────────────────────────────────────────────
function scoreToLevel(score) {
    if (score >= THRESHOLD_DANGER)
        return 'danger';
    if (score >= THRESHOLD_WARNING)
        return 'warning';
    return 'safe';
}
function levelToRecommendation(level) {
    switch (level) {
        case 'danger': return 'rebalance';
        case 'warning': return 'alert';
        case 'safe': return 'hold';
    }
}
/**
 * Formats a RiskResult into a single-line console summary.
 * Example: "[82/100] 🔴 DANGER → rebalance | Extreme staking ratio (+35), Severe price crash (+30)"
 */
function formatRiskSummary(result) {
    const emoji = result.level === 'danger' ? '🔴' :
        result.level === 'warning' ? '🟡' : '🟢';
    const factorSummary = result.factors
        .map((f) => `${f.name} (+${f.contribution})`)
        .join(', ') || 'No active risk factors';
    return (`[${result.score}/100] ${emoji} ${result.level.toUpperCase()} → ${result.recommendation}` +
        ` | ${factorSummary}`);
}
//# sourceMappingURL=risk.js.map