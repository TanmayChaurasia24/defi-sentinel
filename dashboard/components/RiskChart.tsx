'use client';

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Area, AreaChart
} from 'recharts';

interface RiskHistoryEntry {
  score: number;
  level: string;
  timestamp: string;
}

interface RiskChartProps {
  history: RiskHistoryEntry[];
}

function formatChartTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const level = score >= 70 ? 'DANGER' : score >= 40 ? 'WARNING' : 'SAFE';
  const color = score >= 70 ? 'var(--danger)' : score >= 40 ? 'var(--warning)' : 'var(--safe)';

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--bg-glass-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '0.6rem 0.8rem',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color }}>
        {score}/100 — {level}
      </div>
    </div>
  );
}

export default function RiskChart({ history }: RiskChartProps) {
  const data = history.map((entry) => ({
    ...entry,
    time: formatChartTime(entry.timestamp),
  }));

  return (
    <div className="card">
      <div className="card-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
        </svg>
        Risk Score History
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          fontWeight: 400,
          textTransform: 'none',
          letterSpacing: 'normal',
        }}>
          Last {history.length} readings
        </span>
      </div>

      {data.length < 2 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}>
          Collecting data... Chart appears after 2+ readings.
        </div>
      ) : (
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-light)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-light)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={false}
              />

              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={35}
              />

              <Tooltip content={<CustomTooltip />} />

              {/* Warning threshold */}
              <ReferenceLine
                y={40}
                stroke="var(--warning)"
                strokeDasharray="6 4"
                strokeOpacity={0.5}
                label={{
                  value: 'WARNING',
                  position: 'right',
                  fill: 'var(--warning)',
                  fontSize: 10,
                  opacity: 0.6,
                }}
              />

              {/* Danger threshold */}
              <ReferenceLine
                y={70}
                stroke="var(--danger)"
                strokeDasharray="6 4"
                strokeOpacity={0.5}
                label={{
                  value: 'DANGER',
                  position: 'right',
                  fill: 'var(--danger)',
                  fontSize: 10,
                  opacity: 0.6,
                }}
              />

              <Area
                type="monotone"
                dataKey="score"
                stroke="var(--accent-light)"
                strokeWidth={2}
                fill="url(#riskGradient)"
                dot={{
                  r: 4,
                  fill: 'var(--bg-secondary)',
                  stroke: 'var(--accent-light)',
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: 'var(--accent-light)',
                  stroke: 'var(--bg-primary)',
                  strokeWidth: 2,
                }}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
