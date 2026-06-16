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
export declare const KNOWN_MCP_TOOLS: McpTool[];
/**
 * Lists all available MCP tools — first attempts to fetch from the live
 * server, falls back to the hardcoded KNOWN_MCP_TOOLS list.
 */
export declare function listMcpTools(): Promise<McpTool[]>;
/**
 * Calls a tool on the MCP server.
 *
 * The Casper MCP server follows MCP protocol: POST /tools/call
 * with body { name, arguments }.
 *
 * @param toolName  - Name of the MCP tool to invoke
 * @param params    - Tool parameters matching the tool's inputSchema
 */
export declare function callMcpTool<T = unknown>(toolName: string, params?: Record<string, unknown>): Promise<McpCallResult<T>>;
/**
 * Performs a simple connectivity check against the MCP server.
 * Returns true if the server is reachable.
 */
export declare function testMcpConnectivity(): Promise<boolean>;
//# sourceMappingURL=mcp.d.ts.map