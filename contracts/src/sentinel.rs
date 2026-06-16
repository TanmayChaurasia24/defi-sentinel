//! # Sentinel Contract
//!
//! On-chain audit trail for DeFi Sentinel — stores per-wallet risk scores
//! and a chronological log of every agent action (rebalance / alert / hold).
//!
//! Written with Odra 2.1.0 for deployment on the Casper Testnet.

use odra::prelude::*;

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

/// Emitted every time the agent updates a wallet's risk score.
#[odra::event]
pub struct RiskScoreUpdated {
    pub wallet: Address,
    pub score: u8,
    pub timestamp: u64,
}

/// Emitted when the agent logs any action (rebalance / alert / hold).
#[odra::event]
pub struct ActionLogged {
    pub wallet: Address,
    pub action_type: String,
    pub score: u8,
    pub timestamp: u64,
}

/// Emitted specifically when a rebalance deploy is broadcast.
#[odra::event]
pub struct RebalanceExecuted {
    pub wallet: Address,
    pub deploy_hash: String,
    pub score: u8,
    pub timestamp: u64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract Storage
// ─────────────────────────────────────────────────────────────────────────────

/// DeFi Sentinel on-chain record keeper.
///
/// Storage layout:
/// - `owner`           — contract deployer; used for access control
/// - `risk_scores`     — latest risk score (0–100) per monitored wallet
/// - `last_action_time`— unix timestamp of the most recent agent action
/// - `last_action_type`— "rebalance" | "alert" | "hold"
/// - `action_count`    — total actions ever taken (all wallets combined)
/// - `deploy_hashes`   — last rebalance deploy hash per wallet
#[odra::module]
pub struct SentinelContract {
    owner: Var<Address>,
    risk_scores: Mapping<Address, u8>,
    last_action_time: Mapping<Address, u64>,
    last_action_type: Mapping<Address, String>,
    action_count: Var<u32>,
    deploy_hashes: Mapping<Address, String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Points
// ─────────────────────────────────────────────────────────────────────────────

#[odra::module]
impl SentinelContract {
    // ── Constructor ──────────────────────────────────────────────────────────

    /// Initialises the contract and records the deployer as owner.
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
        self.action_count.set(0u32);
    }

    // ── Write entry points ───────────────────────────────────────────────────

    /// Updates the cached risk score for a monitored wallet.
    ///
    /// Called by the AI agent each polling cycle when the score changes
    /// by more than the configured delta threshold.
    ///
    /// # Arguments
    /// * `wallet` - the Casper account address being monitored
    /// * `score`  - the new risk score in [0, 100]
    pub fn update_risk_score(&mut self, wallet: Address, score: u8) {
        self.assert_owner();
        // Clamp score defensively — should never exceed 100
        let clamped = score.min(100);
        self.risk_scores.set(&wallet, clamped);

        let now = self.env().get_block_time();
        self.last_action_time.set(&wallet, now);

        self.env().emit_event(RiskScoreUpdated {
            wallet,
            score: clamped,
            timestamp: now,
        });
    }

    /// Records a rebalance action and stores the resulting deploy hash.
    ///
    /// Called after the CSPR.click skill broadcasts a rebalance transaction.
    ///
    /// # Arguments
    /// * `wallet`      - the wallet that was rebalanced
    /// * `deploy_hash` - hex-encoded Casper deploy hash
    /// * `score`       - the risk score that triggered the rebalance
    pub fn log_rebalance(&mut self, wallet: Address, deploy_hash: String, score: u8) {
        self.assert_owner();

        let clamped = score.min(100);
        let now = self.env().get_block_time();

        self.risk_scores.set(&wallet, clamped);
        self.deploy_hashes.set(&wallet, deploy_hash.clone());
        self.last_action_time.set(&wallet, now);
        self.last_action_type.set(&wallet, String::from("rebalance"));

        let current_count = self.action_count.get_or_default();
        self.action_count.set(current_count + 1);

        // Clone wallet before the first emit_event because struct fields are
        // moved into the event struct. Address implements Clone in Odra 2.x.
        let wallet_for_action = wallet.clone();
        self.env().emit_event(RebalanceExecuted {
            wallet,
            deploy_hash,
            score: clamped,
            timestamp: now,
        });
        self.env().emit_event(ActionLogged {
            wallet: wallet_for_action,
            action_type: String::from("rebalance"),
            score: clamped,
            timestamp: now,
        });
    }

    /// Records an alert or hold action taken by the AI agent.
    ///
    /// # Arguments
    /// * `wallet`      - the monitored wallet address
    /// * `action_type` - one of "alert" | "hold"
    /// * `score`       - the risk score at time of action
    pub fn log_action(&mut self, wallet: Address, action_type: String, score: u8) {
        self.assert_owner();

        let clamped = score.min(100);
        let now = self.env().get_block_time();

        self.risk_scores.set(&wallet, clamped);
        self.last_action_time.set(&wallet, now);
        self.last_action_type.set(&wallet, action_type.clone());

        let current_count = self.action_count.get_or_default();
        self.action_count.set(current_count + 1);

        self.env().emit_event(ActionLogged {
            wallet,
            action_type,
            score: clamped,
            timestamp: now,
        });
    }

    // ── Read entry points ────────────────────────────────────────────────────

    /// Returns the latest cached risk score for a wallet (0 if never set).
    pub fn get_risk_score(&self, wallet: Address) -> u8 {
        self.risk_scores.get_or_default(&wallet)
    }

