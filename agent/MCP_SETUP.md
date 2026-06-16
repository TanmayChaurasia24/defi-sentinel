# Casper MCP Server — Setup Guide

This guide walks you through running the **casper-network-mcp** server locally so that DeFi Sentinel's AI agent can call Casper blockchain tools.

---

## What is the MCP Server?

The [Casper Network MCP Server](https://github.com/Tairon-ai/casper-network-mcp) by Tairon-AI is an open-source [Model Context Protocol](https://modelcontextprotocol.io/) server that wraps the Casper Network into AI-callable tools.

DeFi Sentinel's Week 2 Claude agent will call this server to:
- Read account balances and delegation info
- Submit rebalance transactions (delegate/undelegate)
- Query validator lists and network status

---

## Prerequisites

| Requirement | Version | Install |
|---|---|---|
| Node.js | >= 18.0.0 | [nodejs.org](https://nodejs.org) |
| npm | >= 9.0.0 | bundled with Node.js |
| CSPR.cloud API key | — | [cspr.build](https://cspr.build) |

---

## Step 1 — Clone the MCP Server

```bash
git clone https://github.com/Tairon-ai/casper-network-mcp.git
cd casper-network-mcp
```

---

## Step 2 — Install Dependencies

```bash
npm install
```

---

## Step 3 — Configure Environment

```bash
cp .env.example .env
```

Open `.env` and set the following:

```env
# Your CSPR.cloud API key (get from https://cspr.build)
CASPER_API_KEY=your_cspr_cloud_key_here

# Use testnet during development
CASPER_NETWORK=testnet

# The port the HTTP server will listen on (default: 3000)
PORT=3000
```

---

## Step 4 — Start the Server

**HTTP mode** (for the DeFi Sentinel agent):
```bash
npm start
```

**Stdio mode** (for Claude Desktop integration):
```bash
npm run mcp
```

You should see output like:
```
🚀 Casper Network MCP Server running on http://localhost:3000
✅ Connected to Casper Testnet via CSPR.cloud
📦 23 tools available
```

---

## Step 5 — Test the Server

Verify it's running and check available tools:

```bash
# Health check
curl http://localhost:3000/health

# List available tools
curl http://localhost:3000/tools | python3 -m json.tool

# Test: get network status
curl -X POST http://localhost:3000/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "get_network_status", "arguments": {}}'

# Test: get account balance (replace with a real testnet address)
curl -X POST http://localhost:3000/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_account_balance",
    "arguments": {
      "account_identifier": "your_testnet_wallet_address"
    }
  }'
```

---

## Step 6 — Connect the DeFi Sentinel Agent

Set the MCP server URL in `agent/.env`:

```env
MCP_SERVER_URL=http://localhost:3000
```

The agent's `src/mcp.ts` module will automatically discover and call tools from this server. In Week 2, the Claude AI agent will use these tools for its decision loop.

---

## Available Tools (Week 2)

| Tool Name | Description |
|---|---|
| `get_account_info` | Account details and keys |
| `get_account_balance` | CSPR balance in motes |
| `transfer_cspr` | Send CSPR to an address |
| `delegate_stake` | Stake CSPR with a validator |
| `undelegate_stake` | Unstake CSPR from a validator |
| `get_validators` | List of 50+ validators with APY |
| `get_deploy_status` | Check a deploy hash status |
| `get_network_status` | Current era, block height |

---

## Troubleshooting

**Server won't start?**
- Ensure Node.js >= 18: `node --version`
- Ensure your `CASPER_API_KEY` is set in `.env`
- Check port 3000 is free: `lsof -i :3000`

**API key errors?**
- Generate a new key at [cspr.build](https://cspr.build)
- Make sure you're using the testnet key for testnet operations

**Tools not found?**
- The `casper-network-mcp` server may update its tool names. Check the README: `cat README.md`
- The DeFi Sentinel `KNOWN_MCP_TOOLS` list in `src/mcp.ts` may need updating

---

## Claude Desktop Integration (Optional)

To connect the MCP server to Claude Desktop, add this to your Claude config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "casper-network": {
      "command": "node",
      "args": ["/path/to/casper-network-mcp/dist/index.js"],
      "env": {
        "CASPER_API_KEY": "your_key_here",
        "CASPER_NETWORK": "testnet"
      }
    }
  }
}
```

Restart Claude Desktop and you'll see Casper tools available in the 🔧 toolbar.
