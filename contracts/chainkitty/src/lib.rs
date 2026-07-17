#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short, Address, Env, Vec, Symbol,
    token::Client as TokenClient,
};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GroupStatus {
    Forming = 0,
    Active = 1,
    Completed = 2,
    Defaulted = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GroupState {
    pub id: u64,
    pub organizer: Address,
    pub members: Vec<Address>,
    pub contribution_amount: i128,
    pub cycle_duration: u64,
    pub member_count: u32,
    pub status: GroupStatus,
    pub token: Address,
}

// Storage representation (optimized, no dynamic arrays)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CycleState {
    pub current_cycle: u32,
    pub paid_count: u32,
    pub next_recipient: Address,
    pub deadline: u64,
}

// API representation (returned to frontend/caller)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CycleInfo {
    pub current_cycle: u32,
    pub paid_members: Vec<Address>,
    pub unpaid_members: Vec<Address>,
    pub next_recipient: Address,
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemberRecord {
    pub contributions_made: i128,
    pub payouts_received: i128,
    pub defaults: u32,
    pub reputation_score: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    GroupCount,
    Group(u64),
    Cycle(u64),
    MemberHistory(u64, Address),
    HasPaid(u64, u32, Address), // (group_id, cycle, member)
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    GroupNotFound = 3,
    NotAMember = 4,
    AlreadyPaidThisCycle = 5,
    CycleNotFinished = 6,
    DeadlineNotPassed = 7,
    GroupCompleted = 8,
    Unauthorized = 9,
    InvalidMemberCount = 10,
    GroupNotForming = 11,
    AlreadyAMember = 12,
}

// Events
const GROUP_CREATED: Symbol = symbol_short!("grp_creat");
const CONTRIBUTION_MADE: Symbol = symbol_short!("contrib");
const PAYOUT_RELEASED: Symbol = symbol_short!("payout");
const MEMBER_DEFAULTED: Symbol = symbol_short!("default");
const CYCLE_ADVANCED: Symbol = symbol_short!("advanced");

#[contract]
pub struct ChainKittyContract;

