'use client';

import React from 'react';

interface ActionEntry {
  id: string;
  timestamp: string;
  action: 'rebalance' | 'alert' | 'hold';
  riskScore: number;
  reasoning: string;
  deployHash?: string;
  explorerUrl?: string;
}

interface ActionLogProps {
  actions: ActionEntry[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ActionLog({ actions }: ActionLogProps) {
  const badgeClass = (action: string) => {
    switch (action) {
      case 'rebalance': return 'badge badge-danger';
      case 'alert': return 'badge badge-warning';
      default: return 'badge badge-safe';
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Action Log
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          fontWeight: 400,
          textTransform: 'none',
          letterSpacing: 'normal',
        }}>
          {actions.length} action{actions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {actions.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem 1rem',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}>
          No actions recorded yet. Waiting for first poll cycle...
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Risk</th>
                <th>Reasoning</th>
                <th>Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.8rem' }}>{formatTime(entry.timestamp)}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatDate(entry.timestamp)}</div>
                    </div>
                  </td>
                  <td>
                    <span className={badgeClass(entry.action)}>
                      {entry.action}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontWeight: 600,
                      color: entry.riskScore >= 70 ? 'var(--danger)'
                        : entry.riskScore >= 40 ? 'var(--warning)' : 'var(--safe)',
                    }}>
                      {entry.riskScore}
                    </span>
                  </td>
                  <td>
                    <div style={{
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: '0.8rem',
                    }}>
                      {entry.reasoning}
                    </div>
                  </td>
                  <td>
                    {entry.deployHash && entry.explorerUrl ? (
                      <a
                        href={entry.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}
                      >
                        {entry.deployHash.slice(0, 12)}...
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