    /// Returns the total number of agent actions ever logged.
    pub fn get_action_count(&self) -> u32 {
        self.action_count.get_or_default()
    }

    /// Returns (action_type, timestamp) of the last agent action for a wallet.
    /// Returns ("none", 0) if no action has ever been logged.
    pub fn get_last_action(&self, wallet: Address) -> (String, u64) {
        let action_type = self
            .last_action_type
            .get(&wallet)
            .unwrap_or_else(|| String::from("none"));
        let timestamp = self.last_action_time.get_or_default(&wallet);
        (action_type, timestamp)
    }

    /// Returns the last rebalance deploy hash for a wallet, or empty string.
    pub fn get_deploy_hash(&self, wallet: Address) -> String {
        self.deploy_hashes
            .get(&wallet)
            .unwrap_or_else(|| String::from(""))
    }

    /// Returns the contract owner's address.
    pub fn get_owner(&self) -> Address {
        self.owner.get_or_revert_with(ExecutionError::UnwrapError)
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    /// Reverts the execution if the caller is not the contract owner.
    fn assert_owner(&self) {
        let caller = self.env().caller();
        let owner = self.owner.get_or_revert_with(ExecutionError::UnwrapError);
        if caller != owner {
            self.env().revert(SentinelError::Unauthorized)
        }
    }
}

#[odra::odra_error]
pub enum SentinelError {
    Unauthorized = 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv, HostRef, NoArgs};

    /// Helper — deploy a fresh contract and return (env, deployed_ref).
    fn deploy() -> (HostEnv, SentinelContractHostRef) {
        let env = odra_test::env();
        let contract = SentinelContractHostRef::deploy(&env, NoArgs);
        (env, contract)
    }

    // ── Test 1: initial state is all-zero / defaults ──────────────────────

    #[test]
    fn test_initial_state() {
        let (env, contract) = deploy();

        // There is no "dummy" address constant in Odra 2.x test env, so we
        // use the deployer's own address as the monitored wallet.
        let deployer = env.get_account(0);

        assert_eq!(contract.get_risk_score(deployer), 0u8);
        assert_eq!(contract.get_action_count(), 0u32);

        let (action_type, timestamp) = contract.get_last_action(deployer);
        assert_eq!(action_type, "none");
        assert_eq!(timestamp, 0u64);

        assert_eq!(contract.get_deploy_hash(deployer), "");
    }

    // ── Test 2: update_risk_score stores value and emits event ───────────

    #[test]
    fn test_update_risk_score() {
        let (env, mut contract) = deploy();
        let wallet = env.get_account(0);

        // Score is within valid range
        contract.update_risk_score(wallet, 42u8);
        assert_eq!(contract.get_risk_score(wallet), 42u8);

        // Score above 100 is clamped
        contract.update_risk_score(wallet, 200u8);
        assert_eq!(contract.get_risk_score(wallet), 100u8);
    }

    // ── Test 3: log_action increments action_count ────────────────────────

    #[test]
    fn test_log_action_increments_count() {
        let (env, mut contract) = deploy();
        let wallet = env.get_account(0);

        assert_eq!(contract.get_action_count(), 0u32);

        contract.log_action(wallet, String::from("hold"), 20u8);
        assert_eq!(contract.get_action_count(), 1u32);

        contract.log_action(wallet, String::from("alert"), 55u8);
        assert_eq!(contract.get_action_count(), 2u32);

        let (action_type, _) = contract.get_last_action(wallet);
        assert_eq!(action_type, "alert");
        assert_eq!(contract.get_risk_score(wallet), 55u8);
    }

    // ── Test 4: log_rebalance stores deploy hash ──────────────────────────

    #[test]
    fn test_log_rebalance_stores_hash() {
        let (env, mut contract) = deploy();
        let wallet = env.get_account(0);

        let hash = String::from("abc123deadbeef");
        contract.log_rebalance(wallet, hash.clone(), 80u8);

        assert_eq!(contract.get_deploy_hash(wallet), hash);
        assert_eq!(contract.get_risk_score(wallet), 80u8);
        assert_eq!(contract.get_action_count(), 1u32);

        let (action_type, _) = contract.get_last_action(wallet);
        assert_eq!(action_type, "rebalance");
    }

    // ── Test 5: full agent lifecycle ──────────────────────────────────────

    #[test]
    fn test_full_agent_lifecycle() {
        let (env, mut contract) = deploy();
        let wallet = env.get_account(0);

        // Cycle 1: safe zone
        contract.update_risk_score(wallet, 15u8);
        contract.log_action(wallet, String::from("hold"), 15u8);
        assert_eq!(contract.get_action_count(), 1u32);

        // Cycle 2: warning
        contract.update_risk_score(wallet, 55u8);
        contract.log_action(wallet, String::from("alert"), 55u8);
        assert_eq!(contract.get_action_count(), 2u32);

        // Cycle 3: danger — triggers rebalance
        contract.update_risk_score(wallet, 82u8);
        contract.log_rebalance(
            wallet,
            String::from("deadbeef1234567890abcdef"),
            82u8,
        );
        assert_eq!(contract.get_action_count(), 3u32);

        let (action_type, _) = contract.get_last_action(wallet);
        assert_eq!(action_type, "rebalance");
        assert_eq!(
            contract.get_deploy_hash(wallet),
            "deadbeef1234567890abcdef"
        );
    }
}
