#![no_std]

//! Minimal example contract demonstrating a type-safe cross-contract call
//! into a deployed `contracts/verifier` instance via the published
//! `VerifierClient` interface — see zksoroban#64 and `docs/architecture.md`'s
//! "Cross-Contract Interface" section for the full write-up.

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Vec};
use zksoroban_verifier_interface::VerifierClient;

#[contract]
pub struct ProofGate;

#[contractimpl]
impl ProofGate {
    /// Calls `verify_proof` on `verifier` via the published `VerifierClient`
    /// and returns its result directly.
    ///
    /// `caller` is forwarded as-is into the nested `verify_proof` call —
    /// it's the address that call requires auth from and keys its rate
    /// limit by, exactly as if this contract weren't in between. A real
    /// caller's signed authorization must cover *both* invocations (this
    /// contract's `check` and the verifier's `verify_proof`) for either
    /// `require_auth()` to succeed; see this crate's tests for a case that
    /// omits it and panics.
    pub fn check(
        env: Env,
        verifier: Address,
        caller: Address,
        proof_a: Bytes,
        proof_b: Bytes,
        proof_c: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        VerifierClient::new(&env, &verifier).verify_proof(
            &caller,
            &proof_a,
            &proof_b,
            &proof_c,
            &public_inputs,
        )
    }
}

#[cfg(test)]
mod tests;
