# 🛡️ DeFi Sentinel — Autonomous On-Chain Risk Monitor

> **Casper Agentic Buildathon 2026** submission
> An autonomous AI agent that monitors DeFi wallet positions on the Casper Network 24/7.

---

## 🧠 What is DeFi Sentinel?

DeFi Sentinel is an **autonomous AI agent** that watches your Casper wallet in real time and protects it from risky positions. It combines formula-based risk scoring with Claude AI reasoning to make intelligent, explainable decisions.

### How it works (end-to-end)

1. **Polls** a Casper wallet every 60 seconds via CSPR.cloud API
2. **Computes** a risk score (0–100) using a formula-based engine
3. **Feeds** the risk data into a **Claude Sonnet 4** AI agent via MCP tools
4. **Claude decides**: `rebalance` / `alert` / `hold` — and explains its reasoning
5. If `rebalance`: agent **auto-signs and broadcasts a transaction** on Casper Testnet
6. Every API data query can be **paid via x402 micropayments**
7. Every action is **logged immutably** to the Sentinel Odra smart contract
8. A **Next.js dashboard** shows live risk scores, agent reasoning, and action history

---

## 📁 Project Structure

```
defi-sentinel/
├── contracts/               # Rust/Odra 2.1.0 smart contract
│   ├── Cargo.toml
│   └── src/sentinel.rs      # SentinelContract (deployed to Casper Testnet)
│
├── agent/                   # TypeScript autonomous agent
│   └── src/
│       ├── index.ts          # Main polling loop + orchestration
│       ├── risk.ts           # Formula-based risk scoring engine
│       ├── casper.ts         # CSPR.cloud API client
│       ├── claude.ts         # Claude AI agent (Sonnet 4 + MCP tools)
│       ├── transaction.ts    # Autonomous tx signing + safety guards
│       ├── x402.ts           # x402 micropayment client
│       ├── contract.ts       # On-chain logging to Sentinel contract
│       ├── mcp.ts            # MCP server client wrapper
│       ├── server.ts         # Express API for dashboard
│       └── utils.ts          # Shared utilities
│
├── dashboard/               # Next.js 16 dashboard UI
│   ├── app/page.tsx          # Main dashboard layout
│   └── components/
│       ├── RiskGauge.tsx     # SVG circular risk gauge
│       ├── PositionList.tsx  # Wallet position cards
│       ├── ActionLog.tsx     # Action history table
│       ├── AgentReasoningFeed.tsx  # Claude AI output display
│       └── RiskChart.tsx     # Recharts risk score history
│
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm
- (Optional) Casper MCP Server for enhanced tool access

### 1. Clone and configure

```bash
git clone <repo-url>
cd defi-sentinel

# Configure agent environment
cp agent/.env.example agent/.env
# Edit agent/.env with your keys
```

### 2. Install dependencies

```bash
# Agent
cd agent && npm install

# Dashboard
cd ../dashboard && npm install
```

### 3. Run everything

```bash
# Terminal 1 — Start Agent + API Server
cd agent && npm run dev

# Terminal 2 — Start Dashboard
cd dashboard && npm run dev
```

- **Agent**: starts polling, prints risk scores and AI decisions to terminal
- **API Server**: runs on http://localhost:4000
- **Dashboard**: opens at http://localhost:3000

---

## 🤖 AI Agent

DeFi Sentinel uses **Claude Sonnet 4** as its decision-making brain. The agent:

- Receives real-time wallet data via Casper MCP Server tools
- Analyzes risk using formula-based scoring plus contextual AI reasoning
- Makes autonomous decisions: **rebalance** / **alert** / **hold**
- Explains every decision in plain English with confidence scores
- Supports multi-turn tool use (up to 5 iterations per cycle)

### Fallback Mode

If `ANTHROPIC_API_KEY` is not set, the agent falls back to deterministic mode — it uses the risk engine's recommendation directly without calling Claude. The agent never crashes due to a missing API key.

### Sample Agent Output

```
╔══════════════════════════════════════════════════════════╗
║         🛡️  DeFi Sentinel — Week 2 Agent v0.2.0          ║
║     Autonomous AI Risk Monitor (Casper Testnet)          ║
╚══════════════════════════════════════════════════════════╝

  [82/100] 🔴 DANGER → rebalance | Extreme staking ratio (+35), Severe price crash (+30)

