#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine, BN254_G1_SERIALIZED_SIZE, BN254_G2_SERIALIZED_SIZE},
    vec, Address, Bytes, BytesN, Env, TryFromVal, Vec,
};

const PROOF_A_LEN: usize = BN254_G1_SERIALIZED_SIZE;
const PROOF_B_LEN: usize = BN254_G2_SERIALIZED_SIZE;
const CIRCUIT_PUBLIC_INPUT_COUNT: u32 = 1;
const EXPECTED_PUBLIC_INPUT_COUNT: u32 = CIRCUIT_PUBLIC_INPUT_COUNT + 1;

const VK_ALPHA_G1: [u8; PROOF_A_LEN] = [
    37, 174, 162, 190, 147, 137, 161, 46, 208, 40, 205, 226, 35, 65, 40, 44, 27, 28, 154, 20, 14,
    58, 206, 243, 150, 37, 97, 176, 235, 29, 70, 139, 31, 142, 73, 125, 220, 208, 55, 78, 173,
    173, 137, 157, 225, 191, 157, 158, 114, 100, 108, 79, 210, 25, 48, 31, 197, 192, 156, 46,
    171, 152, 229, 95,
];

const VK_BETA_G2: [u8; PROOF_B_LEN] = [
    16, 192, 41, 89, 225, 138, 98, 99, 126, 10, 17, 115, 189, 205, 208, 100, 144, 178, 104, 213,
    204, 186, 176, 7, 121, 123, 72, 37, 204, 63, 176, 252, 3, 140, 21, 18, 253, 163, 204, 42,
    212, 230, 81, 138, 188, 135, 93, 67, 90, 44, 33, 135, 25, 165, 93, 183, 212, 179, 30, 8, 8,
    211, 163, 195, 41, 211, 246, 214, 39, 241, 146, 1, 159, 19, 227, 209, 71, 86, 208, 245, 123,
    226, 249, 207, 175, 129, 207, 140, 152, 64, 207, 168, 184, 182, 65, 48, 36, 103, 94, 218, 64,
    127, 63, 69, 90, 209, 120, 139, 128, 240, 117, 187, 108, 187, 250, 62, 162, 205, 134, 52, 210,
    194, 91, 79, 139, 106, 240, 246,
];

const VK_GAMMA_G2: [u8; PROOF_B_LEN] = [
    25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73, 51, 53,
    169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31, 30, 118, 66,
    106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70, 222, 189, 92, 217,
    146, 246, 237, 9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173, 105, 12, 51, 149, 188,
    75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151, 91, 18, 200, 94, 165, 219,
    140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143, 227, 209, 231, 105, 12, 67, 211, 123, 76,
    230, 204, 1, 102, 250, 125, 170,
];

const VK_DELTA_G2: [u8; PROOF_B_LEN] = [
    30, 191, 14, 99, 80, 96, 169, 248, 115, 42, 4, 232, 241, 172, 231, 11, 209, 255, 181, 66,
    226, 81, 114, 203, 9, 17, 245, 14, 21, 47, 108, 131, 15, 248, 194, 120, 215, 200, 221, 17,
    228, 29, 179, 208, 106, 116, 75, 141, 105, 71, 58, 219, 87, 21, 148, 114, 143, 19, 198, 219,
    143, 144, 108, 56, 15, 37, 69, 95, 78, 156, 17, 210, 113, 53, 223, 118, 131, 56, 26, 36, 122,
    22, 151, 118, 241, 78, 236, 218, 93, 11, 9, 244, 103, 165, 60, 68, 32, 134, 231, 54, 45, 60,
    153, 212, 159, 226, 92, 108, 13, 26, 210, 168, 196, 162, 240, 251, 27, 28, 214, 57, 40, 193,
    243, 211, 56, 95, 104, 255,
];

