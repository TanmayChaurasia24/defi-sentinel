/**
 * mcp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Casper MCP (Model Context Protocol) client wrapper for DeFi Sentinel.
 *
 * The Casper MCP server (github.com/Tairon-ai/casper-network-mcp) exposes
 * blockchain tools over HTTP (JSON-RPC style) so that AI agents can interact
 * with the Casper Network without direct SDK calls.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios, { AxiosError } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known MCP tools (from casper-network-mcp README)
// These are used by the Claude agent to decide what to call.
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWN_MCP_TOOLS: McpTool[] = [
  {
    name: 'get_account_info',
    description: 'Get account information including balance and keys',
    inputSchema: { account_identifier: { type: 'string', required: true } },
  },
  {
    name: 'get_account_balance',
    description: 'Get the CSPR balance of an account in motes',
    inputSchema: { account_identifier: { type: 'string', required: true } },
  },
  {
    name: 'transfer_cspr',
    description: 'Transfer CSPR tokens from the agent wallet to a recipient',
    inputSchema: {
      recipient: { type: 'string', required: true },
      amount_motes: { type: 'string', required: true },
    },
  },
  {
    name: 'delegate_stake',
    description: 'Delegate CSPR to a validator',
    inputSchema: {
      validator_public_key: { type: 'string', required: true },
      amount_motes: { type: 'string', required: true },
    },
  },
  {
    name: 'undelegate_stake',
    description: 'Undelegate CSPR from a validator',
    inputSchema: {
      validator_public_key: { type: 'string', required: true },
      amount_motes: { type: 'string', required: true },
    },
  },
  {
    name: 'get_validators',
    description: 'Get a curated list of 50+ Casper validators with APY data',
    inputSchema: {},
  },
  {
    name: 'get_deploy_status',
    description: 'Check the status of a submitted deploy by hash',
    inputSchema: { deploy_hash: { type: 'string', required: true } },
  },
  {
    name: 'get_network_status',
    description: 'Get the current status of the Casper Network (era, block)',
    inputSchema: {},
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MCP client
// ─────────────────────────────────────────────────────────────────────────────

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? 'http://localhost:3000';

/**
 * Lists all available MCP tools — first attempts to fetch from the live
 * server, falls back to the hardcoded KNOWN_MCP_TOOLS list.
 */
export async function listMcpTools(): Promise<McpTool[]> {
  try {
    const { data } = await axios.get(`${MCP_SERVER_URL}/tools`, {
      timeout: 5_000,
    });
    // MCP servers expose tools at /tools or under a "tools" key
    const tools: McpTool[] = data.tools ?? data ?? [];
    console.log(`[mcp] Connected to MCP server at ${MCP_SERVER_URL} — ${tools.length} tools available`);
    return tools;
  } catch (err) {
    const msg = err instanceof AxiosError ? err.message : String(err);
    console.warn(`[mcp] MCP server unreachable (${msg}). Using static tool list.`);
    return KNOWN_MCP_TOOLS;
  }
}

/**
 * Calls a tool on the MCP server.
 *
 * The Casper MCP server follows MCP protocol: POST /tools/call
 * with body { name, arguments }.
 *
 * @param toolName  - Name of the MCP tool to invoke
 * @param params    - Tool parameters matching the tool's inputSchema
 */
export async function callMcpTool<T = unknown>(
  toolName: string,
  params: Record<string, unknown> = {}
): Promise<McpCallResult<T>> {
  // Validate the tool name against known tools
  const knownNames = KNOWN_MCP_TOOLS.map((t) => t.name);
  if (!knownNames.includes(toolName)) {
    return {
      success: false,
      error: `Unknown MCP tool: "${toolName}". Available: ${knownNames.join(', ')}`,
    };
  }

  try {
    const { data } = await axios.post<{ result: T; error?: string }>(
      `${MCP_SERVER_URL}/tools/call`,
      { name: toolName, arguments: params },
      { timeout: 15_000, headers: { 'Content-Type': 'application/json' } }
    );

    if (data.error) {
      return { success: false, error: data.error };
    }

    return { success: true, data: data.result };
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status ?? 'timeout'}: ${err.message}`
      : String(err);
    console.error(`[mcp] callMcpTool(${toolName}) failed: ${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * Performs a simple connectivity check against the MCP server.
 * Returns true if the server is reachable.
 */
export async function testMcpConnectivity(): Promise<boolean> {
  try {
    await axios.get(`${MCP_SERVER_URL}/health`, { timeout: 3_000 });
    return true;
  } catch {
    // Try an alternative health path
    try {
      await axios.get(`${MCP_SERVER_URL}/`, { timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }
}
