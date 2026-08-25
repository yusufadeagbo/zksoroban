extern crate std;

use super::*;
use soroban_sdk::testutils::storage::Temporary as _;
use soroban_sdk::testutils::{Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{vec, Address, Bytes, BytesN, Env, Event as _, IntoVal, String, Vec};

const VK_ALPHA_G1: [u8; 64] = [
    37, 174, 162, 190, 147, 137, 161, 46, 208, 40, 205, 226, 35, 65, 40, 44, 27, 28, 154, 20, 14,
    58, 206, 243, 150, 37, 97, 176, 235, 29, 70, 139, 31, 142, 73, 125, 220, 208, 55, 78, 173,
    173, 137, 157, 225, 191, 157, 158, 114, 100, 108, 79, 210, 25, 48, 31, 197, 192, 156, 46,
    171, 152, 229, 95,
];

const VK_BETA_G2: [u8; 128] = [
    16, 192, 41, 89, 225, 138, 98, 99, 126, 10, 17, 115, 189, 205, 208, 100, 144, 178, 104, 213,
    204, 186, 176, 7, 121, 123, 72, 37, 204, 63, 176, 252, 3, 140, 21, 18, 253, 163, 204, 42,
    212, 230, 81, 138, 188, 135, 93, 67, 90, 44, 33, 135, 25, 165, 93, 183, 212, 179, 30, 8, 8,
    211, 163, 195, 41, 211, 246, 214, 39, 241, 146, 1, 159, 19, 227, 209, 71, 86, 208, 245, 123,
    226, 249, 207, 175, 129, 207, 140, 152, 64, 207, 168, 184, 182, 65, 48, 36, 103, 94, 218, 64,
    127, 63, 69, 90, 209, 120, 139, 128, 240, 117, 187, 108, 187, 250, 62, 162, 205, 134, 52, 210,
    194, 91, 79, 139, 106, 240, 246,
];

const VK_GAMMA_G2: [u8; 128] = [
    25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73, 51, 53,
    169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31, 30, 118, 66,
    106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70, 222, 189, 92, 217,
    146, 246, 237, 9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173, 105, 12, 51, 149, 188,
    75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151, 91, 18, 200, 94, 165, 219,
    140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143, 227, 209, 231, 105, 12, 67, 211, 123, 76,
    230, 204, 1, 102, 250, 125, 170,
];

const VK_DELTA_G2: [u8; 128] = [
    30, 191, 14, 99, 80, 96, 169, 248, 115, 42, 4, 232, 241, 172, 231, 11, 209, 255, 181, 66,
    226, 81, 114, 203, 9, 17, 245, 14, 21, 47, 108, 131, 15, 248, 194, 120, 215, 200, 221, 17,
    228, 29, 179, 208, 106, 116, 75, 141, 105, 71, 58, 219, 87, 21, 148, 114, 143, 19, 198, 219,
    143, 144, 108, 56, 15, 37, 69, 95, 78, 156, 17, 210, 113, 53, 223, 118, 131, 56, 26, 36, 122,
    22, 151, 118, 241, 78, 236, 218, 93, 11, 9, 244, 103, 165, 60, 68, 32, 134, 231, 54, 45, 60,
    153, 212, 159, 226, 92, 108, 13, 26, 210, 168, 196, 162, 240, 251, 27, 28, 214, 57, 40, 193,
    243, 211, 56, 95, 104, 255,
];

const VK_IC0_G1: [u8; 64] = [
    26, 87, 61, 103, 214, 216, 157, 137, 212, 69, 128, 237, 186, 96, 209, 103, 5, 192, 250, 53,
    143, 250, 58, 172, 43, 103, 8, 35, 102, 252, 118, 220, 34, 5, 29, 156, 107, 195, 217, 202, 19,
    76, 0, 7, 57, 7, 69, 159, 147, 101, 66, 84, 42, 223, 15, 201, 229, 15, 76, 155, 15, 63, 153,
    23,
];

const VK_IC1_G1: [u8; 64] = [
    14, 175, 26, 53, 220, 82, 18, 65, 43, 24, 73, 28, 169, 83, 160, 86, 59, 171, 175, 121, 78,
    151, 209, 220, 243, 234, 179, 65, 226, 63, 53, 247, 14, 78, 72, 228, 67, 167, 115, 92, 178,
    191, 32, 181, 102, 213, 116, 121, 173, 179, 91, 210, 78, 87, 214, 86, 119, 251, 37, 166, 188,
    55, 49, 89,
];

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

fn poseidon_vk(env: &Env) -> VerifyingKey {
    VerifyingKey {
        alpha: BytesN::from_array(env, &VK_ALPHA_G1),
        beta: BytesN::from_array(env, &VK_BETA_G2),
        gamma: BytesN::from_array(env, &VK_GAMMA_G2),
        delta: BytesN::from_array(env, &VK_DELTA_G2),
        ic: vec![
            env,
            BytesN::from_array(env, &VK_IC0_G1),
            BytesN::from_array(env, &VK_IC1_G1),
        ],
    }
}

fn setup(max_calls: u32, window_size: u32) -> (Env, Address, VerifierContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin.clone(), max_calls, window_size, vk));
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
fn call_count_lives_in_temporary_storage_with_window_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 50u32, vk));
    let client = VerifierContractClient::new(&env, &contract_id);
    let caller = Address::generate(&env);

    assert!(call_valid(&env, &client, &caller));

    let ledger = env.ledger().sequence();
    let window_start = ledger - (ledger % 50u32);
    let count_key = DataKey::CallCount(caller, window_start);

    env.as_contract(&contract_id, || {
        assert!(!env.storage().instance().has(&count_key));
        assert!(env.storage().temporary().has(&count_key));
        assert!(env.storage().temporary().get_ttl(&count_key) >= 50u32);
    });
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

