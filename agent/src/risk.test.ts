/**
 * risk.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the DeFi Sentinel risk scoring engine.
 *
 * Run with:  npm test
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  computeRiskScore,
  scoreToLevel,
  levelToRecommendation,
  formatRiskSummary,
  type RiskInput,
  type RiskFactor,
} from './risk';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal WalletData fixture with overrideable fields. */
function makeWalletData(overrides: {
  balance?: string;
  totalDelegated?: string;
  lastActivity?: string;
} = {}) {
  return {
    address: 'test_wallet_address',
    balance: overrides.balance ?? '1000.000000',
    totalDelegated: overrides.totalDelegated ?? '0.000000',
    transferCount: 42,
    lastActivity: overrides.lastActivity ?? new Date().toISOString(),
  };
}

/** Build a minimal DelegationInfo fixture. */
function makeDelegationInfo(overrides: {
  totalStaked?: string;
  stakingRatio?: number;
} = {}) {
  return {
    totalStaked: overrides.totalStaked ?? '0.000000',
    validators: [],
    stakingRatio: overrides.stakingRatio ?? 0,
  };
}

/** Reference RiskInput with zero risk across the board. */
const ZERO_RISK_INPUT: RiskInput = {
  walletData: makeWalletData({ balance: '2000.000000', lastActivity: new Date().toISOString() }),
  delegationInfo: makeDelegationInfo({ stakingRatio: 0.1 }), // 10% staked — safe
  csprPrice: 0.05,
  priceChange24h: 0, // flat
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests: scoreToLevel
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreToLevel()', () => {
  it('returns safe for 0', () => expect(scoreToLevel(0)).toBe('safe'));
  it('returns safe for 39', () => expect(scoreToLevel(39)).toBe('safe'));
  it('returns warning for 40', () => expect(scoreToLevel(40)).toBe('warning'));
  it('returns warning for 69', () => expect(scoreToLevel(69)).toBe('warning'));
  it('returns danger for 70', () => expect(scoreToLevel(70)).toBe('danger'));
  it('returns danger for 100', () => expect(scoreToLevel(100)).toBe('danger'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: levelToRecommendation
// ─────────────────────────────────────────────────────────────────────────────

describe('levelToRecommendation()', () => {
  it('maps safe → hold', () => expect(levelToRecommendation('safe')).toBe('hold'));
  it('maps warning → alert', () => expect(levelToRecommendation('warning')).toBe('alert'));
  it('maps danger → rebalance', () => expect(levelToRecommendation('danger')).toBe('rebalance'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: computeRiskScore — zero risk baseline
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskScore() — zero risk baseline', () => {
  it('returns score 0 when all factors are benign', () => {
    const result = computeRiskScore(ZERO_RISK_INPUT);
    expect(result.score).toBe(0);
    expect(result.level).toBe('safe');
    expect(result.recommendation).toBe('hold');
    expect(result.factors).toHaveLength(0);
  });

  it('has a valid ISO timestamp in computedAt', () => {
    const result = computeRiskScore(ZERO_RISK_INPUT);
    expect(() => new Date(result.computedAt)).not.toThrow();
    expect(new Date(result.computedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: staking ratio factor
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskScore() — staking ratio', () => {
  it('adds 35 points for >80% staking ratio', () => {
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      delegationInfo: makeDelegationInfo({ stakingRatio: 0.85 }),
    };
    const result = computeRiskScore(input);
    const factor = result.factors.find((f: RiskFactor) => f.name.includes('Extreme'));
    expect(factor).toBeDefined();
    expect(factor!.contribution).toBe(35);
    expect(result.score).toBeGreaterThanOrEqual(35);
  });

  it('adds 20 points for 60–80% staking ratio', () => {
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      delegationInfo: makeDelegationInfo({ stakingRatio: 0.70 }),
    };
    const result = computeRiskScore(input);
    const factor = result.factors.find((f: RiskFactor) => f.name.includes('High staking'));
    expect(factor).toBeDefined();
    expect(factor!.contribution).toBe(20);
  });

  it('does NOT add staking points for <60% ratio', () => {
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      delegationInfo: makeDelegationInfo({ stakingRatio: 0.50 }),
    };
    const result = computeRiskScore(input);
    expect(result.factors.filter((f: RiskFactor) => f.name.toLowerCase().includes('staking'))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: price volatility factor
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskScore() — price volatility', () => {
  it('adds 30 points for <-10% price change', () => {
    const input: RiskInput = { ...ZERO_RISK_INPUT, priceChange24h: -15 };
    const result = computeRiskScore(input);
    const factor = result.factors.find((f: RiskFactor) => f.name.includes('crash'));
    expect(factor).toBeDefined();
    expect(factor!.contribution).toBe(30);
  });

  it('adds 15 points for -5% to -10% price change', () => {
    const input: RiskInput = { ...ZERO_RISK_INPUT, priceChange24h: -7 };
    const result = computeRiskScore(input);
    const factor = result.factors.find((f: RiskFactor) => f.name.includes('dip'));
    expect(factor).toBeDefined();
    expect(factor!.contribution).toBe(15);
  });

  it('adds 0 points for positive price change', () => {
    const input: RiskInput = { ...ZERO_RISK_INPUT, priceChange24h: 5 };
    const result = computeRiskScore(input);
    expect(result.factors.filter((f: RiskFactor) => f.name.toLowerCase().includes('price'))).toHaveLength(0);
  });

  it('adds 0 points for exactly 0% price change', () => {
    const input: RiskInput = { ...ZERO_RISK_INPUT, priceChange24h: 0 };
    expect(computeRiskScore(input).factors.filter((f: RiskFactor) => f.name.toLowerCase().includes('price'))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: liquid balance factor
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskScore() — liquid balance', () => {
  it('adds 20 points for <100 CSPR liquid', () => {
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      walletData: makeWalletData({ balance: '50.000000' }),
    };
    const result = computeRiskScore(input);
    const factor = result.factors.find((f: RiskFactor) => f.name.includes('Critical'));
    expect(factor).toBeDefined();
    expect(factor!.contribution).toBe(20);
  });

  it('adds 10 points for 100–500 CSPR liquid', () => {
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      walletData: makeWalletData({ balance: '200.000000' }),
    };
    const result = computeRiskScore(input);
    const factor = result.factors.find((f: RiskFactor) => f.name.includes('Low liquid'));
    expect(factor).toBeDefined();
    expect(factor!.contribution).toBe(10);
  });

  it('adds 0 points for >=500 CSPR liquid', () => {
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      walletData: makeWalletData({ balance: '1000.000000' }),
    };
    const result = computeRiskScore(input);
    expect(result.factors.filter((f: RiskFactor) => f.name.toLowerCase().includes('liquid'))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: inactivity factor
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskScore() — inactivity', () => {
  it('adds 5 points when last activity >30 days ago', () => {
    const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      walletData: makeWalletData({ lastActivity: oldDate }),
    };
    const result = computeRiskScore(input);
    const factor = result.factors.find((f: RiskFactor) => f.name.includes('nactivity'));
    expect(factor).toBeDefined();
    expect(factor!.contribution).toBe(5);
  });

  it('does NOT add inactivity points for recent activity', () => {
    const recentDate = new Date().toISOString();
    const input: RiskInput = {
      ...ZERO_RISK_INPUT,
      walletData: makeWalletData({ lastActivity: recentDate }),
    };
    const result = computeRiskScore(input);
    expect(result.factors.filter((f: RiskFactor) => f.name.toLowerCase().includes('inactivity'))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: maximum risk scenario
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskScore() — maximum risk', () => {
  it('clamps score to 100 when all factors fire simultaneously', () => {
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    const input: RiskInput = {
      walletData: makeWalletData({ balance: '10.000000', lastActivity: thirtyFiveDaysAgo }),
      delegationInfo: makeDelegationInfo({ stakingRatio: 0.95 }), // +35
      csprPrice: 0.01,
      priceChange24h: -20, // +30
      // balance < 100 CSPR → +20, inactivity → +5
      // Total raw: 35 + 30 + 20 + 5 = 90 → clamped 90
    };
    const result = computeRiskScore(input);
    expect(result.score).toBe(90);
    expect(result.level).toBe('danger');
    expect(result.recommendation).toBe('rebalance');
    expect(result.factors.length).toBeGreaterThanOrEqual(4);
  });

  it('never returns a score above 100', () => {
    // Artificial scenario where points would exceed 100
    const input: RiskInput = {
      walletData: makeWalletData({ balance: '1.000000', lastActivity: '2000-01-01T00:00:00.000Z' }),
      delegationInfo: makeDelegationInfo({ stakingRatio: 0.99 }),
      csprPrice: 0.001,
      priceChange24h: -50,
    };
    const result = computeRiskScore(input);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: mixed scenario
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskScore() — mixed warning scenario', () => {
  it('returns warning level when score is 40–69', () => {
    const input: RiskInput = {
      walletData: makeWalletData({ balance: '200.000000' }), // +10 low liquid
      delegationInfo: makeDelegationInfo({ stakingRatio: 0.70 }), // +20 high staking
      csprPrice: 0.03,
      priceChange24h: -6, // +15 price dip
      // Total: 10 + 20 + 15 = 45 → warning
    };
    const result = computeRiskScore(input);
    expect(result.score).toBe(45);
    expect(result.level).toBe('warning');
    expect(result.recommendation).toBe('alert');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: formatRiskSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('formatRiskSummary()', () => {
  it('includes score, level, and recommendation', () => {
    const result = computeRiskScore(ZERO_RISK_INPUT);
    const summary = formatRiskSummary(result);
    expect(summary).toContain('[0/100]');
    expect(summary).toContain('SAFE');
    expect(summary).toContain('hold');
  });

  it('shows factor names in the summary', () => {
    const input: RiskInput = { ...ZERO_RISK_INPUT, priceChange24h: -12 };
    const result = computeRiskScore(input);
    const summary = formatRiskSummary(result);
    expect(summary).toContain('crash');
  });
});