┌──────────────────────────────────────────────────────────┐
│  🤖 DeFi Sentinel AI Decision                            │
├──────────────────────────────────────────────────────────┤
│  Action:     REBALANCE                                    │
│  Confidence: 87%                                          │
│  Urgency:    high                                         │
│  Amount:     50 CSPR                                      │
│                                                           │
│  Reasoning:                                               │
│  Staking ratio at 85% with a 12% price crash in 24h.     │
│  Immediate rebalance of 50 CSPR to reduce exposure.      │
└──────────────────────────────────────────────────────────┘
```

---

## 💸 x402 Micropayments

Every blockchain data query can be paid via Casper's native x402 protocol:

- Agent pays per-request with cryptographic payment proof
- Payments are micro-sized (fractions of CSPR)
- Full payment history visible on the dashboard
- **Graceful fallback**: if x402 payment fails, the agent continues without payment

---

## 🛡️ Safety Guards

DeFi Sentinel includes 5 non-negotiable safety guards that prevent the agent from acting recklessly:

| # | Guard | Default |
|---|-------|---------|
| 1 | Max rebalance amount | 50 CSPR (`REBALANCE_AMOUNT_CSPR`) |
| 2 | Max % of liquid balance | 30% |
| 3 | Rate limit | 3 rebalances per hour |
| 4 | Risk threshold | Score ≥ 70 required |
| 5 | Testnet only | Refuses to run on mainnet |

---

## 🖥️ Dashboard

The Next.js dashboard provides a live view of the agent's state:

- **Risk Gauge**: SVG circular dial with glow effects and pulse animation at danger level
- **Wallet Position**: Liquid/staked balances with USD values and staking ratio bar
- **x402 Status**: Total API calls, total CSPR spent, average cost per call
- **Risk Chart**: Historical risk score line chart with warning/danger threshold lines
- **Agent Reasoning**: Full Claude AI output with confidence meter and warning badges
- **Action Log**: Scrollable table with color-coded action badges and explorer links

The dashboard polls the agent API every 10 seconds. It also supports **pause/resume** controls.

---

## 📋 Risk Scoring Engine

The formula-based risk engine evaluates 4 factors:

| Factor | Condition | Points |
|--------|-----------|--------|
| Extreme staking ratio | > 80% staked | +35 |
| High staking ratio | 60–80% staked | +20 |
| Severe price crash | 24h change < -10% | +30 |
| Price dip | 24h change < -5% | +15 |
| Critical liquid balance | < 100 CSPR liquid | +20 |
| Low liquid balance | < 500 CSPR liquid | +10 |
| Prolonged inactivity | > 30 days since last tx | +5 |

Score thresholds: **0–39** = Safe, **40–69** = Warning, **70–100** = Danger

---

## ⚙️ Environment Variables

See [`agent/.env.example`](agent/.env.example) for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `CSPR_CLOUD_API_KEY` | CSPR.cloud API key |
| `WATCHED_WALLET` | Casper wallet address to monitor |
| `ANTHROPIC_API_KEY` | Claude AI API key (optional) |
| `RISK_THRESHOLD` | Risk score threshold for rebalance (default: 70) |
| `REBALANCE_AMOUNT_CSPR` | Max CSPR per rebalance (default: 50) |
| `DASHBOARD_API_PORT` | Express API port (default: 4000) |

---

## 🧪 Testing

```bash
cd agent
npm test        # 28 unit tests for risk scoring engine
npm run lint    # TypeScript strict mode compilation check
```

---

## 📜 Smart Contract

The Sentinel contract (Odra 2.1.0 on Casper Testnet) stores:

- Risk scores per wallet
- Rebalance deploy hashes
- Action history (hold/alert/rebalance)
- Action timestamps and counts

Entry points: `update_risk_score`, `log_rebalance`, `log_action`
Read endpoints: `get_risk_score`, `get_action_count`, `get_last_action`, `get_deploy_hash`, `get_owner`

---

## 📄 License

MIT
