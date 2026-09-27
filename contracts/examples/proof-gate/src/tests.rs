extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{contract, contractimpl};
use zksoroban_verifier_interface::{Error, VerifierInterface};

/// Stands in for `contracts/verifier` in these tests: implements the same
/// published `VerifierInterface` trait this example depends on, but with a
/// trivial, deterministic rule instead of real Groth16 verification, so
/// these tests exercise the cross-contract call itself (dispatch, argument
/// encoding, auth propagation) without needing real proof/circuit
/// fixtures. `contracts/verifier`'s own test suite is what proves its
/// actual verification logic; see `docs/architecture.md` for a from-a-real-
/// deployed-verifier walkthrough of this same call.
#[contract]
struct FakeVerifier;

#[contractimpl]
impl VerifierInterface for FakeVerifier {
    fn verify_proof(
        _env: Env,
        caller: Address,
        proof_a: Bytes,
        _proof_b: Bytes,
        _proof_c: Bytes,
        _public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, Error> {
        caller.require_auth();
        Ok(proof_a.get(0).unwrap_or(0) != 0)
    }
}

fn setup(env: &Env) -> (Address, ProofGateClient<'static>) {
    let gate_id = env.register(ProofGate, ());
    let verifier_id = env.register(FakeVerifier, ());
    (verifier_id, ProofGateClient::new(env, &gate_id))
}

fn proof_bytes(env: &Env, first_byte: u8) -> Bytes {
    let mut bytes = Bytes::new(env);
    bytes.push_back(first_byte);
    bytes
}

#[test]
fn cross_contract_call_returns_true_when_the_verifier_says_so() {
    let env = Env::default();
    // mock_all_auths() alone only auto-authorizes require_auth() calls made
    // by the directly-invoked (root) contract. FakeVerifier's require_auth()
    // runs one level deeper -- inside the nested cross-contract call check()
    // makes -- so it needs the _allowing_non_root_auth variant, or the whole
    // call fails with Error(Auth, InvalidAction) even though caller is a
    // perfectly valid address. This is exactly the same requirement a real
    // caller's signed authorization tree has to satisfy in production: it
    // must cover the verify_proof sub-invocation, not just check() itself.
    env.mock_all_auths_allowing_non_root_auth();
    let (verifier_id, client) = setup(&env);
    let caller = Address::generate(&env);

    let verified = client.check(
        &verifier_id,
        &caller,
        &proof_bytes(&env, 1),
        &Bytes::new(&env),
        &Bytes::new(&env),
        &Vec::new(&env),
    );

    assert!(verified);
}

#[test]
fn cross_contract_call_returns_false_when_the_verifier_rejects() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (verifier_id, client) = setup(&env);
    let caller = Address::generate(&env);

    let verified = client.check(
        &verifier_id,
        &caller,
        &proof_bytes(&env, 0),
        &Bytes::new(&env),
        &Bytes::new(&env),
        &Vec::new(&env),
    );

    assert!(!verified);
}

#[test]
#[should_panic]
fn cross_contract_call_still_requires_the_callers_auth() {
    // No mock_all_auths() -- proves the gate contract doesn't launder
    // around verify_proof's own require_auth check: an unauthorized
    // caller is rejected in the nested call exactly as if `check` weren't
    // there at all.
    let env = Env::default();
    let (verifier_id, client) = setup(&env);
    let caller = Address::generate(&env);

    client.check(
        &verifier_id,
        &caller,
        &proof_bytes(&env, 1),
        &Bytes::new(&env),
        &Bytes::new(&env),
        &Vec::new(&env),
    );
}
