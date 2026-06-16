'use client';

import React, { useState, useEffect, useCallback } from 'react';
import RiskGauge from '../components/RiskGauge';
import PositionList from '../components/PositionList';
import ActionLog from '../components/ActionLog';
import AgentReasoningFeed from '../components/AgentReasoningFeed';
import RiskChart from '../components/RiskChart';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors agent server types)
// ─────────────────────────────────────────────────────────────────────────────

interface WalletData {
  address: string;
  balance: string;
  totalDelegated: string;
  transferCount: number;
  lastActivity: string;
}

interface DelegationInfo {
  totalStaked: string;
  validators: Array<{ validatorKey: string; stakedAmount: string }>;
  stakingRatio: number;
}

interface RiskFactor {
  name: string;
  contribution: number;
  description: string;
}

interface RiskResult {
  score: number;
  level: 'safe' | 'warning' | 'danger';
  factors: RiskFactor[];
  recommendation: string;
  computedAt: string;
}

interface AgentDecision {
  action: 'rebalance' | 'alert' | 'hold';
  reasoning: string;
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
  suggestedAmount?: string;
  warnings: string[];
  timestamp: string;
}

interface X402Status {
  totalCalls: number;
  totalSpentCSPR: string;
  lastPayment: unknown;
  averageCostPerCall: string;
}

interface ActionEntry {
  id: string;
  timestamp: string;
  action: 'rebalance' | 'alert' | 'hold';
  riskScore: number;
  reasoning: string;
  deployHash?: string;
  explorerUrl?: string;
}

interface RiskHistoryEntry {
  score: number;
  level: string;
  timestamp: string;
}

