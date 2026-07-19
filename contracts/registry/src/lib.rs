#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine, BN254_G1_SERIALIZED_SIZE, BN254_G2_SERIALIZED_SIZE},
    vec, Address, Bytes, BytesN, Env, TryFromVal, Vec,
};

const PROOF_A_LEN: usize = BN254_G1_SERIALIZED_SIZE;
const PROOF_B_LEN: usize = BN254_G2_SERIALIZED_SIZE;

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
enum DataKey {
    Admin,
    Circuit(u32),
}

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("registry is not initialized")
    }

    pub fn register_circuit(env: Env, id: u32, vk: VerifyingKey) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("registry is not initialized");
        admin.require_auth();

        env.storage().persistent().set(&DataKey::Circuit(id), &vk);
    }

    pub fn has_circuit(env: Env, id: u32) -> bool {
        env.storage().persistent().has(&DataKey::Circuit(id))
    }

    pub fn verify_proof(
        env: Env,
        id: u32,
        proof_a: Bytes,
        proof_b: Bytes,
        proof_c: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        let vk: VerifyingKey = match env.storage().persistent().get(&DataKey::Circuit(id)) {
            Some(vk) => vk,
            None => return false,
        };

        if public_inputs.len() + 1 != vk.ic.len() {
            return false;
        }

        let proof_a = read_g1(&env, &proof_a, "proof_a");
        let proof_b = read_g2(&env, &proof_b, "proof_b");
        let proof_c = read_g1(&env, &proof_c, "proof_c");

        let vk_alpha = Bn254G1Affine::from_bytes(vk.alpha);
        let vk_beta = Bn254G2Affine::from_bytes(vk.beta);
        let vk_gamma = Bn254G2Affine::from_bytes(vk.gamma);
        let vk_delta = Bn254G2Affine::from_bytes(vk.delta);

        let mut vk_x = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
        for i in 0..public_inputs.len() {
            let input = Bn254Fr::from_bytes(public_inputs.get(i).unwrap());
            let ic = Bn254G1Affine::from_bytes(vk.ic.get(i + 1).unwrap());
            vk_x = vk_x + (ic * input);
        }

        env.crypto().bn254().pairing_check(
            vec![&env, proof_a, -vk_alpha, -vk_x, -proof_c],
            vec![&env, proof_b, vk_beta, vk_gamma, vk_delta],
        )
    }
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