#[contractimpl]
impl ChainKittyContract {
    /// Initialize the contract with a default token asset (e.g., XLM or a stablecoin) and admin.
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::GroupCount, &0u64);
        Ok(())
    }

    /// Create a new rotating savings group.
    pub fn create_group(
        env: Env,
        organizer: Address,
        members: Vec<Address>,
        contribution_amount: i128,
        cycle_duration: u64,
        member_count: u32,
    ) -> Result<u64, ContractError> {
        organizer.require_auth();

        if members.len() > member_count || member_count == 0 {
            return Err(ContractError::InvalidMemberCount);
        }

        if !env.storage().instance().has(&DataKey::Token) {
            return Err(ContractError::NotInitialized);
        }
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();

        // Get group count for new group ID
        let mut count: u64 = env.storage().instance().get(&DataKey::GroupCount).unwrap_or(0);
        count += 1;
        env.storage().instance().set(&DataKey::GroupCount, &count);

        let group_id = count;

        let is_active = members.len() == member_count;
        let status = if is_active {
            GroupStatus::Active
        } else {
            GroupStatus::Forming
        };

        let group_state = GroupState {
            id: group_id,
            organizer: organizer.clone(),
            members: members.clone(),
            contribution_amount,
            cycle_duration,
            member_count,
            status,
            token,
        };

        // Save group state
        env.storage().persistent().set(&DataKey::Group(group_id), &group_state);

        if is_active {
            // Initialize cycle state
            let start_time = env.ledger().timestamp();
            let deadline = start_time + cycle_duration;
            let next_recipient = members.get(0).unwrap();

            let cycle_state = CycleState {
                current_cycle: 1,
                paid_count: 0,
                next_recipient,
                deadline,
            };
            env.storage().persistent().set(&DataKey::Cycle(group_id), &cycle_state);

            // Initialize member history records
            for i in 0..members.len() {
                let m = members.get(i).unwrap();
                let record = MemberRecord {
                    contributions_made: 0,
                    payouts_received: 0,
                    defaults: 0,
                    reputation_score: 100,
                };
                env.storage().persistent().set(&DataKey::MemberHistory(group_id, m), &record);
            }
        }

        // Emit GroupCreated event
        env.events().publish(
            (GROUP_CREATED, group_id),
            (organizer, contribution_amount, cycle_duration),
        );

        Ok(group_id)
    }

    /// Contribute the fixed amount for the current cycle.
    pub fn contribute(env: Env, group_id: u64, member: Address) -> Result<(), ContractError> {
        member.require_auth();

        // Get group state
        let group_key = DataKey::Group(group_id);
        if !env.storage().persistent().has(&group_key) {
            return Err(ContractError::GroupNotFound);
        }
        let group: GroupState = env.storage().persistent().get(&group_key).unwrap();

        if group.status != GroupStatus::Active {
            return Err(ContractError::GroupCompleted);
        }

        // Verify membership
        let mut is_member = false;
        for i in 0..group.members.len() {
            if group.members.get(i).unwrap() == member {
                is_member = true;
                break;
            }
        }
        if !is_member {
            return Err(ContractError::NotAMember);
        }

        // Get cycle state
        let cycle_key = DataKey::Cycle(group_id);
        let mut cycle: CycleState = env.storage().persistent().get(&cycle_key).unwrap();

        // Check if member already contributed in this cycle
        let has_paid_key = DataKey::HasPaid(group_id, cycle.current_cycle, member.clone());
        if env.storage().persistent().has(&has_paid_key) {
            return Err(ContractError::AlreadyPaidThisCycle);
        }

        // Call token contract to transfer escrow funds from member to contract
        let token_client = TokenClient::new(&env, &group.token);
        token_client.transfer(&member, &env.current_contract_address(), &group.contribution_amount);

        // Update cycle status and paid flag
        env.storage().persistent().set(&has_paid_key, &true);
        cycle.paid_count += 1;
        env.storage().persistent().set(&cycle_key, &cycle);

        // Update member history
        let history_key = DataKey::MemberHistory(group_id, member.clone());
        let mut record: MemberRecord = env.storage().persistent().get(&history_key).unwrap();
        record.contributions_made += group.contribution_amount;
        env.storage().persistent().set(&history_key, &record);

        // Emit ContributionMade event
        env.events().publish(
            (CONTRIBUTION_MADE, group_id),
            (member, group.contribution_amount, cycle.current_cycle),
        );

        Ok(())
    }

    /// Trigger payout for the current cycle once all contributions are collected or deadline passes.
    pub fn trigger_payout(env: Env, group_id: u64) -> Result<(), ContractError> {
        let group_key = DataKey::Group(group_id);
        if !env.storage().persistent().has(&group_key) {
            return Err(ContractError::GroupNotFound);
        }
        let mut group: GroupState = env.storage().persistent().get(&group_key).unwrap();

        if group.status != GroupStatus::Active {
            return Err(ContractError::GroupCompleted);
        }

        // Authenticate organizer
        group.organizer.require_auth();

        let cycle_key = DataKey::Cycle(group_id);
        let mut cycle: CycleState = env.storage().persistent().get(&cycle_key).unwrap();

        let now = env.ledger().timestamp();
        let total_members = group.members.len();

        // Payout can be triggered if all members have paid OR if the deadline has passed
        let all_paid = cycle.paid_count == total_members;
        let deadline_passed = now >= cycle.deadline;

        if !all_paid && !deadline_passed {
            return Err(ContractError::CycleNotFinished);
        }

        // Calculate payout amount. Each contributing member paid `contribution_amount`.
        // Total pool = contribution_amount * paid_count.
        let paid_count_i128 = cycle.paid_count as i128;
        let mut payout_amount = group.contribution_amount * paid_count_i128;

        // Apply default penalties if recipient has outstanding defaults
        let recipient = cycle.next_recipient.clone();
        let recipient_history_key = DataKey::MemberHistory(group_id, recipient.clone());
        let mut recipient_record: MemberRecord = env.storage().persistent().get(&recipient_history_key).unwrap();

        // 10% penalty per default, capped at 50% max penalty
        if recipient_record.defaults > 0 {
            let penalty_pct = core::cmp::min(recipient_record.defaults * 10, 50) as i128;
            let penalty_amount = (payout_amount * penalty_pct) / 100;
            payout_amount -= penalty_amount;
        }

        // Transfer funds to recipient
        if payout_amount > 0 {
            let token_client = TokenClient::new(&env, &group.token);
            token_client.transfer(&env.current_contract_address(), &recipient, &payout_amount);
        }

        // Update recipient history
        recipient_record.payouts_received += payout_amount;
        env.storage().persistent().set(&recipient_history_key, &recipient_record);

        // Emit PayoutReleased event
        env.events().publish(
            (PAYOUT_RELEASED, group_id),
            (recipient.clone(), payout_amount, cycle.current_cycle),
        );

        // Storage optimization: remove HasPaid records for the completed cycle
        for i in 0..group.members.len() {
            let m = group.members.get(i).unwrap();
            let has_paid_key = DataKey::HasPaid(group_id, cycle.current_cycle, m.clone());
            env.storage().persistent().remove(&has_paid_key);
        }

        // Advance to next cycle or complete group
        if (cycle.current_cycle as u32) >= total_members {
            // Group is complete
            group.status = GroupStatus::Completed;
            env.storage().persistent().set(&group_key, &group);
        } else {
            // Advance cycle
            cycle.current_cycle += 1;
            cycle.paid_count = 0;
            
            // Next recipient in rotation order
            let next_idx = (cycle.current_cycle - 1) as u32;
            cycle.next_recipient = group.members.get(next_idx).unwrap();
            
            // Set next deadline
            cycle.deadline = env.ledger().timestamp() + group.cycle_duration;
            env.storage().persistent().set(&cycle_key, &cycle);

            // Emit CycleAdvanced event
            env.events().publish(
                (CYCLE_ADVANCED, group_id),
                (cycle.current_cycle, cycle.next_recipient.clone()),
            );
        }

        Ok(())
    }

    /// Mark a member as defaulted if they missed the current cycle deadline.
    pub fn handle_default(env: Env, group_id: u64, member: Address) -> Result<(), ContractError> {
        let group_key = DataKey::Group(group_id);
        if !env.storage().persistent().has(&group_key) {
            return Err(ContractError::GroupNotFound);
        }
        let group: GroupState = env.storage().persistent().get(&group_key).unwrap();

        // Only the organizer can flag defaults
        group.organizer.require_auth();

        if group.status != GroupStatus::Active {
            return Err(ContractError::GroupCompleted);
        }

        let cycle_key = DataKey::Cycle(group_id);
        let cycle: CycleState = env.storage().persistent().get(&cycle_key).unwrap();

        // Check if the deadline has passed
        if env.ledger().timestamp() < cycle.deadline {
            return Err(ContractError::DeadlineNotPassed);
        }

        // Check if they are actually in the unpaid list
        let has_paid_key = DataKey::HasPaid(group_id, cycle.current_cycle, member.clone());
        if env.storage().persistent().has(&has_paid_key) {
            return Err(ContractError::AlreadyPaidThisCycle);
        }

        // Verify that the address is actually a group member
        let mut is_member = false;
        for i in 0..group.members.len() {
            if group.members.get(i).unwrap() == member {
                is_member = true;
                break;
            }
        }
        if !is_member {
            return Err(ContractError::NotAMember);
        }

        // Increment default count for the member
        let history_key = DataKey::MemberHistory(group_id, member.clone());
        let mut record: MemberRecord = env.storage().persistent().get(&history_key).unwrap();
        record.defaults += 1;
        record.reputation_score = if record.reputation_score >= 25 {
            record.reputation_score - 25
        } else {
            0
        };
        env.storage().persistent().set(&history_key, &record);

        // Emit MemberDefaulted event
        env.events().publish(
            (MEMBER_DEFAULTED, group_id),
            (member, cycle.current_cycle),
        );

        Ok(())
    }

    /// Read group status.
    pub fn get_group_status(env: Env, group_id: u64) -> Result<GroupStatus, ContractError> {
        let group_key = DataKey::Group(group_id);
        if !env.storage().persistent().has(&group_key) {
            return Err(ContractError::GroupNotFound);
        }
        let group: GroupState = env.storage().persistent().get(&group_key).unwrap();
        Ok(group.status)
    }

    /// Read active cycle info (dynamically reconstruct paid/unpaid lists).
    pub fn get_cycle_info(env: Env, group_id: u64) -> Result<CycleInfo, ContractError> {
        let group_key = DataKey::Group(group_id);
        if !env.storage().persistent().has(&group_key) {
            return Err(ContractError::GroupNotFound);
        }
        let group: GroupState = env.storage().persistent().get(&group_key).unwrap();

        let cycle_key = DataKey::Cycle(group_id);
        if !env.storage().persistent().has(&cycle_key) {
            return Err(ContractError::GroupNotFound);
        }
        let cycle: CycleState = env.storage().persistent().get(&cycle_key).unwrap();

        let mut paid_members = Vec::new(&env);
        let mut unpaid_members = Vec::new(&env);

        for i in 0..group.members.len() {
            let m = group.members.get(i).unwrap();
            let has_paid_key = DataKey::HasPaid(group_id, cycle.current_cycle, m.clone());
            if env.storage().persistent().has(&has_paid_key) {
                paid_members.push_back(m);
            } else {
                unpaid_members.push_back(m);
            }
        }

        Ok(CycleInfo {
            current_cycle: cycle.current_cycle,
            paid_members,
            unpaid_members,
            next_recipient: cycle.next_recipient,
            deadline: cycle.deadline,
        })
    }

    /// Read a specific member's contribution history.
    pub fn get_member_history(
        env: Env,
        group_id: u64,
        member: Address,
    ) -> Result<MemberRecord, ContractError> {
        let history_key = DataKey::MemberHistory(group_id, member);
        if !env.storage().persistent().has(&history_key) {
            return Err(ContractError::GroupNotFound);
        }
        let record: MemberRecord = env.storage().persistent().get(&history_key).unwrap();
        Ok(record)
    }

    /// Join an open (forming) savings group.
    pub fn join_group(env: Env, group_id: u64, member: Address) -> Result<(), ContractError> {
        member.require_auth();

        let group_key = DataKey::Group(group_id);
        if !env.storage().persistent().has(&group_key) {
            return Err(ContractError::GroupNotFound);
        }
        let mut group: GroupState = env.storage().persistent().get(&group_key).unwrap();

        if group.status != GroupStatus::Forming {
            return Err(ContractError::GroupNotForming);
        }

        // Check if member already in group
        let mut is_member = false;
        for i in 0..group.members.len() {
            if group.members.get(i).unwrap() == member {
                is_member = true;
                break;
            }
        }
        if is_member {
            return Err(ContractError::AlreadyAMember);
        }

        group.members.push_back(member.clone());

        let is_active = group.members.len() == group.member_count;
        if is_active {
            group.status = GroupStatus::Active;

            // Initialize cycle state
            let start_time = env.ledger().timestamp();
            let deadline = start_time + group.cycle_duration;
            let next_recipient = group.members.get(0).unwrap();

            let cycle_state = CycleState {
                current_cycle: 1,
                paid_count: 0,
                next_recipient,
                deadline,
            };
            env.storage().persistent().set(&DataKey::Cycle(group_id), &cycle_state);

            // Initialize member history records
            for i in 0..group.members.len() {
                let m = group.members.get(i).unwrap();
                let record = MemberRecord {
                    contributions_made: 0,
                    payouts_received: 0,
                    defaults: 0,
                    reputation_score: 100,
                };
                env.storage().persistent().set(&DataKey::MemberHistory(group_id, m), &record);
            }
        }

        env.storage().persistent().set(&group_key, &group);

        // Emit MemberJoined event
        let member_joined: Symbol = symbol_short!("join");
        env.events().publish(
            (member_joined, group_id),
            (member, group.members.len()),
        );

        Ok(())
    }

    /// Get all open (forming) groups.
    pub fn get_open_groups(env: Env) -> Vec<u64> {
        let count: u64 = env.storage().instance().get(&DataKey::GroupCount).unwrap_or(0);
        let mut open_groups = Vec::new(&env);
        for id in 1..=count {
            let group_key = DataKey::Group(id);
            if let Some(group) = env.storage().persistent().get::<_, GroupState>(&group_key) {
                if let GroupStatus::Forming = group.status {
                    open_groups.push_back(id);
                }
            }
        }
        open_groups
    }
}

#[cfg(test)]
mod test;
