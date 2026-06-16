'use client';

import React from 'react';

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

interface PositionListProps {
  walletData: WalletData;
  delegationInfo: DelegationInfo;
  csprPrice: number;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'unknown';
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PositionList({ walletData, delegationInfo, csprPrice }: PositionListProps) {
  const liquidCspr = parseFloat(walletData.balance) || 0;
  const stakedCspr = parseFloat(delegationInfo.totalStaked) || 0;
  const liquidUsd = liquidCspr * csprPrice;
  const stakedUsd = stakedCspr * csprPrice;
  const ratioPercent = (delegationInfo.stakingRatio * 100).toFixed(1);

  const ratioColor = delegationInfo.stakingRatio > 0.8 ? 'var(--danger)'
    : delegationInfo.stakingRatio > 0.6 ? 'var(--warning)' : 'var(--safe)';

  return (
    <div className="card">
      <div className="card-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
        </svg>
        Wallet Position
      </div>

      {/* Liquid balance */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Liquid Balance
          </span>
          <span className="badge badge-info">Available</span>
        </div>
        <div style={{ marginTop: '0.25rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {liquidCspr.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>CSPR</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          ≈ ${liquidUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
        </div>
      </div>

      {/* Staked balance */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Staked Balance
          </span>
          <span className="badge badge-warning">{delegationInfo.validators.length} validator{delegationInfo.validators.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ marginTop: '0.25rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stakedCspr.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>CSPR</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          ≈ ${stakedUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
        </div>
      </div>

      {/* Staking ratio bar */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Staking Ratio</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: ratioColor }}>
            {ratioPercent}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(delegationInfo.stakingRatio * 100, 100)}%`,
              background: `linear-gradient(90deg, var(--safe), ${ratioColor})`,
            }}
          />
        </div>
      </div>

      {/* Last activity */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        paddingTop: '0.75rem',
        borderTop: '1px solid var(--bg-glass-border)',
      }}>
        <span>Last activity</span>
        <span>{formatRelativeTime(walletData.lastActivity)}</span>
      </div>
    </div>
  );
}
