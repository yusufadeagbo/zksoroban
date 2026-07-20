extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address, Bytes, BytesN, Env, String, Vec};

const VALID_PROOF_A: [u8; PROOF_A_LEN] = [
    28, 159, 72, 150, 222, 218, 126, 226, 53, 93, 4, 80, 73, 92, 40, 120, 36, 194, 215, 167,
    39, 53, 38, 203, 78, 55, 154, 43, 183, 51, 27, 239, 39, 116, 225, 204, 223, 113, 45, 75,
    145, 63, 162, 251, 115, 169, 233, 211, 196, 17, 50, 95, 10, 96, 100, 87, 103, 45, 222,
    46, 22, 79, 236, 207,
];

const VALID_PROOF_B: [u8; PROOF_B_LEN] = [
    1, 42, 5, 66, 163, 235, 37, 249, 221, 59, 28, 26, 28, 141, 222, 136, 44, 125, 57, 205, 174,
    171, 120, 158, 215, 5, 37, 152, 128, 47, 109, 179, 10, 195, 151, 7, 203, 209, 91, 29, 216,
    105, 99, 216, 134, 57, 249, 38, 63, 28, 61, 16, 237, 176, 106, 59, 106, 127, 132, 150,
    173, 249, 24, 39, 37, 42, 7, 245, 29, 242, 177, 182, 170, 101, 22, 47, 23, 147, 59, 250,
    162, 36, 95, 66, 122, 2, 75, 26, 188, 118, 101, 74, 47, 193, 255, 168, 11, 116, 62, 79, 44,
    18, 181, 195, 110, 255, 73, 31, 99, 67, 197, 43, 29, 151, 157, 210, 34, 247, 134, 38, 31,
    23, 4, 3, 49, 77, 27, 13,
];

const VALID_PROOF_C: [u8; PROOF_A_LEN] = [
    17, 201, 219, 26, 68, 41, 61, 217, 55, 131, 157, 11, 39, 31, 149, 251, 231, 172, 120, 223,
    35, 49, 86, 11, 238, 214, 162, 152, 3, 170, 201, 25, 12, 55, 128, 235, 89, 16, 108, 55,
    145, 211, 153, 105, 252, 163, 82, 244, 31, 20, 102, 144, 205, 165, 13, 28, 60, 128, 197,
    222, 246, 69, 1, 222,
];

const VALID_PUBLIC_INPUT: [u8; 32] = [
    41, 23, 97, 0, 234, 169, 98, 189, 193, 254, 108, 101, 77, 106, 60, 19, 14, 150, 164, 209,
    22, 139, 51, 132, 139, 137, 125, 197, 2, 130, 1, 51,
];

fn setup(max_calls: u32, window_size: u32) -> (Env, Address, VerifierContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VerifierContract, (admin.clone(), max_calls, window_size));
    let client = VerifierContractClient::new(&env, &contract_id);
    (env, admin, client)
}

fn expiry_bytes(env: &Env, expiry_ledger: u32) -> BytesN<32> {
    let mut arr = [0u8; 32];
    let be = expiry_ledger.to_be_bytes();
    arr[28] = be[0];
    arr[29] = be[1];
    arr[30] = be[2];
    arr[31] = be[3];
    BytesN::from_array(env, &arr)
}

fn public_inputs_with_expiry(env: &Env, expiry_ledger: u32) -> Vec<BytesN<32>> {
    vec![
        env,
        BytesN::from_array(env, &VALID_PUBLIC_INPUT),
        expiry_bytes(env, expiry_ledger),
    ]
}

fn call_with_expiry(
    env: &Env,
    client: &VerifierContractClient,
    caller: &Address,
    expiry_ledger: u32,
) -> bool {
    client.verify_proof(
        caller,
        &Bytes::from_array(env, &VALID_PROOF_A),
        &Bytes::from_array(env, &VALID_PROOF_B),
        &Bytes::from_array(env, &VALID_PROOF_C),
        &public_inputs_with_expiry(env, expiry_ledger),
    )
}

fn call_valid(env: &Env, client: &VerifierContractClient, caller: &Address) -> bool {
    call_with_expiry(env, client, caller, u32::MAX)
}