#[test]
fn get_config_returns_initialized_values() {
    let (env, admin, client) = setup(7, 42);

    let config = client.get_config();

    // Admin matches what was passed to __constructor.
    assert_eq!(config.admin, admin);
    // Rate-limit fields reflect the constructor arguments.
    assert_eq!(config.rate_limit_max, 7);
    assert_eq!(config.rate_limit_window, 42);
    // Unimplemented features are zero-valued / absent.
    assert!(!config.paused);
    assert!(config.fee_amount.is_none());
    assert!(config.fee_token.is_none());
    assert!(config.timelock_delay.is_none());
    // Allowlisting is implemented but off by default until enabled.
    assert!(!config.allowlist_enabled);
}

#[test]
fn get_config_reflects_updated_limits() {
    let (_env, _admin, client) = setup(1, 10);

    client.set_limits(&20, &200);

    let config = client.get_config();
    assert_eq!(config.rate_limit_max, 20);
    assert_eq!(config.rate_limit_window, 200);
}

#[test]
fn get_config_reflects_allowlist_mode() {
    let (_env, _admin, client) = setup(1, 10);

    assert!(!client.get_config().allowlist_enabled);

    client.set_allowlist_mode(&true);
    assert!(client.get_config().allowlist_enabled);

    client.set_allowlist_mode(&false);
    assert!(!client.get_config().allowlist_enabled);
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
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32, vk));
    let client = VerifierContractClient::new(&env, &contract_id);
    let caller = Address::generate(&env);

    call_valid(&env, &client, &caller);
}

#[test]
#[should_panic]
fn set_limits_rejects_call_with_no_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32, vk));
    let client = VerifierContractClient::new(&env, &contract_id);

    client.set_limits(&5, &50);
}

#[test]
fn disabled_mode_allows_anyone() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);

    assert!(!client.allowlist_enabled());
    assert!(call_valid(&env, &client, &caller));
}

