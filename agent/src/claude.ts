/**
 * claude.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI agent decision engine for DeFi Sentinel.
 *
 * Uses the official OpenRouter SDK to access free AI models
 * and make autonomous decisions: rebalance / alert / hold.
 *
 * Supports multi-turn tool use — the model can call MCP tools to gather
 * additional on-chain data before making a decision.
 *
 * Graceful fallback: if OPENROUTER_API_KEY is unset, falls back to
 * deterministic risk-engine-based decisions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { OpenRouter } from '@openrouter/sdk';
import type { RiskResult } from './risk';
import type { WalletData, DelegationInfo, Deploy } from './casper';
import { callMcpTool } from './mcp';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentDecision {
  action: 'rebalance' | 'alert' | 'hold';
  reasoning: string;
  confidence: number;       // 0–100
  urgency: 'low' | 'medium' | 'high';
  suggestedAmount?: string;  // CSPR amount (only when action = rebalance)
  warnings: string[];
  timestamp: string;         // ISO date
}

export interface AgentContext {
  walletAddress: string;
  walletData: WalletData;
  delegationInfo: DelegationInfo;
  riskResult: RiskResult;
  csprPrice: number;
  priceChange24h: number;
  recentDeploys: Deploy[];
  previousDecision?: AgentDecision;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter config
// ─────────────────────────────────────────────────────────────────────────────

// Default free model — can be overridden via OPENROUTER_MODEL env var
function getModel(): string {
  return process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free';
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are DeFi Sentinel, an autonomous risk management AI agent operating on the Casper Network blockchain. Your mission is to protect DeFi wallets from liquidation and loss by monitoring positions and acting decisively.

You have access to real-time wallet data, delegation info, and price feeds via your MCP tools. You must analyze the provided risk data and make ONE of three decisions:

- REBALANCE: Risk is critical (score >= 70). Immediately move funds to reduce exposure.
  Specify exactly how much CSPR to rebalance and why.
- ALERT: Risk is elevated (score 40-69). Warn the user. No transaction yet.
  Explain what could go wrong and what threshold would trigger rebalance.
- HOLD: Risk is acceptable (score < 40). No action needed.
  Briefly confirm the position looks healthy.

Rules you must follow:
1. Always explain your reasoning in plain English before stating your decision
2. Be specific — cite actual numbers from the data (e.g. "staking ratio of 82%")
3. Never rebalance more than 30% of liquid balance in one transaction
4. If price dropped > 15% in 24h AND staking ratio > 75%, always recommend rebalance
5. Your response must always end with a JSON block containing the structured decision

Response format:
[Natural language analysis paragraph]
[Risk factors breakdown]
[Decision rationale]
\`\`\`json
{
  "action": "rebalance|alert|hold",
  "confidence": 0-100,
  "urgency": "low|medium|high",
  "suggestedAmount": "50",
  "warnings": ["warning 1", "warning 2"],
  "reasoning": "one sentence summary"
}
\`\`\``;

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool definitions (OpenAI function-calling format for OpenRouter)
// ─────────────────────────────────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_wallet_balance',
      description: 'Get the current CSPR balance and delegation info for a wallet address',
      parameters: {
        type: 'object',
        properties: {
          wallet_address: { type: 'string', description: 'The Casper wallet address' },
        },
        required: ['wallet_address'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_cspr_price',
      description: 'Get the current CSPR price in USD and 24h price change percentage',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_recent_transactions',
      description: 'Get the last N transactions for a wallet to assess recent activity',
      parameters: {
        type: 'object',
        properties: {
          wallet_address: { type: 'string', description: 'The Casper wallet address' },
          limit: { type: 'number', description: 'Number of transactions to fetch (max 20)' },
        },
        required: ['wallet_address'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_validator_status',
      description: "Check if the wallet's staking validator is active and performing well",
      parameters: {
        type: 'object',
        properties: {
          validator_key: { type: 'string', description: 'The validator public key' },
        },
        required: ['validator_key'],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool execution handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute an MCP tool call and return the result as a string.
 *
 * Routes get_wallet_balance and get_cspr_price through the Casper MCP server
 * first. Falls back to local context data if MCP is unreachable.
 */
