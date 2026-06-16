"use strict";
/**
 * server.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express API server for DeFi Sentinel dashboard.
 *
 * Serves in-memory agent state to the Next.js dashboard frontend.
 * The dashboard polls these endpoints every 10 seconds for live data.
 *
 * Routes:
 *   GET  /api/status   — full DashboardState
 *   GET  /api/history  — action history (supports ?limit=N)
 *   GET  /api/risk     — current risk + historical scores
 *   GET  /api/x402     — x402 payment stats
 *   POST /api/pause    — pause the polling loop
 *   POST /api/resume   — resume the polling loop
 * ─────────────────────────────────────────────────────────────────────────────
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialDashboardState = getInitialDashboardState;
exports.updateDashboardState = updateDashboardState;
exports.addActionEntry = addActionEntry;
exports.isPaused = isPaused;
exports.setAgentStatus = setAgentStatus;
exports.startApiServer = startApiServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const utils_1 = require("./utils");
// ─────────────────────────────────────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────────────────────────────────────
const MAX_ACTIONS = 50;
const MAX_RISK_HISTORY = 20;
let dashboardState = getInitialDashboardState();
const riskHistory = [];
let paused = false;
function getInitialDashboardState() {
    return {
        lastUpdated: new Date().toISOString(),
        walletAddress: process.env.WATCHED_WALLET ?? '',
        walletData: null,
        riskResult: null,
        lastDecision: null,
        x402Status: {
            totalCalls: 0,
            totalSpentCSPR: '0.000000',
            lastPayment: null,
            averageCostPerCall: '0.000000',
        },
        recentActions: [],
        agentStatus: 'running',
        totalCyclesRun: 0,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// State mutation functions (called from index.ts)
// ─────────────────────────────────────────────────────────────────────────────
function updateDashboardState(update) {
    dashboardState.lastUpdated = new Date().toISOString();
    if (update.walletData)
        dashboardState.walletData = update.walletData;
    if (update.riskResult) {
        dashboardState.riskResult = update.riskResult;
        // Add to risk history
        riskHistory.push({
            score: update.riskResult.score,
            level: update.riskResult.level,
            timestamp: new Date().toISOString(),
        });
        if (riskHistory.length > MAX_RISK_HISTORY) {
            riskHistory.shift();
        }
    }
    if (update.decision)
        dashboardState.lastDecision = update.decision;
    if (update.x402Status)
        dashboardState.x402Status = update.x402Status;
    if (update.cycleCount !== undefined)
        dashboardState.totalCyclesRun = update.cycleCount;
}
function addActionEntry(entry) {
    const fullEntry = {
        id: (0, utils_1.generateId)(),
        ...entry,
    };
    dashboardState.recentActions.unshift(fullEntry);
    if (dashboardState.recentActions.length > MAX_ACTIONS) {
        dashboardState.recentActions.pop();
    }
}
function isPaused() {
    return paused;
}
function setAgentStatus(status) {
    dashboardState.agentStatus = status;
}
// ─────────────────────────────────────────────────────────────────────────────
// Express server
// ─────────────────────────────────────────────────────────────────────────────
function startApiServer(port) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    // ── GET /api/status ────────────────────────────────────────────────────────
    app.get('/api/status', (_req, res) => {
        res.json(dashboardState);
    });
    // ── GET /api/history ───────────────────────────────────────────────────────
    app.get('/api/history', (req, res) => {
        const limit = parseInt(req.query.limit) || 20;
        const clamped = Math.min(Math.max(limit, 1), MAX_ACTIONS);
        res.json(dashboardState.recentActions.slice(0, clamped));
    });
    // ── GET /api/risk ──────────────────────────────────────────────────────────
    app.get('/api/risk', (_req, res) => {
        res.json({
            current: dashboardState.riskResult,
            history: riskHistory,
        });
    });
    // ── GET /api/x402 ──────────────────────────────────────────────────────────
    app.get('/api/x402', (_req, res) => {
        res.json(dashboardState.x402Status);
    });
    // ── POST /api/pause ────────────────────────────────────────────────────────
    app.post('/api/pause', (_req, res) => {
        paused = true;
        dashboardState.agentStatus = 'paused';
        console.log('[server] ⏸️  Agent paused via API');
        res.json({ status: 'paused' });
    });
    // ── POST /api/resume ───────────────────────────────────────────────────────
    app.post('/api/resume', (_req, res) => {
        paused = false;
        dashboardState.agentStatus = 'running';
        console.log('[server] ▶️  Agent resumed via API');
        res.json({ status: 'running' });
    });
    // ── Start server ───────────────────────────────────────────────────────────
    app.listen(port, () => {
        console.log(`[server] 🌐 Dashboard API running on http://localhost:${port}`);
    });
}
//# sourceMappingURL=server.js.map