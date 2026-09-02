#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine, BN254_G1_SERIALIZED_SIZE, BN254_G2_SERIALIZED_SIZE},
    vec, Address, Bytes, BytesN, Env, String, TryFromVal, Vec,
};

const PROOF_A_LEN: usize = BN254_G1_SERIALIZED_SIZE;
const PROOF_B_LEN: usize = BN254_G2_SERIALIZED_SIZE;
const CIRCUIT_PUBLIC_INPUT_COUNT: u32 = 1;
const EXPECTED_PUBLIC_INPUT_COUNT: u32 = CIRCUIT_PUBLIC_INPUT_COUNT + 1;
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha: BytesN<64>,
    pub beta: BytesN<128>,
    pub gamma: BytesN<128>,
    pub delta: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
#[derive(Clone)]
pub struct Limits {
    pub max_calls: u32,
    pub window_size: u32,
}

/// A read-only snapshot of all non-sensitive contract configuration fields.
/// Fields that the current contract does not implement are returned as `None`.
#[contracttype]
#[derive(Clone)]
pub struct ContractConfig {
    /// The contract administrator address.
    pub admin: Address,
    /// Whether the contract is paused (not implemented; always `false`).
    pub paused: bool,
    /// Optional fee amount in stroops (not implemented; always `None`).
    pub fee_amount: Option<i128>,
    /// Optional fee token contract address (not implemented; always `None`).
    pub fee_token: Option<Address>,
    /// Maximum number of `verify_proof` calls allowed per caller per window.
    pub rate_limit_max: u32,
    /// Rate-limit window size in ledgers.
    pub rate_limit_window: u32,
    /// Timelock delay in ledgers (not implemented; always `None`).
    pub timelock_delay: Option<u32>,
    /// Whether the caller allowlist is currently enforced.
    pub allowlist_enabled: bool,
}

#[contracttype]
enum DataKey {
    Admin,
    PendingAdmin,
    Limits,
    Vk,
    CallCount(Address, u32),
    AllowlistEnabled,
    Allowlist(Address),
    VerificationCount(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    RateLimitExceeded = 2,
    InvalidWindowSize = 3,
    ProofExpired = 4,
    CallerNotAllowed = 5,
    InvalidVerifyingKey = 6,
    NoPendingAdmin = 7,
}

/// Emitted on every `verify_proof` call, regardless of outcome.
#[contractevent(topics = ["zk", "verify"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationResult {
    pub success: bool,
    pub caller: Address,
    /// sha256 of the concatenated public inputs, in call order.
    pub inputs_hash: BytesN<32>,
}

/// One entry in a `verify_batch` call — the same fields `verify_proof` takes,
/// minus `caller`, since a batch shares one caller across all its proofs.
#[contracttype]
#[derive(Clone)]
pub struct ProofItem {
    pub proof_a: Bytes,
    pub proof_b: Bytes,
    pub proof_c: Bytes,
    pub public_inputs: Vec<BytesN<32>>,
}

#[contract]
pub struct VerifierContract;