async function executeMcpTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: AgentContext
): Promise<string> {
  switch (toolName) {
    case 'get_wallet_balance': {
      // Try real MCP server first
      const walletAddr = (toolInput.wallet_address as string) || context.walletAddress;
      const mcpResult = await callMcpTool('get_account_balance', {
        account_identifier: walletAddr,
      });
      if (mcpResult.success && mcpResult.data) {
        console.log('[agent] 🔌 get_wallet_balance served via MCP server');
        return JSON.stringify(mcpResult.data);
      }

      // Fallback to local context
      console.log('[agent] ⚠️  MCP unavailable for get_wallet_balance — using local context');
      return JSON.stringify({
        address: context.walletData.address,
        liquid_balance_cspr: context.walletData.balance,
        staked_balance_cspr: context.delegationInfo.totalStaked,
        staking_ratio: context.delegationInfo.stakingRatio,
        total_delegated: context.walletData.totalDelegated,
        transfer_count: context.walletData.transferCount,
        last_activity: context.walletData.lastActivity,
        source: 'local_context',
      });
    }

    case 'get_cspr_price': {
      // Try real MCP server first
      const mcpResult = await callMcpTool('get_network_status', {});
      if (mcpResult.success && mcpResult.data) {
        console.log('[agent] 🔌 get_cspr_price served via MCP server');
        return JSON.stringify({
          ...(mcpResult.data as Record<string, unknown>),
          price_usd: context.csprPrice,
          change_24h_percent: context.priceChange24h,
        });
      }

      // Fallback to local context
      console.log('[agent] ⚠️  MCP unavailable for get_cspr_price — using local context');
      return JSON.stringify({
        price_usd: context.csprPrice,
        change_24h_percent: context.priceChange24h,
        source: 'local_context',
      });
    }

    case 'get_recent_transactions': {
      const limit = (toolInput.limit as number) || 10;
      const deploys = context.recentDeploys.slice(0, Math.min(limit, 20));
      return JSON.stringify({ transactions: deploys, count: deploys.length });
    }

    case 'get_validator_status': {
      const validatorKey = toolInput.validator_key as string;
      const mcpResult = await callMcpTool('get_validators', {});
      if (mcpResult.success && mcpResult.data) {
        return JSON.stringify(mcpResult.data);
      }
      const match = context.delegationInfo.validators.find(
        (v) => v.validatorKey === validatorKey
      );
      return JSON.stringify({
        validator_key: validatorKey,
        found_in_delegations: !!match,
        staked_amount: match?.stakedAmount ?? '0',
        status: 'unknown (MCP server not available)',
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message type used for tracking conversation turns
// ─────────────────────────────────────────────────────────────────────────────

type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; content: string; toolCallId: string };

// ─────────────────────────────────────────────────────────────────────────────
// Multi-turn agent loop using the OpenRouter SDK
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 5;

/**
 * Run the agentic loop — handles multi-turn tool use via the OpenRouter SDK.
 * Returns the final text response from the model.
 */
async function agentLoop(
  client: OpenRouter,
  messages: Message[],
  context: AgentContext
): Promise<string> {
  let finalText = '';

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.chat.send({
      chatRequest: {
        model: getModel(),
        messages: messages as Parameters<typeof client.chat.send>[0]['chatRequest']['messages'],
        tools: MCP_TOOLS,
        maxTokens: 1000,
      },
      httpReferer: 'https://defi-sentinel.casper.network',
      appTitle: 'DeFi Sentinel Agent',
    });

    // The SDK returns a ChatResult with choices[]
    const result = response as { choices: Array<{ message: { content?: string | null; toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }; finishReason: string | null }> };
    const choice = result.choices?.[0];

    if (!choice) {
      finalText = '[No response from model]';
      break;
    }

    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.toolCalls;

    // If no tool calls — we're done
    if (!toolCalls || toolCalls.length === 0) {
      finalText = (typeof assistantMessage.content === 'string' ? assistantMessage.content : '') || '';
      break;
    }

    // Add the assistant message (with tool_calls) to the conversation
    messages.push({
      role: 'assistant',
      content: typeof assistantMessage.content === 'string' ? assistantMessage.content : null,
      toolCalls,
    });

    // Execute each tool call and append tool results
    for (const toolCall of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch { /* empty args */ }

      const toolResult = await executeMcpTool(
        toolCall.function.name,
        args,
        context
      );

      messages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: toolResult,
      });
    }

    // If this was the last iteration, capture any text we got
    if (iteration === MAX_TOOL_ITERATIONS - 1) {
      finalText = (typeof assistantMessage.content === 'string' ? assistantMessage.content : '') ||
        '[Agent reached max tool iterations without a final response]';
    }
  }

  return finalText;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract and parse the JSON decision block from the model's response.
 * Handles ```json ... ``` fenced blocks and bare JSON objects.
 */
function parseDecisionJson(text: string): Partial<AgentDecision> | null {
  // Try fenced code block first
  const fencedMatch = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1]) as Partial<AgentDecision>;
    } catch { /* fall through */ }
  }

  // Try finding a bare JSON object at the end of the text
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace !== -1) {
    let depth = 0;
    for (let i = lastBrace; i >= 0; i--) {
      if (text[i] === '}') depth++;
      if (text[i] === '{') depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(i, lastBrace + 1)) as Partial<AgentDecision>;
        } catch { break; }
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fallback (used when OPENROUTER_API_KEY is not set)
// ─────────────────────────────────────────────────────────────────────────────