#[test]
fn enabled_mode_blocks_unlisted_caller() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);

    client.set_allowlist_mode(&true);
    assert!(client.allowlist_enabled());
    assert!(!client.is_allowlisted(&caller));

    let result = client.try_verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, u32::MAX),
    );

    assert_eq!(result, Err(Ok(Error::CallerNotAllowed)));
}

#[test]
fn listed_caller_succeeds_when_allowlist_enabled() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);

    client.set_allowlist_mode(&true);
    client.add_to_allowlist(&caller);
    assert!(client.is_allowlisted(&caller));

    assert!(call_valid(&env, &client, &caller));

    client.remove_from_allowlist(&caller);
    assert!(!client.is_allowlisted(&caller));

    let result = client.try_verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, u32::MAX),
    );

    assert_eq!(result, Err(Ok(Error::CallerNotAllowed)));
}

#[test]
#[should_panic]
fn set_allowlist_mode_rejects_call_with_no_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32, vk));
    let client = VerifierContractClient::new(&env, &contract_id);

    client.set_allowlist_mode(&true);
}

#[test]
#[should_panic]
fn add_to_allowlist_rejects_call_with_no_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32, vk));
    let client = VerifierContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    client.add_to_allowlist(&user);
}

#[test]
#[should_panic]
fn remove_from_allowlist_rejects_call_with_no_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32, vk));
    let client = VerifierContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    client.remove_from_allowlist(&user);
}

// The verify_proof tests above already exercise the storage-backed VK
// path implicitly (there are no more compile-time VK constants to fall
// back to). These two tests exercise update_vk directly: that a fresh
// key actually takes effect, and that only the admin can install one.

#[test]
fn admin_can_update_vk_and_verification_still_works_with_it() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);

    // Re-registering the same known-good key is enough to prove the
    // contract is reading whatever update_vk last stored, not a
    // leftover compile-time value — there is no compile-time value left
    // to fall back to.
    client.update_vk(&poseidon_vk(&env));

    let caller = Address::generate(&env);
    assert!(call_with_expiry(&env, &client, &caller, 1000));
}

#[test]
fn update_vk_rejects_wrong_ic_length() {
    let (env, _admin, client) = setup(10, 100);

    let bad_vk = VerifyingKey {
        alpha: BytesN::from_array(&env, &VK_ALPHA_G1),
        beta: BytesN::from_array(&env, &VK_BETA_G2),
        gamma: BytesN::from_array(&env, &VK_GAMMA_G2),
        delta: BytesN::from_array(&env, &VK_DELTA_G2),
        ic: vec![&env, BytesN::from_array(&env, &VK_IC0_G1)],
    };

    let result = client.try_update_vk(&bad_vk);
    assert_eq!(result, Err(Ok(Error::InvalidVerifyingKey)));
}

#[test]
#[should_panic]
fn update_vk_rejects_call_with_no_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let vk = poseidon_vk(&env);
    let contract_id = env.register(VerifierContract, (admin, 10u32, 100u32, vk));
    let client = VerifierContractClient::new(&env, &contract_id);

    client.update_vk(&poseidon_vk(&env));
}

// verification_result event coverage: one test per outcome path that
// actually returns via Ok(...) — wrong input count, malformed expiry
// encoding (folded into the tampered/wrong-input tests below since there's
// no dedicated helper to construct that byte pattern), and the pairing
// check result itself. The allowlist/rate-limit/expiry rejections return
// Err(...) and are deliberately NOT covered here: Soroban rolls back any
// event published during a call that returns Err from a #[contracterror]
// Result, so publishing on those paths would be dead code. See
// verify_proof_emits_no_event_on_err_rejection below for the negative case,
// and docs/architecture.md for the full writeup.