interface DashboardState {
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
// API configuration
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const POLL_INTERVAL = 10_000; // 10 seconds

// Casper wallet types
declare global {
  interface Window {
    CasperWalletProvider?: () => {
      requestConnection(): Promise<boolean>;
      getActivePublicKey(): Promise<string | undefined>;
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeWallet, setActiveWallet] = useState<string | null>(null);
  const [state, setState] = useState<DashboardState | null>(null);
  const [riskHistory, setRiskHistory] = useState<RiskHistoryEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // ── Casper Wallet Connection ───────────────────────────────────────────────
  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.CasperWalletProvider) {
      alert('Casper Wallet extension not found! Please install it.');
      return;
    }
    try {
      const provider = window.CasperWalletProvider();
      const connected = await provider.requestConnection();
      if (!connected) return;
      const publicKey = await provider.getActivePublicKey();
      if (publicKey) {
        setIsRegistering(true);
        // Register the wallet with the backend Agent API
        const res = await fetch(`${API_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: publicKey })
        });
        if (res.ok) {
          setActiveWallet(publicKey);
        } else {
          alert('Failed to register wallet with the Agent.');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to Casper Wallet');
    } finally {
      setIsRegistering(false);
    }
  };

  // ── Fetch dashboard state ──────────────────────────────────────────────────
  const fetchState = useCallback(async () => {
    if (!activeWallet) return;
    try {
      const [statusRes, riskRes] = await Promise.all([
        fetch(`${API_BASE}/api/status?wallet=${activeWallet}`),
        fetch(`${API_BASE}/api/risk?wallet=${activeWallet}`),
      ]);

      if (!statusRes.ok) throw new Error(`Status API: ${statusRes.status}`);
      if (!riskRes.ok) throw new Error(`Risk API: ${riskRes.status}`);

      const statusData: DashboardState = await statusRes.json();
      const riskData = await riskRes.json();

      setState(statusData);
      setRiskHistory(riskData.history || []);
      setConnected(true);
      setError(null);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [activeWallet]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchState]);

  // ── Pause / Resume ─────────────────────────────────────────────────────────
  const togglePause = async () => {
    if (!state) return;
    const endpoint = state.agentStatus === 'paused' ? 'resume' : 'pause';
    try {
      await fetch(`${API_BASE}/api/${endpoint}`, { method: 'POST' });
      await fetchState();
    } catch {
      console.error('Failed to toggle pause');
    }
  };

  // ── Landing state (No wallet connected) ────────────────────────────────────
  if (!activeWallet) {
    return (
      <div className="dashboard" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '4rem' }}>🛡️</span>
          <h1 className="header-title" style={{ fontSize: '3rem', margin: '1rem 0' }}>DeFi Sentinel</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', maxWidth: '600px' }}>
            Autonomous AI risk monitoring for your Casper Network portfolio. Connect your wallet to let the Agent analyze your on-chain data and protect your assets.
          </p>
        </div>
        <button 
          onClick={connectWallet}
          disabled={isRegistering}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.2rem',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'background 0.2s',
          }}
        >
          {isRegistering ? 'Registering...' : 'Connect Casper Wallet'}
        </button>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!state) {
    return (
      <div className="dashboard">
        <div className="header">
          <div className="header-left">
            <span style={{ fontSize: '1.5rem' }}>🛡️</span>
            <h1 className="header-title">DeFi Sentinel</h1>
          </div>
          <div className="header-right">
            <div className={`live-badge ${connected ? 'running' : 'error'}`}>
              <div className="live-dot" />
              {connected ? 'Connecting...' : 'Disconnected'}
            </div>
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          color: 'var(--text-muted)',
        }}>
          {error ? (
            <>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
              <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                Cannot connect to agent API
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                Make sure the agent is running: <code style={{ color: 'var(--accent-light)' }}>cd agent && npm run dev</code>
              </div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--danger)' }}>
                {error}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
              <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                Waiting for Agent Analysis...
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                The AI is polling the blockchain for your wallet data. This may take up to 60 seconds.
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Fallback delegation info for when walletData exists but no delegation data
  const defaultDelegation: DelegationInfo = {
    totalStaked: '0',
    validators: [],
    stakingRatio: 0,
  };

  const walletData = state.walletData;
  const riskResult = state.riskResult;
  const csprPrice = 0.015; // fallback; ideally comes from API

  return (
    <div className="dashboard">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="header">
        <div className="header-left">
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
          <h1 className="header-title">DeFi Sentinel</h1>
          <span style={{
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            padding: '0.2rem 0.5rem',
            background: 'var(--bg-glass)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--bg-glass-border)',
          }}>
            Cycle #{state.totalCyclesRun}
          </span>
        </div>
        <div className="header-right">
          <div className={`live-badge ${state.agentStatus}`}>
            <div className="live-dot" />
            {state.agentStatus === 'running' ? 'LIVE' : state.agentStatus.toUpperCase()}
          </div>
          <button className="pause-btn" onClick={togglePause}>
            {state.agentStatus === 'paused' ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>

      {/* ── Top Row: Gauge + Position + x402 ────────────────────────────────── */}
      <div className="top-row">
        <RiskGauge
          score={riskResult?.score ?? 0}
          level={riskResult?.level ?? 'safe'}
          recommendation={riskResult?.recommendation ?? 'hold'}
        />

        {walletData ? (
          <PositionList
            walletData={walletData}
            delegationInfo={defaultDelegation}
            csprPrice={csprPrice}
          />
        ) : (
          <div className="card">
            <div className="card-header">Wallet Position</div>
            <div className="skeleton" style={{ height: '120px' }} />
          </div>
        )}

        {/* x402 Status Card */}
        <div className="card">
          <div className="card-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            x402 Micropayments
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Spent
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              <span className="big-value" style={{ color: 'var(--cyan)', fontSize: '1.5rem' }}>
                {state.x402Status.totalSpentCSPR}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>CSPR</span>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--bg-glass-border)',
          }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>API Calls</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.2rem' }}>
                {state.x402Status.totalCalls}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Cost</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.2rem' }}>
                {state.x402Status.averageCostPerCall}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Risk Chart ──────────────────────────────────────────────────────── */}
      <div className="chart-row">
        <RiskChart history={riskHistory} />
      </div>

      {/* ── Agent Reasoning ─────────────────────────────────────────────────── */}
      <div className="reasoning-row">
        <AgentReasoningFeed decision={state.lastDecision} />
      </div>

      {/* ── Action Log ──────────────────────────────────────────────────────── */}
      <div className="action-row">
        <ActionLog actions={state.recentActions} />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center',
        padding: '1.5rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}>
        DeFi Sentinel v0.2.0 — Multi-Tenant Prototype •
        Wallet: <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
          {state.walletAddress?.slice(0, 16)}...
        </span>
        • Last updated: {new Date(state.lastUpdated).toLocaleTimeString()}
      </div>
    </div>
  );
}