function deterministicDecision(context: AgentContext): AgentDecision {
  const { riskResult, delegationInfo, csprPrice } = context;
  const warnings: string[] = riskResult.factors.map((f) => f.description);

  let urgency: 'low' | 'medium' | 'high' = 'low';
  if (riskResult.level === 'warning') urgency = 'medium';
  if (riskResult.level === 'danger') urgency = 'high';

  const confidence = riskResult.level === 'safe' ? 90 : riskResult.level === 'warning' ? 70 : 85;

  const decision: AgentDecision = {
    action: riskResult.recommendation,
    reasoning: `[Deterministic] Risk score ${riskResult.score}/100 (${riskResult.level}). ` +
      `Staking ratio: ${(delegationInfo.stakingRatio * 100).toFixed(1)}%. ` +
      `CSPR price: $${csprPrice.toFixed(4)}. ` +
      `Recommendation: ${riskResult.recommendation}.`,
    confidence,
    urgency,
    warnings,
    timestamp: new Date().toISOString(),
  };

  if (riskResult.recommendation === 'rebalance') {
    const liquid = parseFloat(context.walletData.balance);
    const maxRebalance = parseInt(process.env.REBALANCE_AMOUNT_CSPR ?? '50', 10);
    const suggested = Math.min(Math.floor(liquid * 0.3), maxRebalance);
    decision.suggestedAmount = String(Math.max(suggested, 1));
  }

  return decision;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask the AI agent what action to take given the current risk state.
 *
 * If OPENROUTER_API_KEY is set: calls OpenRouter with free AI models.
 * If not: falls back to deterministic risk-engine-based decision.
 */
export async function runAgentDecision(context: AgentContext): Promise<AgentDecision> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  // ── Fallback: no API key → deterministic mode ───────────────────────────
  if (!apiKey || apiKey === 'your_openrouter_key_here') {
    console.log('[agent] ⚠️  OPENROUTER_API_KEY not set — using deterministic fallback');
    return deterministicDecision(context);
  }

  // ── Build user message with full context ─────────────────────────────────
  const userMessage = buildUserMessage(context);

  try {
    const client = new OpenRouter({ apiKey });

    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    // ── Run agent loop (handles multi-turn tool use) ─────────────────────
    const responseText = await agentLoop(client, messages, context);

    // ── Parse decision JSON from response ────────────────────────────────
    const parsed = parseDecisionJson(responseText);

    if (!parsed || !parsed.action) {
      console.warn('[agent] ⚠️  Could not parse decision JSON from model response. Using safe default.');
      return {
        action: 'hold',
        reasoning: `[Parse error] Model responded but JSON decision block could not be extracted. Raw response length: ${responseText.length} chars. Defaulting to hold for safety.`,
        confidence: 0,
        urgency: 'low',
        warnings: ['Failed to parse model decision JSON — defaulting to hold'],
        timestamp: new Date().toISOString(),
      };
    }

    // ── Build validated AgentDecision ─────────────────────────────────────
    const validActions = ['rebalance', 'alert', 'hold'] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const action = validActions.includes(parsed.action as any)
      ? (parsed.action as AgentDecision['action'])
      : 'hold';

    const validUrgencies = ['low', 'medium', 'high'] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const urgency = validUrgencies.includes(parsed.urgency as any)
      ? (parsed.urgency as AgentDecision['urgency'])
      : 'low';

    return {
      action,
      reasoning: parsed.reasoning ?? responseText.slice(0, 500),
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
      urgency,
      suggestedAmount: parsed.suggestedAmount,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      timestamp: new Date().toISOString(),
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent] ❌ OpenRouter API error: ${msg}`);

    // Fall back to deterministic decision on any API error
    const fallback = deterministicDecision(context);
    fallback.warnings.push(`OpenRouter API error: ${msg} — fell back to deterministic mode`);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// User message builder
// ─────────────────────────────────────────────────────────────────────────────

function buildUserMessage(context: AgentContext): string {
  const { walletData, delegationInfo, riskResult, csprPrice, priceChange24h, recentDeploys, previousDecision } = context;

  let msg = `## Current Wallet State

**Wallet:** ${context.walletAddress}
**Liquid Balance:** ${walletData.balance} CSPR ($${(parseFloat(walletData.balance) * csprPrice).toFixed(2)} USD)
**Staked Balance:** ${delegationInfo.totalStaked} CSPR ($${(parseFloat(delegationInfo.totalStaked) * csprPrice).toFixed(2)} USD)
**Staking Ratio:** ${(delegationInfo.stakingRatio * 100).toFixed(1)}%
**Validators:** ${delegationInfo.validators.length} active delegation(s)
**Transfer Count:** ${walletData.transferCount}
**Last Activity:** ${walletData.lastActivity}

## Market Data

**CSPR Price:** $${csprPrice.toFixed(4)} USD
**24h Price Change:** ${priceChange24h.toFixed(2)}%

## Risk Assessment (Formula-Based)

**Risk Score:** ${riskResult.score}/100
**Level:** ${riskResult.level.toUpperCase()}
**Recommendation:** ${riskResult.recommendation}
**Computed At:** ${riskResult.computedAt}

### Risk Factors:
${riskResult.factors.length > 0
    ? riskResult.factors.map((f) => `- **${f.name}** (+${f.contribution} pts): ${f.description}`).join('\n')
    : '- No active risk factors'}

## Recent Transactions (last ${recentDeploys.length})
${recentDeploys.length > 0
    ? recentDeploys.slice(0, 5).map((d) =>
      `- ${d.timestamp} | ${d.status} | cost: ${d.cost} CSPR | hash: ${d.deployHash.slice(0, 16)}...`
    ).join('\n')
    : '- No recent transactions'}`;

  if (previousDecision) {
    msg += `\n\n## Previous Decision
**Action:** ${previousDecision.action}
**Reasoning:** ${previousDecision.reasoning}
**Confidence:** ${previousDecision.confidence}%
**Decided At:** ${previousDecision.timestamp}`;
  }

  msg += `\n\nBased on the above data, analyze the wallet's risk position and provide your decision. Include a JSON block at the end of your response.`;

  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward compatibility export (used by index.ts during transition)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use runAgentDecision() instead. Kept for backward compatibility.
 */
export async function getAgentDecision(
  riskResult: RiskResult,
  walletData: WalletData,
  delegationInfo: DelegationInfo
): Promise<AgentDecision> {
  return runAgentDecision({
    walletAddress: walletData.address,
    walletData,
    delegationInfo,
    riskResult,
    csprPrice: 0,
    priceChange24h: 0,
    recentDeploys: [],
  });
}
