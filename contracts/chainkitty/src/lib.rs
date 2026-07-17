#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Vec, Symbol};

#[contract]
pub struct ChainKittyContract;

#[contractimpl]
impl ChainKittyContract {
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), u32> {
        Ok(())
    }
}