#[contractimpl]
impl VerifierContract {
    pub fn __constructor(env: Env, admin: Address, max_calls: u32, window_size: u32, vk: VerifyingKey) {
        assert!(window_size > 0, "window_size must be positive");
        assert!(
            vk.ic.len() == EXPECTED_PUBLIC_INPUT_COUNT,
            "verifying key ic length must equal EXPECTED_PUBLIC_INPUT_COUNT"
        );

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Limits, &Limits { max_calls, window_size });
        env.storage().instance().set(&DataKey::Vk, &vk);
    }

    pub fn limits(env: Env) -> Limits {
        env.storage()
            .instance()
            .get(&DataKey::Limits)
            .expect("contract is not initialized")
    }

    pub fn version(env: Env) -> String {
        String::from_str(&env, CONTRACT_VERSION)
    }

    /// Number of times `verify_proof`/`verify_batch` has successfully
    /// verified a proof for `commitment` — the sha256 hash of the
    /// concatenated public inputs, i.e. the same value published as
    /// `inputs_hash` in `VerificationResult`. Intended for off-chain
    /// analytics and abuse detection (e.g. flagging a commitment verified
    /// far more often than legitimate usage would produce).
    ///
    /// Returns 0 for a commitment that has never been successfully
    /// verified.
    pub fn verification_count(env: Env, commitment: BytesN<32>) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::VerificationCount(commitment))
            .unwrap_or(0)
    }

    pub fn set_limits(env: Env, max_calls: u32, window_size: u32) -> Result<(), Error> {
        if window_size == 0 {
            return Err(Error::InvalidWindowSize);
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Limits, &Limits { max_calls, window_size });
        Ok(())
    }

    pub fn update_vk(env: Env, vk: VerifyingKey) -> Result<(), Error> {
        if vk.ic.len() != EXPECTED_PUBLIC_INPUT_COUNT {
            return Err(Error::InvalidVerifyingKey);
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Vk, &vk);
        Ok(())
    }

    pub fn set_allowlist_mode(env: Env, enabled: bool) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::AllowlistEnabled, &enabled);
        Ok(())
    }

    pub fn allowlist_enabled(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::AllowlistEnabled)
            .unwrap_or(false)
    }

    pub fn add_to_allowlist(env: Env, addr: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Allowlist(addr), &true);
        Ok(())
    }

    pub fn remove_from_allowlist(env: Env, addr: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .remove(&DataKey::Allowlist(addr));
        Ok(())
    }

    pub fn is_allowlisted(env: Env, addr: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Allowlist(addr))
            .unwrap_or(false)
    }

    /// Return a snapshot of all non-sensitive contract configuration fields.
    /// This is a read-only view: no auth is required and no state is mutated.
    pub fn get_config(env: Env) -> Result<ContractConfig, Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        let limits: Limits = env
            .storage()
            .instance()
            .get(&DataKey::Limits)
            .ok_or(Error::NotInitialized)?;

        let allowlist_enabled: bool = env
            .storage()
            .instance()
            .get(&DataKey::AllowlistEnabled)
            .unwrap_or(false);

        Ok(ContractConfig {
            admin,
            paused: false,
            fee_amount: None,
            fee_token: None,
            rate_limit_max: limits.max_calls,
            rate_limit_window: limits.window_size,
            timelock_delay: None,
            allowlist_enabled,
        })
    }

    /// Propose `new_admin` as the next admin. Requires the *current* admin's
    /// auth. Does not take effect until `new_admin` calls `accept_admin`.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        Ok(())
    }

    /// The address currently proposed via `propose_admin`, if any.
    pub fn pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    /// Promote the pending admin to admin. Requires the *pending* admin's
    /// own auth — the current admin cannot force this through.
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        pending.require_auth();

        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        Ok(())
    }

    /// Replace this contract's executable with `new_wasm_hash`. Requires the
    /// current admin's auth. The wasm must already be uploaded (see
    /// `env.deployer().upload_contract_wasm`) before this call.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    pub fn verify_proof(
        env: Env,
        caller: Address,
        proof_a: Bytes,
        proof_b: Bytes,
        proof_c: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, Error> {
        caller.require_auth();

        let item = ProofItem {
            proof_a,
            proof_b,
            proof_c,
            public_inputs,
        };
        let result = verify_one(&env, &caller, &item);

        // Same rule as before: only publish on an Ok(...) outcome. An Err(...)
        // here rolls back the whole call (see the note on publish_verification_result),
        // so publishing first would be a silent no-op.
        if let Ok(success) = result {
            publish_verification_result(&env, &caller, success, &item.public_inputs);
        }

        result
    }

    /// Verify a batch of proofs from one caller in a single call. Each proof
    /// is still subject to its own allowlist/rate-limit/expiry check, applied
    /// in order — an earlier proof in the batch that consumes rate-limit
    /// budget affects whether a later one in the *same* batch passes.
    ///
    /// Unlike `verify_proof`, a per-proof rejection (allowlist, rate limit,
    /// expiry) does not fail the call — it becomes `false` in the returned
    /// vec, and `verify_batch` keeps processing the rest of the batch. This
    /// is deliberate: a batch's transaction never fails just because one
    /// proof in it was invalid, and unlike a single `verify_proof` call,
    /// there is no failed-transaction error code to fall back on to learn
    /// *why* a given entry came back `false` — so every entry, rejected or
    /// not, gets its own `verification_result` event.
    ///
    /// `Err(Error::NotInitialized)` is the one exception: that means the
    /// contract itself isn't set up, not that any particular proof is bad,
    /// so it aborts the whole batch (nothing in it could have succeeded).
    pub fn verify_batch(
        env: Env,
        caller: Address,
        proofs: Vec<ProofItem>,
    ) -> Result<Vec<bool>, Error> {
        caller.require_auth();

        let mut results = Vec::new(&env);
        for item in proofs.iter() {
            let success = match verify_one(&env, &caller, &item) {
                Ok(success) => success,
                Err(Error::NotInitialized) => return Err(Error::NotInitialized),
                Err(_) => false,
            };
            publish_verification_result(&env, &caller, success, &item.public_inputs);
            results.push_back(success);
        }

        Ok(results)
    }
}

