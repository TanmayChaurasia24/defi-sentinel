"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_MCP_TOOLS = void 0;
exports.listMcpTools = listMcpTools;
exports.callMcpTool = callMcpTool;
exports.testMcpConnectivity = testMcpConnectivity;
const axios_1 = __importStar(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// ─────────────────────────────────────────────────────────────────────────────
// Known MCP tools (from casper-network-mcp README)
// These are used by the Claude agent to decide what to call.
// ─────────────────────────────────────────────────────────────────────────────
exports.KNOWN_MCP_TOOLS = [
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
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:3000';
/**
 * Lists all available MCP tools — first attempts to fetch from the live
 * server, falls back to the hardcoded KNOWN_MCP_TOOLS list.
 */
async function listMcpTools() {
    try {
        const { data } = await axios_1.default.get(`${MCP_SERVER_URL}/tools`, {
            timeout: 5_000,
        });
        // MCP servers expose tools at /tools or under a "tools" key
        const tools = data.tools ?? data ?? [];
        console.log(`[mcp] Connected to MCP server at ${MCP_SERVER_URL} — ${tools.length} tools available`);
        return tools;
    }
    catch (err) {
        const msg = err instanceof axios_1.AxiosError ? err.message : String(err);
        console.warn(`[mcp] MCP server unreachable (${msg}). Using static tool list.`);
        return exports.KNOWN_MCP_TOOLS;
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
async function callMcpTool(toolName, params = {}) {
    // Validate the tool name against known tools
    const knownNames = exports.KNOWN_MCP_TOOLS.map((t) => t.name);
    if (!knownNames.includes(toolName)) {
        return {
            success: false,
            error: `Unknown MCP tool: "${toolName}". Available: ${knownNames.join(', ')}`,
        };
    }
    try {
        const { data } = await axios_1.default.post(`${MCP_SERVER_URL}/tools/call`, { name: toolName, arguments: params }, { timeout: 15_000, headers: { 'Content-Type': 'application/json' } });
        if (data.error) {
            return { success: false, error: data.error };
        }
        return { success: true, data: data.result };
    }
    catch (err) {
        const msg = err instanceof axios_1.AxiosError
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
async function testMcpConnectivity() {
    try {
        await axios_1.default.get(`${MCP_SERVER_URL}/health`, { timeout: 3_000 });
        return true;
    }
    catch {
        // Try an alternative health path
        try {
            await axios_1.default.get(`${MCP_SERVER_URL}/`, { timeout: 3_000 });
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=mcp.js.map