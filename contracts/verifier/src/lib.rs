#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr, BN254_G1_SERIALIZED_SIZE, BN254_G2_SERIALIZED_SIZE},
    vec, Bytes, BytesN, Env, TryFromVal, Vec,
};

const PROOF_A_LEN: usize = BN254_G1_SERIALIZED_SIZE;
const PROOF_B_LEN: usize = BN254_G2_SERIALIZED_SIZE;
const CIRCUIT_PUBLIC_INPUT_COUNT: u32 = 1;
const EXPECTED_PUBLIC_INPUT_COUNT: u32 = CIRCUIT_PUBLIC_INPUT_COUNT + 1;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    ProofExpired = 1,
}

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

#[contract]
pub struct VerifierContract;

#[contractimpl]
impl VerifierContract {
    pub fn verify_proof(
        env: Env,
        proof_a: Bytes,
        proof_b: Bytes,
        proof_c: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, Error> {
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

        if env.ledger().sequence() > expiry_ledger {
            return Err(Error::ProofExpired);
        }

        let vk_alpha = Bn254G1Affine::from_array(&env, &VK_ALPHA_G1);
        let vk_beta = Bn254G2Affine::from_array(&env, &VK_BETA_G2);
        let vk_gamma = Bn254G2Affine::from_array(&env, &VK_GAMMA_G2);
        let vk_delta = Bn254G2Affine::from_array(&env, &VK_DELTA_G2);
        let vk_ic0 = Bn254G1Affine::from_array(&env, &VK_IC0_G1);
        let vk_ic1 = Bn254G1Affine::from_array(&env, &VK_IC1_G1);

        let public_input = Fr::from_bytes(public_inputs.get(0).unwrap());
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
mod tests {
    use super::*;
    use soroban_sdk::testutils::Ledger as _;

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

    fn client() -> (Env, VerifierContractClient<'static>) {
        let env = Env::default();
        let contract_id = env.register(VerifierContract, ());
        let client = VerifierContractClient::new(&env, &contract_id);
        (env, client)
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

    fn set_ledger(env: &Env, sequence: u32) {
        env.ledger().with_mut(|li| {
            li.sequence_number = sequence;
        });
    }

    #[test]
    fn verify_proof_returns_true_for_valid_unexpired_proof() {
        let (env, client) = client();
        set_ledger(&env, 100);

        let result = client.verify_proof(
            &Bytes::from_array(&env, &VALID_PROOF_A),
            &Bytes::from_array(&env, &VALID_PROOF_B),
            &Bytes::from_array(&env, &VALID_PROOF_C),
            &public_inputs_with_expiry(&env, 1000),
        );

        assert!(result);
    }

    #[test]
    fn verify_proof_rejects_expired_proof() {
        let (env, client) = client();
        set_ledger(&env, 100);

        let result = client.try_verify_proof(
            &Bytes::from_array(&env, &VALID_PROOF_A),
            &Bytes::from_array(&env, &VALID_PROOF_B),
            &Bytes::from_array(&env, &VALID_PROOF_C),
            &public_inputs_with_expiry(&env, 50),
        );

        assert_eq!(result, Err(Ok(Error::ProofExpired)));
    }

    #[test]
    fn verify_proof_accepts_expiry_at_exactly_current_ledger() {
        let (env, client) = client();
        set_ledger(&env, 100);

        let result = client.verify_proof(
            &Bytes::from_array(&env, &VALID_PROOF_A),
            &Bytes::from_array(&env, &VALID_PROOF_B),
            &Bytes::from_array(&env, &VALID_PROOF_C),
            &public_inputs_with_expiry(&env, 100),
        );

        assert!(result);
    }

    #[test]
    fn verify_proof_returns_false_for_tampered_proof_a() {
        let (env, client) = client();
        set_ledger(&env, 100);
        let tampered = (-Bn254G1Affine::from_array(&env, &VALID_PROOF_A)).to_array();

        let result = client.verify_proof(
            &Bytes::from_array(&env, &tampered),
            &Bytes::from_array(&env, &VALID_PROOF_B),
            &Bytes::from_array(&env, &VALID_PROOF_C),
            &public_inputs_with_expiry(&env, 1000),
        );

        assert!(!result);
    }

    #[test]
    fn verify_proof_returns_false_for_wrong_public_input_count() {
        let (env, client) = client();
        set_ledger(&env, 100);
        let only_commitment = vec![&env, BytesN::from_array(&env, &VALID_PUBLIC_INPUT)];

        let result = client.verify_proof(
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
        let (env, client) = client();
        set_ledger(&env, 100);

        let proof_a = Bytes::from_array(&env, &[0; 63]);
        client.verify_proof(
            &proof_a,
            &Bytes::from_array(&env, &VALID_PROOF_B),
            &Bytes::from_array(&env, &VALID_PROOF_C),
            &public_inputs_with_expiry(&env, 1000),
        );
    }
}
