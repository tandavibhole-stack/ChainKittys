#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, Env, Vec,
};

fn setup_env<'a>(env: &'a Env) -> (Address, Address, ChainKittyContractClient<'a>) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let token_admin = Address::generate(env);

    // Register standard token contract (SAC)
    let token_address = env.register_stellar_asset_contract(token_admin.clone());

    // Register our contract
    let contract_id = env.register_contract(None, ChainKittyContract);
    let client = ChainKittyContractClient::new(env, &contract_id);

    // Initialize the contract
    client.initialize(&admin, &token_address);

    (admin, token_address, client)
}

#[test]
fn test_create_group() {
    let env = Env::default();
    let (_admin, _token_address, client) = setup_env(&env);

    let organizer = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let m3 = Address::generate(&env);

    let mut members = Vec::new(&env);
    members.push_back(m1.clone());
    members.push_back(m2.clone());
    members.push_back(m3.clone());

    let group_id = client.create_group(&organizer, &members, &1000, &3600, &3);
    assert_eq!(group_id, 1);

    let status = client.get_group_status(&group_id);
    assert!(matches!(status, GroupStatus::Active));

    let cycle = client.get_cycle_info(&group_id);
    assert_eq!(cycle.current_cycle, 1);
    assert_eq!(cycle.paid_members.len(), 0);
    assert_eq!(cycle.unpaid_members.len(), 3);
    assert_eq!(cycle.next_recipient, m1);
}

#[test]
fn test_contribute_flow() {
    let env = Env::default();
    let (_admin, token_address, client) = setup_env(&env);

    let organizer = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let m3 = Address::generate(&env);

    let mut members = Vec::new(&env);
    members.push_back(m1.clone());
    members.push_back(m2.clone());
    members.push_back(m3.clone());

    let group_id = client.create_group(&organizer, &members, &1000, &3600, &3);

    // Fund members
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&m1, &10000);
    token_admin.mint(&m2, &10000);
    token_admin.mint(&m3, &10000);

    // M1 contributes
    client.contribute(&group_id, &m1);
    let cycle = client.get_cycle_info(&group_id);
    assert_eq!(cycle.paid_members.len(), 1);
    assert_eq!(cycle.unpaid_members.len(), 2);
    assert_eq!(cycle.paid_members.get(0).unwrap(), m1);

    // Check balance of contract
    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&client.address), 1000);

    // M2 contributes
    client.contribute(&group_id, &m2);
    let cycle2 = client.get_cycle_info(&group_id);
    assert_eq!(cycle2.paid_members.len(), 2);
    assert_eq!(token_client.balance(&client.address), 2000);
}

#[test]
fn test_payout_trigger() {
    let env = Env::default();
    let (_admin, token_address, client) = setup_env(&env);

    let organizer = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let m3 = Address::generate(&env);

    let mut members = Vec::new(&env);
    members.push_back(m1.clone());
    members.push_back(m2.clone());
    members.push_back(m3.clone());

    let group_id = client.create_group(&organizer, &members, &1000, &3600, &3);

    // Fund members
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&m1, &10000);
    token_admin.mint(&m2, &10000);
    token_admin.mint(&m3, &10000);

    // All members contribute
    client.contribute(&group_id, &m1);
    client.contribute(&group_id, &m2);
    client.contribute(&group_id, &m3);

    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&client.address), 3000);

    // Trigger payout
    client.trigger_payout(&group_id);

    // Verify payout received by m1 (next_recipient)
    // m1 started with 10000, paid 1000 (bal 9000), received payout of 3000 (bal 12000)
    assert_eq!(token_client.balance(&m1), 12000);

    // Verify contract has zero balance
    assert_eq!(token_client.balance(&client.address), 0);

    // Verify cycle advanced
    let cycle = client.get_cycle_info(&group_id);
    assert_eq!(cycle.current_cycle, 2);
    assert_eq!(cycle.next_recipient, m2);
    assert_eq!(cycle.paid_members.len(), 0);
    assert_eq!(cycle.unpaid_members.len(), 3);
}

#[test]
fn test_default_handling() {
    let env = Env::default();
    let (_admin, token_address, client) = setup_env(&env);

    let organizer = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let m3 = Address::generate(&env);

    let mut members = Vec::new(&env);
    members.push_back(m1.clone());
    members.push_back(m2.clone());
    members.push_back(m3.clone());

    // Cycle duration is 3600 seconds (1 hour)
    let group_id = client.create_group(&organizer, &members, &1000, &3600, &3);

    // Fund members
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&m1, &10000);
    token_admin.mint(&m2, &10000);
    token_admin.mint(&m3, &10000);

    // M1 contributes, M2 and M3 miss it
    client.contribute(&group_id, &m1);

    // Fast forward ledger time by 4000 seconds
    let current_time = env.ledger().timestamp();
    env.ledger().set(LedgerInfo {
        timestamp: current_time + 4000,
        protocol_version: 20,
        sequence_number: 100,
        network_id: [0; 32],
        base_reserve: 0,
        min_temp_entry_ttl: 0,
        min_persistent_entry_ttl: 0,
        max_entry_ttl: 0,
    });

    // Organizer marks M2 as defaulted
    client.handle_default(&group_id, &m2);

    let m2_history = client.get_member_history(&group_id, &m2);
    assert_eq!(m2_history.defaults, 1);

    // Trigger payout (since deadline passed, it will pay out M1 based on active pool)
    client.trigger_payout(&group_id);

    // M1 gets payout of 1000 (only M1 contributed)
    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&m1), 10000); // 10000 - 1000 (contribute) + 1000 (payout)

    // Verify cycle advanced to 2 (where M2 is the next recipient)
    let cycle = client.get_cycle_info(&group_id);
    assert_eq!(cycle.current_cycle, 2);
    assert_eq!(cycle.next_recipient, m2);

    // In Cycle 2, everyone contributes (M1, M2, M3)
    client.contribute(&group_id, &m1);
    client.contribute(&group_id, &m2);
    client.contribute(&group_id, &m3);

    // Trigger payout for M2 (who has 1 default).
    // Total pool = 3000. 10% penalty = 300. Payout = 2700.
    client.trigger_payout(&group_id);
    assert_eq!(token_client.balance(&m2), 9000 + 2700); // 10000 - 1000 (contribute) + 2700 (payout)
}

#[test]
#[should_panic]
fn test_unauthorized_contribution() {
    let env = Env::default();
    let (_admin, token_address, client) = setup_env(&env);

    let organizer = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let m3 = Address::generate(&env);

    let mut members = Vec::new(&env);
    members.push_back(m1.clone());
    members.push_back(m2.clone());
    members.push_back(m3.clone());

    let group_id = client.create_group(&organizer, &members, &1000, &3600, &3);

    // Fund non-member
    let non_member = Address::generate(&env);
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&non_member, &10000);

    // Non-member tries to contribute, should fail
    client.contribute(&group_id, &non_member);
}

#[test]
#[should_panic]
fn test_double_contribution() {
    let env = Env::default();
    let (_admin, token_address, client) = setup_env(&env);

    let organizer = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let m3 = Address::generate(&env);

    let mut members = Vec::new(&env);
    members.push_back(m1.clone());
    members.push_back(m2.clone());
    members.push_back(m3.clone());

    let group_id = client.create_group(&organizer, &members, &1000, &3600, &3);

    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&m1, &10000);

    // First contribution succeeds
    client.contribute(&group_id, &m1);

    // Second contribution in same cycle should fail
    client.contribute(&group_id, &m1);
}
