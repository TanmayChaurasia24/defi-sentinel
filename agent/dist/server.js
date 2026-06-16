"use strict";
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
const client_1 = require("@prisma/client");
const utils_1 = require("./utils");
// ─────────────────────────────────────────────────────────────────────────────
// In-memory state (Multi-Tenant)
// ─────────────────────────────────────────────────────────────────────────────
const MAX_ACTIONS = 50;
const MAX_RISK_HISTORY = 20;
// State is now keyed by wallet address
const states = {};
const riskHistories = {};
let paused = false;
const prisma = new client_1.PrismaClient();
function getInitialDashboardState(walletAddress) {
    return {
        lastUpdated: new Date().toISOString(),
        walletAddress,
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
function ensureState(walletAddress) {
    if (!states[walletAddress]) {
        states[walletAddress] = getInitialDashboardState(walletAddress);
    }
    if (!riskHistories[walletAddress]) {
        riskHistories[walletAddress] = [];
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// State mutation functions (called from index.ts)
// ─────────────────────────────────────────────────────────────────────────────
function updateDashboardState(walletAddress, update) {
    ensureState(walletAddress);
    const state = states[walletAddress];
    const history = riskHistories[walletAddress];
    state.lastUpdated = new Date().toISOString();
    if (update.walletData)
        state.walletData = update.walletData;
    if (update.riskResult) {
        state.riskResult = update.riskResult;
        // Add to risk history
        history.push({
            score: update.riskResult.score,
            level: update.riskResult.level,
            timestamp: new Date().toISOString(),
        });
        if (history.length > MAX_RISK_HISTORY) {
            history.shift();
        }
    }
    if (update.decision)
        state.lastDecision = update.decision;
    if (update.x402Status)
        state.x402Status = update.x402Status;
    if (update.cycleCount !== undefined)
        state.totalCyclesRun = update.cycleCount;
}
function addActionEntry(walletAddress, entry) {
    ensureState(walletAddress);
    const state = states[walletAddress];
    const fullEntry = {
        id: (0, utils_1.generateId)(),
        ...entry,
    };
    state.recentActions.unshift(fullEntry);
    if (state.recentActions.length > MAX_ACTIONS) {
        state.recentActions.pop();
    }
}
function isPaused() {
    return paused;
}
function setAgentStatus(walletAddress, status) {
    ensureState(walletAddress);
    states[walletAddress].agentStatus = status;
}
// ─────────────────────────────────────────────────────────────────────────────
// Express server
// ─────────────────────────────────────────────────────────────────────────────
function startApiServer(port) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    // ── POST /api/register ─────────────────────────────────────────────────────
    app.post('/api/register', async (req, res) => {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            return res.status(400).json({ error: 'walletAddress is required' });
        }
        try {
            const existing = await prisma.userWallet.findUnique({
                where: { address: walletAddress },
            });
            if (!existing) {
                await prisma.userWallet.create({
                    data: { address: walletAddress },
                });
                console.log(`[server] Registered new wallet: ${walletAddress}`);
            }
            ensureState(walletAddress);
            res.json({ success: true, walletAddress });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    });
    // Helper to extract wallet from query
    const getWallet = (req, res) => {
        const walletAddress = req.query.wallet;
        if (!walletAddress) {
            res.status(400).json({ error: 'wallet query parameter is required' });
            return null;
        }
        ensureState(walletAddress);
        return walletAddress;
    };
    // ── GET /api/status ────────────────────────────────────────────────────────
    app.get('/api/status', (req, res) => {
        const wallet = getWallet(req, res);
        if (!wallet)
            return;
        res.json(states[wallet]);
    });
    // ── GET /api/history ───────────────────────────────────────────────────────
    app.get('/api/history', (req, res) => {
        const wallet = getWallet(req, res);
        if (!wallet)
            return;
        const limit = parseInt(req.query.limit) || 20;
        const clamped = Math.min(Math.max(limit, 1), MAX_ACTIONS);
        res.json(states[wallet].recentActions.slice(0, clamped));
    });
    // ── GET /api/risk ──────────────────────────────────────────────────────────
    app.get('/api/risk', (req, res) => {
        const wallet = getWallet(req, res);
        if (!wallet)
            return;
        res.json({
            current: states[wallet].riskResult,
            history: riskHistories[wallet],
        });
    });
    // ── GET /api/x402 ──────────────────────────────────────────────────────────
    app.get('/api/x402', (req, res) => {
        const wallet = getWallet(req, res);
        if (!wallet)
            return;
        res.json(states[wallet].x402Status);
    });
    // ── POST /api/pause ────────────────────────────────────────────────────────
    app.post('/api/pause', (_req, res) => {
        paused = true;
        for (const s of Object.values(states)) {
            s.agentStatus = 'paused';
        }
        console.log('[server] ⏸️  Agent paused via API');
        res.json({ status: 'paused' });
    });
    // ── POST /api/resume ───────────────────────────────────────────────────────
    app.post('/api/resume', (_req, res) => {
        paused = false;
        for (const s of Object.values(states)) {
            s.agentStatus = 'running';
        }
        console.log('[server] ▶️  Agent resumed via API');
        res.json({ status: 'running' });
    });
    // ── Start server ───────────────────────────────────────────────────────────
    app.listen(port, () => {
        console.log(`[server] 🌐 Dashboard API running on http://localhost:${port}`);
    });
}
//# sourceMappingURL=server.js.map