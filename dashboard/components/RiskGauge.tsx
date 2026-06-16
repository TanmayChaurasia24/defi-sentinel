'use client';

import React from 'react';

interface RiskGaugeProps {
  score: number;
  level: 'safe' | 'warning' | 'danger';
  recommendation: string;
}

export default function RiskGauge({ score, level, recommendation }: RiskGaugeProps) {
  // SVG arc calculation
  const radius = 80;
  const strokeWidth = 12;
  const circumference = Math.PI * radius; // half circle
  const progress = (score / 100) * circumference;

  const color = level === 'danger' ? 'var(--danger)'
    : level === 'warning' ? 'var(--warning)' : 'var(--safe)';

  const glowColor = level === 'danger' ? 'var(--danger-glow)'
    : level === 'warning' ? 'var(--warning-glow)' : 'var(--safe-glow)';

  const bgColor = level === 'danger' ? 'var(--danger-bg)'
    : level === 'warning' ? 'var(--warning-bg)' : 'var(--safe-bg)';

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="card-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Risk Score
      </div>

      <div
        className={level === 'danger' ? 'pulse-danger' : ''}
        style={{ position: 'relative', width: '200px', height: '120px', margin: '0 auto' }}
      >
        <svg width="200" height="120" viewBox="0 0 200 120">
          {/* Background arc */}
          <path
            d="M 10 110 A 90 90 0 0 1 190 110"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          <path
            d="M 10 110 A 90 90 0 0 1 190 110"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{
              filter: `drop-shadow(0 0 6px ${glowColor})`,
              transition: 'stroke-dasharray 0.8s ease, stroke 0.3s ease',
            }}
          />
        </svg>

        {/* Center score */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -10%)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: color,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            transition: 'color 0.3s ease',
          }}>
            {score}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            / 100
          </div>
        </div>
      </div>

      {/* Level badge */}
      <div style={{ marginTop: '0.75rem' }}>
        <span
          className={`badge badge-${level}`}
          style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
        >
          {level.toUpperCase()}
        </span>
      </div>

      {/* Recommendation */}
      <div style={{
        marginTop: '0.5rem',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
      }}>
        Recommendation: <span style={{ color: color, fontWeight: 600 }}>{recommendation}</span>
      </div>

      {/* Glow background effect */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '120px',
        height: '120px',
        background: bgColor,
        borderRadius: '50%',
        filter: 'blur(40px)',
        pointerEvents: 'none',
        zIndex: -1,
      }} />
    </div>
  );
}