const VK_IC0_G1: [u8; PROOF_A_LEN] = [
    26, 87, 61, 103, 214, 216, 157, 137, 212, 69, 128, 237, 186, 96, 209, 103, 5, 192, 250, 53,
    143, 250, 58, 172, 43, 103, 8, 35, 102, 252, 118, 220, 34, 5, 29, 156, 107, 195, 217, 202, 19,
    76, 0, 7, 57, 7, 69, 159, 147, 101, 66, 84, 42, 223, 15, 201, 229, 15, 76, 155, 15, 63, 153,
    23,
];

const VK_IC1_G1: [u8; PROOF_A_LEN] = [
    14, 175, 26, 53, 220, 82, 18, 65, 43, 24, 73, 28, 169, 83, 160, 86, 59, 171, 175, 121, 78,
    151, 209, 220, 243, 234, 179, 65, 226, 63, 53, 247, 14, 78, 72, 228, 67, 167, 115, 92, 178,
    191, 32, 181, 102, 213, 116, 121, 173, 179, 91, 210, 78, 87, 214, 86, 119, 251, 37, 166, 188,
    55, 49, 89,
];

#[contracttype]
#[derive(Clone)]
pub struct Limits {
    pub max_calls: u32,
    pub window_size: u32,
}

#[contracttype]
enum DataKey {
    Admin,
    Limits,
    CallCount(Address, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    RateLimitExceeded = 2,
    InvalidWindowSize = 3,
    ProofExpired = 4,
}

#[contract]
pub struct VerifierContract;

#[contractimpl]
impl VerifierContract {
    pub fn __constructor(env: Env, admin: Address, max_calls: u32, window_size: u32) {
        assert!(window_size > 0, "window_size must be positive");
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Limits, &Limits { max_calls, window_size });
    }

    pub fn limits(env: Env) -> Limits {
        env.storage()
            .instance()
            .get(&DataKey::Limits)
            .expect("contract is not initialized")
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

    pub fn verify_proof(
        env: Env,
        caller: Address,
        proof_a: Bytes,
        proof_b: Bytes,
        proof_c: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, Error> {
        caller.require_auth();

        let limits: Limits = env
            .storage()
            .instance()
            .get(&DataKey::Limits)
            .ok_or(Error::NotInitialized)?;

        let ledger = env.ledger().sequence();
        let window_start = ledger - (ledger % limits.window_size);
        let count_key = DataKey::CallCount(caller.clone(), window_start);
        let current: u32 = env.storage().instance().get(&count_key).unwrap_or(0);
        let next = current + 1;
        if next > limits.max_calls {
            return Err(Error::RateLimitExceeded);
        }
        env.storage().instance().set(&count_key, &next);

        let proof_a = read_g1(&env, &proof_a, "proof_a");
        let proof_b = read_g2(&env, &proof_b, "proof_b");
        let proof_c = read_g1(&env, &proof_c, "proof_c");

        if public_inputs.len() != EXPECTED_PUBLIC_INPUT_COUNT {
            return Ok(false);
        }

        let expiry_ledger = match read_expiry_ledger(&public_inputs.get(1).unwrap()) {
            Some(value) => value,
            None => return Ok(false),
        };

        if ledger > expiry_ledger {
            return Err(Error::ProofExpired);
        }

        let vk_alpha = Bn254G1Affine::from_array(&env, &VK_ALPHA_G1);
        let vk_beta = Bn254G2Affine::from_array(&env, &VK_BETA_G2);
        let vk_gamma = Bn254G2Affine::from_array(&env, &VK_GAMMA_G2);
        let vk_delta = Bn254G2Affine::from_array(&env, &VK_DELTA_G2);
        let vk_ic0 = Bn254G1Affine::from_array(&env, &VK_IC0_G1);
        let vk_ic1 = Bn254G1Affine::from_array(&env, &VK_IC1_G1);

        let public_input = Bn254Fr::from_bytes(public_inputs.get(0).unwrap());
        let vk_x = vk_ic0 + (vk_ic1 * public_input);

        let verified = env.crypto().bn254().pairing_check(
            vec![&env, proof_a, -vk_alpha, -vk_x, -proof_c],
            vec![&env, proof_b, vk_beta, vk_gamma, vk_delta],
        );

        Ok(verified)
    }
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
