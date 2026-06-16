'use client';

import React from 'react';

interface AgentDecision {
  action: 'rebalance' | 'alert' | 'hold';
  reasoning: string;
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
  suggestedAmount?: string;
  warnings: string[];
  timestamp: string;
}

interface AgentReasoningFeedProps {
  decision: AgentDecision | null;
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
  return `${hours}h ago`;
}

export default function AgentReasoningFeed({ decision }: AgentReasoningFeedProps) {
  if (!decision) {
    return (
      <div className="card">
        <div className="card-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Agent Reasoning
        </div>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}>
          Waiting for first AI decision...
        </div>
      </div>
    );
  }

  const actionColor = decision.action === 'rebalance' ? 'var(--danger)'
    : decision.action === 'alert' ? 'var(--warning)' : 'var(--safe)';

  const urgencyColor = decision.urgency === 'high' ? 'var(--danger)'
    : decision.urgency === 'medium' ? 'var(--warning)' : 'var(--safe)';

  const confidenceColor = decision.confidence >= 80 ? 'var(--safe)'
    : decision.confidence >= 50 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="card" style={{ borderColor: `${actionColor}20` }}>
      <div className="card-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Agent Reasoning
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          fontWeight: 400,
          textTransform: 'none',
          letterSpacing: 'normal',
        }}>
          {formatRelativeTime(decision.timestamp)}
        </span>
      </div>

      {/* Agent header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--bg-glass-border)',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${actionColor}30, ${actionColor}10)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          border: `1px solid ${actionColor}40`,
        }}>
          🛡️
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            DeFi Sentinel says:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
            <span className={`badge badge-${decision.action === 'rebalance' ? 'danger' : decision.action === 'alert' ? 'warning' : 'safe'}`}>
              {decision.action.toUpperCase()}
            </span>
            <span className="badge" style={{
              background: `${urgencyColor}15`,
              color: urgencyColor,
              border: `1px solid ${urgencyColor}40`,
            }}>
              {decision.urgency} urgency
            </span>
          </div>
        </div>
      </div>

      {/* Reasoning text */}
      <div style={{
        fontSize: '0.9rem',
        lineHeight: 1.6,
        color: 'var(--text-secondary)',
        marginBottom: '1rem',
      }}>
        {decision.reasoning}
      </div>

      {/* Suggested amount (for rebalance) */}
      {decision.suggestedAmount && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'var(--danger-bg)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Suggested Rebalance</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>
            {decision.suggestedAmount} CSPR
          </span>
        </div>
      )}

      {/* Confidence meter */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Confidence</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: confidenceColor }}>
            {decision.confidence}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${decision.confidence}%`,
              background: `linear-gradient(90deg, ${confidenceColor}80, ${confidenceColor})`,
            }}
          />
        </div>
      </div>

      {/* Warnings */}
      {decision.warnings.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Warnings
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {decision.warnings.map((warning, i) => (
              <span
                key={i}
                style={{
                  padding: '0.25rem 0.6rem',
                  background: 'var(--warning-bg)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  color: 'var(--warning)',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                ⚠ {warning.length > 60 ? warning.slice(0, 60) + '...' : warning}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