fn expected_inputs_hash(env: &Env, public_inputs: &Vec<BytesN<32>>) -> BytesN<32> {
    let mut bytes = Bytes::new(env);
    for input in public_inputs.iter() {
        bytes.append(&Bytes::from(&input));
    }
    env.crypto().sha256(&bytes).to_bytes()
}

fn assert_single_verification_event(
    env: &Env,
    contract_id: &Address,
    caller: &Address,
    success: bool,
    public_inputs: &Vec<BytesN<32>>,
) {
    let expected = VerificationResult {
        success,
        caller: caller.clone(),
        inputs_hash: expected_inputs_hash(env, public_inputs),
    };
    assert_eq!(
        env.events().all(),
        vec![
            env,
            (contract_id.clone(), expected.topics(env), expected.data(env)),
        ]
    );
}

#[test]
fn verify_proof_emits_event_on_pairing_success() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);
    let public_inputs = public_inputs_with_expiry(&env, 1000);

    let result = client.verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs,
    );
    assert!(result);

    assert_single_verification_event(&env, &client.address, &caller, true, &public_inputs);
}

#[test]
fn verify_proof_emits_event_on_pairing_failure() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);
    let tampered = (-Bn254G1Affine::from_array(&env, &VALID_PROOF_A)).to_array();
    let public_inputs = public_inputs_with_expiry(&env, 1000);

    let result = client.verify_proof(
        &caller,
        &Bytes::from_array(&env, &tampered),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs,
    );
    assert!(!result);

    assert_single_verification_event(&env, &client.address, &caller, false, &public_inputs);
}

#[test]
fn verify_proof_emits_event_on_wrong_public_input_count() {
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

    assert_single_verification_event(&env, &client.address, &caller, false, &only_commitment);
}

#[test]
fn verify_proof_emits_no_event_on_err_rejection() {
    let (env, _admin, client) = setup(10, 100);
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let caller = Address::generate(&env);

    client.set_allowlist_mode(&true);

    let result = client.try_verify_proof(
        &caller,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs_with_expiry(&env, u32::MAX),
    );
    assert_eq!(result, Err(Ok(Error::CallerNotAllowed)));

    assert!(env.events().all().events().is_empty());
}

// Two-step admin transfer and upgrade (#12).

#[test]
fn admin_ownership_handoff_succeeds() {
    let (env, _admin, client) = setup(10, 100);
    let new_admin = Address::generate(&env);

    client.propose_admin(&new_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    client.accept_admin();
    assert_eq!(client.pending_admin(), None);
    assert_eq!(client.get_config().admin, new_admin);
}

#[test]
fn propose_admin_rejects_non_admin_caller() {
    let (env, _admin, client) = setup(10, 100);
    let attacker = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "propose_admin",
                args: (&new_admin,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_propose_admin(&new_admin);

    assert!(result.is_err());
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn accept_admin_rejects_non_pending_admin_caller() {
    let (env, _admin, client) = setup(10, 100);
    let new_admin = Address::generate(&env);
    let attacker = Address::generate(&env);

    client.propose_admin(&new_admin);

    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "accept_admin",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_accept_admin();

    assert!(result.is_err());
    assert_eq!(client.pending_admin(), Some(new_admin));
}

#[test]
fn accept_admin_fails_without_pending_admin() {
    let (_env, _admin, client) = setup(10, 100);

    let result = client.try_accept_admin();
    assert_eq!(result, Err(Ok(Error::NoPendingAdmin)));
}

#[test]
fn upgrade_succeeds_for_admin() {
    let (env, _admin, client) = setup(10, 100);
    let wasm_hash = env.deployer().upload_contract_wasm(Bytes::new(&env));

    client.upgrade(&wasm_hash);
}

#[test]
fn upgrade_rejects_non_admin_caller() {
    let (env, _admin, client) = setup(10, 100);
    let attacker = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(Bytes::new(&env));

    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "upgrade",
                args: (&wasm_hash,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_upgrade(&wasm_hash);

    assert!(result.is_err());
}