/// The shared core of `verify_proof` and `verify_batch`: run every check for
/// one proof (allowlist, rate limit, byte parsing, input count, expiry,
/// pairing) and return its outcome. Does not publish an event itself —
/// callers decide when and whether that's meaningful for their own outcome
/// handling (see `verify_proof` and `verify_batch` above).
fn verify_one(env: &Env, caller: &Address, item: &ProofItem) -> Result<bool, Error> {
    let allowlist_enabled: bool = env
        .storage()
        .instance()
        .get(&DataKey::AllowlistEnabled)
        .unwrap_or(false);
    if allowlist_enabled {
        let allowed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Allowlist(caller.clone()))
            .unwrap_or(false);
        if !allowed {
            return Err(Error::CallerNotAllowed);
        }
    }

    let limits: Limits = env
        .storage()
        .instance()
        .get(&DataKey::Limits)
        .ok_or(Error::NotInitialized)?;

    let ledger = env.ledger().sequence();
    let window_start = ledger - (ledger % limits.window_size);
    let count_key = DataKey::CallCount(caller.clone(), window_start);
    let current: u32 = env.storage().temporary().get(&count_key).unwrap_or(0);
    let next = current + 1;
    if next > limits.max_calls {
        return Err(Error::RateLimitExceeded);
    }
    env.storage().temporary().set(&count_key, &next);
    env.storage()
        .temporary()
        .extend_ttl(&count_key, limits.window_size, limits.window_size);

    let proof_a = read_g1(env, &item.proof_a, "proof_a");
    let proof_b = read_g2(env, &item.proof_b, "proof_b");
    let proof_c = read_g1(env, &item.proof_c, "proof_c");

    if item.public_inputs.len() != EXPECTED_PUBLIC_INPUT_COUNT {
        return Ok(false);
    }

    let expiry_ledger = match read_expiry_ledger(&item.public_inputs.get(1).unwrap()) {
        Some(value) => value,
        None => return Ok(false),
    };

    if ledger > expiry_ledger {
        return Err(Error::ProofExpired);
    }

    let vk: VerifyingKey = env
        .storage()
        .instance()
        .get(&DataKey::Vk)
        .ok_or(Error::NotInitialized)?;

    let vk_alpha = Bn254G1Affine::from_bytes(vk.alpha);
    let vk_beta = Bn254G2Affine::from_bytes(vk.beta);
    let vk_gamma = Bn254G2Affine::from_bytes(vk.gamma);
    let vk_delta = Bn254G2Affine::from_bytes(vk.delta);
    let vk_ic0 = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
    let vk_ic1 = Bn254G1Affine::from_bytes(vk.ic.get(1).unwrap());

    let public_input = Bn254Fr::from_bytes(item.public_inputs.get(0).unwrap());
    let vk_x = vk_ic0 + (vk_ic1 * public_input);

    let verified = env.crypto().bn254().pairing_check(
        vec![env, proof_a, -vk_alpha, -vk_x, -proof_c],
        vec![env, proof_b, vk_beta, vk_gamma, vk_delta],
    );

    if verified {
        let commitment = compute_inputs_hash(env, &item.public_inputs);
        record_verification_attempt(env, &commitment);
    }

    Ok(verified)
}

