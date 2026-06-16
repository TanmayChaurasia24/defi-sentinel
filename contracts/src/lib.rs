#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32-unknown-unknown'");

extern crate alloc;

use alloc::{string::{String, ToString}, vec};
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    contracts::{EntryPoint, EntryPointAccess, EntryPointType, EntryPoints, NamedKeys},
    CLType, CLValue, Parameter, PublicKey,
};

#[cfg(not(target_arch = "wasm32"))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// ─────────────────────────────────────────────────────────────────────────────
// Contract Entry Points
// ─────────────────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn update_risk_score() {
    let wallet: PublicKey = runtime::get_named_arg("wallet");
    let score: u8 = runtime::get_named_arg("score");

    let key_name = alloc::format!("risk_score_{}", wallet.to_string());
    
    let uref = storage::new_uref(score);
    runtime::put_key(&key_name, uref.into());
}

#[no_mangle]
pub extern "C" fn log_rebalance() {
    let wallet: PublicKey = runtime::get_named_arg("wallet");
    let deploy_hash: String = runtime::get_named_arg("deploy_hash");
    let score: u8 = runtime::get_named_arg("score");

    let key_name = alloc::format!("rebalance_{}_{}", wallet.to_string(), score);
    
    let uref = storage::new_uref(deploy_hash);
    runtime::put_key(&key_name, uref.into());
}

#[no_mangle]
pub extern "C" fn log_action() {
    let wallet: PublicKey = runtime::get_named_arg("wallet");
    let action_type: String = runtime::get_named_arg("action_type");
    let score: u8 = runtime::get_named_arg("score");

    let key_name = alloc::format!("action_{}_{}", wallet.to_string(), score);
    
    let uref = storage::new_uref(action_type);
    runtime::put_key(&key_name, uref.into());
}

// ─────────────────────────────────────────────────────────────────────────────
// Installation Entry Point
// ─────────────────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn call() {
    let mut entry_points = EntryPoints::new();

    entry_points.add_entry_point(EntryPoint::new(
        "update_risk_score",
        vec![
            Parameter::new("wallet", CLType::PublicKey),
            Parameter::new("score", CLType::U8),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Contract,
    ));

    entry_points.add_entry_point(EntryPoint::new(
        "log_rebalance",
        vec![
            Parameter::new("wallet", CLType::PublicKey),
            Parameter::new("deploy_hash", CLType::String),
            Parameter::new("score", CLType::U8),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Contract,
    ));

    entry_points.add_entry_point(EntryPoint::new(
        "log_action",
        vec![
            Parameter::new("wallet", CLType::PublicKey),
            Parameter::new("action_type", CLType::String),
            Parameter::new("score", CLType::U8),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Contract,
    ));

    let named_keys = NamedKeys::new();

    let (contract_hash, _contract_version) = storage::new_contract(
        entry_points,
        Some(named_keys),
        Some("sentinel_contract_package_hash".to_string()),
        Some("sentinel_contract_access_uref".to_string()),
    );

    runtime::put_key("sentinel_contract_hash", contract_hash.into());
}


