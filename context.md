# DeFi Sentinel — Full Project Context

## 1. Project Overview
**DeFi Sentinel** is an autonomous AI agent built for the **Casper Agentic Buildathon 2026**. It acts as a 24/7 on-chain risk monitor for DeFi wallets on the Casper Network. 

Instead of relying solely on hardcoded rules, it combines a deterministic mathematical risk engine with **Claude Sonnet 4** to make intelligent, explainable decisions. If an extreme risk scenario occurs (e.g., a massive price crash combined with a high staking ratio), the agent can autonomously sign and broadcast a "rebalance" transaction to protect the wallet's funds, while logging its actions to an immutable smart contract.

The system is broken down into three main components:
1. **The Smart Contract** (Rust / Odra 2.1.0)
2. **The Autonomous Agent** (Node.js / TypeScript)
3. **The Live Dashboard** (Next.js 16)

---

## 2. Core Architecture & Components

### 2.1 Smart Contract (`contracts/`)
Written in Rust using the Odra 2.1.0 framework, the smart contract (`sentinel.rs`) acts as the on-chain memory for the agent.
*   **Role:** Immutably stores the history of risk scores and actions taken by the agent.
*   **Key Entry Points:**
    *   `update_risk_score`: Saves the latest 0-100 score for a specific wallet.
    *   `log_rebalance`: Saves the transaction hash of an autonomous rebalance execution.
    *   `log_action`: Logs whether the agent decided to `alert` or `hold`.
*   **Deployment:** Deployed on the Casper Testnet via `deploy.sh`.

### 2.2 Autonomous AI Agent (`agent/`)
The brain of the operation. It runs as a continuous Node.js daemon (managed via `index.ts`), executing a strict polling loop every 60 seconds.

*   **`casper.ts`**: Handles fetching blockchain data (balances, staking info) via the CSPR.cloud API.
*   **`risk.ts`**: The deterministic risk engine. Evaluates liquid balances, staking ratios, and inactivity to output a baseline score from 0-100.
*   **`x402.ts`**: The micropayment engine. Every CSPR.cloud API request is wrapped through this client. If the API demands payment (`402 Payment Required`), this module generates a cryptographic proof, pays a tiny fraction of CSPR, and retries the request seamlessly.
*   **`claude.ts` & `mcp.ts`**: The AI decision engine. Claude Sonnet 4 receives the risk score and wallet data. It can iteratively request more data using **MCP Tools** (Model Context Protocol) via `mcp.ts`. It outputs a final JSON decision: `rebalance`, `alert`, or `hold`, along with reasoning and confidence metrics.
*   **`transaction.ts`**: The execution arm. If Claude decides to `rebalance`, this module uses `casper-js-sdk` to build, sign, and broadcast a transfer deploy.
    *   **Safety Guards:** It enforces 5 hard limits: (1) Max 50 CSPR per transaction, (2) Cannot exceed 30% of liquid balance, (3) Rate limited to 3 actions per hour, (4) Requires a risk score ≥ 70, (5) Strictly blocked from running on Mainnet.
*   **`server.ts`**: An Express.js API running on port 4000. It caches the agent's live state so the Next.js dashboard can read it without interrupting the polling loop.

### 2.3 Live Dashboard (`dashboard/`)
A Next.js 16 (App Router) web interface that gives users a visual, real-time window into the AI's brain.
*   **Polling:** Fetches data from the agent's Express server (`http://localhost:4000/api/status`) every 10 seconds.
*   **Components:**
    *   **Risk Gauge**: An animated SVG dial showing the 0-100 risk score (pulsing red at Danger levels).
    *   **Position List**: Displays liquid/staked CSPR balances, USD values, and staking ratios.
    *   **x402 Metrics**: Tracks how many API calls were made and the total CSPR spent on micro-fees.
    *   **Agent Reasoning Feed**: Displays Claude's exact output, confidence score, and any warning flags it detected.
    *   **Risk Chart & Action Log**: A historical Recharts graph of the risk score, and a table of previous actions with direct links to the block explorer.

---

## 3. Data & Execution Flow (Step-by-Step)

1.  **Initialization**: `npm run dev` starts the Express API and begins the 60-second cron loop.
2.  **Fetch**: The agent asks CSPR.cloud for wallet data. (If asked for an x402 fee, it pays it).
3.  **Score**: `risk.ts` evaluates the data and generates a base risk score (e.g., `85/100`).
4.  **Think**: Claude AI reviews the score. It might use MCP tools to check validator status. It concludes: *"Staking ratio too high amidst price drop. Action: REBALANCE."*
5.  **Execute**: `transaction.ts` verifies the safety guards. It signs a transaction moving 50 CSPR to safety and broadcasts it to Casper Testnet.
6.  **Log**: `contract.ts` sends a transaction to the Sentinel Odra contract, recording the deploy hash and the new risk score.
7.  **Update UI**: The dashboard polls the Express server, visually updating the Risk Gauge and printing Claude's reasoning to the screen.

---

## 4. Key Technologies Used
*   **Blockchain**: Casper Network (Testnet), `casper-js-sdk`
*   **Smart Contracts**: Rust, Odra 2.1.0
*   **AI / LLM**: Anthropic Claude 3.5 Sonnet, Model Context Protocol (MCP)
*   **Micropayments**: Casper x402 Protocol
*   **Backend**: Node.js, TypeScript, Express, node-cron
*   **Frontend**: Next.js 16, React, Recharts, standard CSS (Dark theme/Glassmorphism)