/// Publish the `verification_result` event for an outcome that returns via
/// `Ok(...)`. Deliberately not called on the `Err(...)` paths above — Soroban
/// rolls back all events published during a call that ultimately returns
/// `Err` from a `#[contracterror]` `Result`, so publishing there would be a
/// silent no-op. Those paths are already visible to callers as a failed
/// transaction with a specific error code, which is at least as informative
/// as this event's bare `success: bool` would be.
fn publish_verification_result(
    env: &Env,
    caller: &Address,
    success: bool,
    public_inputs: &Vec<BytesN<32>>,
) {
    VerificationResult {
        success,
        caller: caller.clone(),
        inputs_hash: compute_inputs_hash(env, public_inputs),
    }
    .publish(env);
}

/// Track how many times a proof has been successfully verified for a given
/// public-input commitment, for off-chain analytics and abuse detection
/// (see `VerifierContract::verification_count`).
///
/// The counter uses `instance()` storage so it persists across calls and
/// never resets — unlike `CallCount` (finding #6), the commitment is
/// derived from the proof's public inputs which the contract author
/// controls via the circuit, so an attacker cannot mint unbounded
/// distinct commitments to grow storage. The admin can call `upgrade`
/// to redeploy from scratch if storage ever becomes a concern.
fn record_verification_attempt(env: &Env, commitment: &BytesN<32>) {
    let key = DataKey::VerificationCount(commitment.clone());
    let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
    let next = current + 1;
    env.storage().instance().set(&key, &next);
}

fn compute_inputs_hash(env: &Env, public_inputs: &Vec<BytesN<32>>) -> BytesN<32> {
    let mut bytes = Bytes::new(env);
    for input in public_inputs.iter() {
        bytes.append(&Bytes::from(&input));
    }
    env.crypto().sha256(&bytes).to_bytes()
}

fn read_expiry_ledger(bytes: &BytesN<32>) -> Option<u32> {
    let arr = bytes.to_array();
    let mut i = 0;
    while i < 28 {
        if arr[i] != 0 {
            return None;
        }
        i += 1;
    }
    Some(u32::from_be_bytes([arr[28], arr[29], arr[30], arr[31]]))
}

fn read_g1(env: &Env, bytes: &Bytes, label: &str) -> Bn254G1Affine {
    assert_eq!(bytes.len(), PROOF_A_LEN as u32, "{label} must be 64 bytes");
    let bytesn = BytesN::<PROOF_A_LEN>::try_from_val(env, bytes.as_val())
        .expect("proof bytes must be convertible to BytesN<64>");
    Bn254G1Affine::from_bytes(bytesn)
}

fn read_g2(env: &Env, bytes: &Bytes, label: &str) -> Bn254G2Affine {
    assert_eq!(bytes.len(), PROOF_B_LEN as u32, "{label} must be 128 bytes");
    let bytesn = BytesN::<PROOF_B_LEN>::try_from_val(env, bytes.as_val())
        .expect("proof bytes must be convertible to BytesN<128>");
    Bn254G2Affine::from_bytes(bytesn)
}

#[cfg(test)]
mod tests;