#[test]
fn version_returns_the_crate_version() {
    let (env, _admin, client) = setup(10, 100);
    assert_eq!(client.version(), String::from_str(&env, env!("CARGO_PKG_VERSION")));
}

#[test]
fn verify_proof_returns_true_for_valid_unexpired_proof() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);

    assert!(call_with_expiry(&env, &client, &caller, 1000));
}

#[test]
fn verify_proof_rejects_expired_proof() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);

    let result = client.try_verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, 50),
    );

    assert_eq!(result, Err(Ok(Error::ProofExpired)));
}

#[test]
fn verify_proof_accepts_expiry_at_exactly_current_ledger() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);

    assert!(call_with_expiry(&env, &client, &caller, 100));
}

#[test]
fn verify_proof_returns_false_for_tampered_proof_a() {
    let (env, _admin, client) = setup(10, 100);
    let caller = Address::generate(&env);
    let tampered = (-Bn254G1Affine::from_array(&env, &VALID_PROOF_A)).to_array();

    let result = client.verify_proof(
        &caller,
        &Bytes::from_array(&env, &tampered),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, u32::MAX),
    );

    assert!(!result);
}

#[test]
fn verify_proof_returns_false_for_wrong_public_input_count() {
    let (env, _admin, client) = setup(10, 100);
    let caller = Address::generate(&env);
    let only_commitment = vec![&env, BytesN::from_array(&env, &VALID_PUBLIC_INPUT)];

    let result = client.verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &only_commitment,
    );

    assert!(!result);
}

#[test]
#[should_panic(expected = "proof_a must be 64 bytes")]
fn verify_proof_panics_on_wrong_proof_a_length() {
    let (env, _admin, client) = setup(10, 100);
    let caller = Address::generate(&env);

    client.verify_proof(
        &caller,
        &Bytes::from_array(&env, &[0; 63]),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, u32::MAX),
    );
}

#[test]
fn first_call_succeeds() {
    let (env, _admin, client) = setup(1, 100);
    let caller = Address::generate(&env);
    assert!(call_valid(&env, &client, &caller));
}

#[test]
fn limit_hit_returns_error() {
    let (env, _admin, client) = setup(2, 100);
    let caller = Address::generate(&env);

    assert!(call_valid(&env, &client, &caller));
    assert!(call_valid(&env, &client, &caller));

    let third = client.try_verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, u32::MAX),
    );

    assert_eq!(third, Err(Ok(Error::RateLimitExceeded)));
}

#[test]
fn window_expiry_resets_counter() {
    let (env, _admin, client) = setup(1, 10);
    let caller = Address::generate(&env);

    assert!(call_valid(&env, &client, &caller));

    let exceeded = client.try_verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, u32::MAX),
    );
    assert_eq!(exceeded, Err(Ok(Error::RateLimitExceeded)));

    env.ledger().with_mut(|li| {
        li.sequence_number += 11;
    });

    assert!(call_valid(&env, &client, &caller));
}

#[test]
fn separate_callers_have_independent_counters() {
    let (env, _admin, client) = setup(1, 100);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    assert!(call_valid(&env, &client, &alice));
    assert!(call_valid(&env, &client, &bob));
}

#[test]
fn admin_can_update_limits() {
    let (env, _admin, client) = setup(1, 100);

    client.set_limits(&5, &50);

    let limits = client.limits();
    assert_eq!(limits.max_calls, 5);
    assert_eq!(limits.window_size, 50);

    let caller = Address::generate(&env);
    assert!(call_valid(&env, &client, &caller));
    assert!(call_valid(&env, &client, &caller));
}

// The tests above all use setup(), which calls env.mock_all_auths() —
// meaning require_auth() succeeds for every address unconditionally,
// including these two negative cases if run through that helper. These
// use a bare Env with no auth mocked at all, so require_auth() genuinely
// has nothing to authorize against and traps.

#[test]
#[should_panic]
fn verify_proof_rejects_call_with_no_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32));
    let client = VerifierContractClient::new(&env, &contract_id);
    let caller = Address::generate(&env);

    call_valid(&env, &client, &caller);
}

#[test]
#[should_panic]
fn set_limits_rejects_call_with_no_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32));
    let client = VerifierContractClient::new(&env, &contract_id);

    client.set_limits(&5, &50);
}
