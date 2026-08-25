extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Events as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{vec, Address, Bytes, BytesN, Env, Event as _, IntoVal, Vec};

const POSEIDON_CIRCUIT_ID: u32 = 1;
const RANGE_PROOF_CIRCUIT_ID: u32 = 2;
const THRESHOLD_2OF3_CIRCUIT_ID: u32 = 3;
const MERKLE_INCLUSION_CIRCUIT_ID: u32 = 4;
const UNKNOWN_CIRCUIT_ID: u32 = 999;

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

const VALID_PROOF_A: [u8; 64] = [
    28, 159, 72, 150, 222, 218, 126, 226, 53, 93, 4, 80, 73, 92, 40, 120, 36, 194, 215, 167,
    39, 53, 38, 203, 78, 55, 154, 43, 183, 51, 27, 239, 39, 116, 225, 204, 223, 113, 45, 75,
    145, 63, 162, 251, 115, 169, 233, 211, 196, 17, 50, 95, 10, 96, 100, 87, 103, 45, 222,
    46, 22, 79, 236, 207,
];

const VALID_PROOF_B: [u8; 128] = [
    1, 42, 5, 66, 163, 235, 37, 249, 221, 59, 28, 26, 28, 141, 222, 136, 44, 125, 57, 205, 174,
    171, 120, 158, 215, 5, 37, 152, 128, 47, 109, 179, 10, 195, 151, 7, 203, 209, 91, 29, 216,
    105, 99, 216, 134, 57, 249, 38, 63, 28, 61, 16, 237, 176, 106, 59, 106, 127, 132, 150,
    173, 249, 24, 39, 37, 42, 7, 245, 29, 242, 177, 182, 170, 101, 22, 47, 23, 147, 59, 250,
    162, 36, 95, 66, 122, 2, 75, 26, 188, 118, 101, 74, 47, 193, 255, 168, 11, 116, 62, 79, 44,
    18, 181, 195, 110, 255, 73, 31, 99, 67, 197, 43, 29, 151, 157, 210, 34, 247, 134, 38, 31,
    23, 4, 3, 49, 77, 27, 13,
];

const VALID_PROOF_C: [u8; 64] = [
    17, 201, 219, 26, 68, 41, 61, 217, 55, 131, 157, 11, 39, 31, 149, 251, 231, 172, 120, 223,
    35, 49, 86, 11, 238, 214, 162, 152, 3, 170, 201, 25, 12, 55, 128, 235, 89, 16, 108, 55,
    145, 211, 153, 105, 252, 163, 82, 244, 31, 20, 102, 144, 205, 165, 13, 28, 60, 128, 197,
    222, 246, 69, 1, 222,
];

const VALID_PUBLIC_INPUT: [u8; 32] = [
    41, 23, 97, 0, 234, 169, 98, 189, 193, 254, 108, 101, 77, 106, 60, 19, 14, 150, 164, 209,
    22, 139, 51, 132, 139, 137, 125, 197, 2, 130, 1, 51,
];

const RANGE_PROOF_VK_ALPHA_G1: [u8; 64] = [
    20, 220, 119, 191, 159, 61, 10, 115, 102, 219, 42, 209, 13, 102, 133, 89, 36, 195, 81, 137,
    37, 231, 55, 98, 181, 72, 218, 129, 211, 24, 70, 63, 21, 60, 134, 47, 176, 88, 97, 215,
    162, 218, 80, 60, 28, 1, 109, 9, 158, 182, 81, 106, 184, 48, 160, 25, 123, 178, 109, 17,
    142, 74, 73, 144,
];

const RANGE_PROOF_VK_BETA_G2: [u8; 128] = [
    10, 155, 226, 210, 153, 67, 138, 149, 217, 131, 131, 73, 198, 102, 42, 99, 135, 242, 203, 115,
    208, 248, 133, 158, 54, 208, 107, 241, 83, 24, 188, 102, 36, 33, 232, 219, 3, 45, 250, 142,
    163, 31, 132, 37, 192, 71, 175, 72, 3, 48, 14, 16, 228, 75, 46, 155, 72, 175, 24, 171,
    136, 204, 231, 155, 39, 241, 163, 16, 76, 27, 96, 139, 40, 104, 203, 21, 0, 252, 9, 82,
    64, 172, 39, 236, 35, 11, 114, 232, 39, 76, 49, 60, 24, 47, 138, 158, 20, 143, 22, 110,
    15, 93, 237, 82, 34, 180, 75, 53, 29, 44, 62, 48, 117, 241, 230, 118, 49, 49, 171, 147,
    9, 247, 112, 93, 184, 250, 47, 148,
];

const RANGE_PROOF_VK_GAMMA_G2: [u8; 128] = [
    25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73, 51,
    53, 169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31, 30, 118,
    66, 106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70, 222, 189, 92,
    217, 146, 246, 237, 9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173, 105, 12, 51, 149,
    188, 75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151, 91, 18, 200, 94, 165,
    219, 140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143, 227, 209, 231, 105, 12, 67, 211, 123,
    76, 230, 204, 1, 102, 250, 125, 170,
];

const RANGE_PROOF_VK_DELTA_G2: [u8; 128] = [
    41, 1, 249, 231, 76, 164, 142, 69, 207, 119, 143, 152, 170, 69, 228, 107, 105, 173, 162, 174,
    13, 215, 129, 105, 168, 235, 110, 206, 214, 252, 93, 62, 22, 126, 136, 244, 242, 6, 220, 43,
    134, 38, 167, 187, 139, 246, 187, 150, 200, 180, 152, 205, 196, 43, 3, 17, 36, 183, 32, 44,
    189, 93, 44, 110, 13, 19, 185, 61, 89, 26, 91, 173, 74, 97, 156, 165, 211, 198, 28, 221,
    192, 140, 227, 31, 138, 185, 179, 114, 12, 36, 30, 8, 217, 130, 52, 247, 30, 252, 173, 157,
    211, 235, 252, 25, 159, 17, 25, 160, 111, 67, 162, 188, 99, 11, 45, 170, 6, 92, 24, 82,
    6, 120, 117, 146, 186, 44, 241, 213,
];

const RANGE_PROOF_VK_IC0_G1: [u8; 64] = [
    23, 112, 110, 107, 190, 96, 204, 188, 208, 47, 118, 136, 76, 234, 4, 149, 197, 133, 76, 203,
    166, 178, 166, 190, 245, 60, 79, 183, 83, 175, 231, 1, 36, 195, 90, 236, 234, 121, 215, 102,
    45, 93, 85, 134, 94, 108, 243, 98, 99, 112, 218, 120, 46, 31, 215, 123, 67, 206, 252, 43,
    61, 34, 32, 2,
];

const RANGE_PROOF_VK_IC1_G1: [u8; 64] = [
    23, 74, 12, 163, 218, 90, 128, 54, 169, 85, 1, 116, 171, 146, 128, 226, 207, 211, 47, 148,
    60, 205, 157, 47, 180, 143, 73, 107, 43, 94, 29, 78, 14, 1, 206, 122, 171, 62, 7, 176,
    83, 225, 142, 169, 253, 18, 235, 171, 25, 180, 230, 162, 73, 101, 110, 211, 7, 110, 139, 195,
    80, 62, 8, 245,
];

const RANGE_PROOF_VK_IC2_G1: [u8; 64] = [
    44, 208, 195, 186, 75, 36, 78, 19, 15, 98, 192, 57, 184, 18, 134, 193, 214, 61, 149, 60,
    36, 46, 200, 194, 203, 140, 169, 163, 68, 161, 116, 21, 44, 130, 131, 215, 74, 89, 113, 193,
    194, 23, 9, 160, 47, 110, 192, 11, 95, 248, 59, 174, 239, 208, 76, 96, 249, 36, 73, 131,
    5, 251, 157, 110,
];

const RANGE_PROOF_VK_IC3_G1: [u8; 64] = [
    39, 134, 203, 39, 96, 182, 76, 99, 53, 114, 133, 235, 19, 253, 128, 219, 197, 139, 194, 170,
    109, 123, 61, 23, 238, 10, 36, 237, 80, 81, 224, 213, 12, 142, 0, 242, 186, 83, 197, 197,
    229, 143, 255, 14, 177, 112, 82, 250, 151, 220, 107, 152, 156, 24, 128, 44, 86, 56, 57, 78,
    114, 219, 15, 251,
];

const RANGE_PROOF_PROOF_A: [u8; 64] = [
    1, 187, 165, 223, 62, 242, 35, 207, 39, 211, 160, 70, 216, 77, 227, 33, 37, 174, 254, 46,
    78, 21, 252, 196, 179, 203, 247, 102, 163, 205, 197, 5, 37, 245, 208, 129, 134, 160, 168, 117,
    113, 13, 77, 72, 41, 151, 28, 220, 74, 48, 151, 210, 118, 164, 231, 52, 58, 19, 224, 128,
    17, 206, 215, 107,
];

const RANGE_PROOF_PROOF_B: [u8; 128] = [
    3, 148, 244, 39, 38, 229, 36, 235, 92, 212, 171, 239, 170, 209, 252, 226, 183, 31, 209, 66,
    118, 87, 4, 240, 128, 161, 92, 148, 225, 48, 61, 37, 18, 152, 143, 205, 71, 34, 159, 21,
    219, 64, 106, 86, 22, 188, 246, 95, 88, 34, 70, 224, 51, 33, 122, 150, 146, 42, 72, 72,
    255, 84, 125, 222, 24, 57, 232, 161, 235, 108, 146, 155, 116, 34, 21, 100, 238, 72, 163, 157,
    18, 188, 76, 164, 128, 163, 240, 179, 184, 170, 36, 72, 117, 56, 181, 102, 10, 22, 213, 176,
    155, 20, 59, 93, 206, 76, 62, 201, 18, 232, 154, 200, 9, 170, 2, 171, 163, 85, 197, 119,
    133, 197, 138, 219, 202, 126, 1, 110,
];

const RANGE_PROOF_PROOF_C: [u8; 64] = [
    3, 36, 166, 201, 75, 162, 131, 93, 33, 121, 43, 199, 142, 185, 71, 19, 48, 157, 143, 243,
    24, 51, 21, 61, 52, 118, 161, 36, 172, 155, 65, 212, 12, 175, 175, 58, 180, 79, 76, 78,
    70, 134, 249, 145, 33, 239, 75, 148, 246, 46, 78, 145, 81, 74, 177, 91, 135, 249, 87, 142,
    79, 244, 187, 233,
];

const RANGE_PROOF_PUBLIC_INPUT_0: [u8; 32] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18,
];

const RANGE_PROOF_PUBLIC_INPUT_1: [u8; 32] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100,
];

const RANGE_PROOF_PUBLIC_INPUT_2: [u8; 32] = [
    28, 9, 199, 16, 41, 122, 196, 185, 239, 46, 3, 200, 230, 172, 45, 83, 223, 106, 157, 252,
    32, 242, 119, 68, 134, 8, 39, 74, 131, 192, 67, 218,
];

const THRESHOLD_2OF3_VK_ALPHA_G1: [u8; 64] = [
    38, 198, 152, 188, 125, 20, 160, 22, 67, 254, 97, 30, 43, 111, 102, 53, 47, 62, 6, 176,
    129, 53, 7, 91, 179, 187, 74, 158, 189, 151, 159, 150, 46, 63, 158, 24, 14, 89, 88, 212,
    21, 210, 28, 122, 131, 1, 85, 122, 112, 189, 237, 41, 61, 130, 160, 234, 232, 120, 237, 133,
    103, 46, 48, 182,
];

const THRESHOLD_2OF3_VK_BETA_G2: [u8; 128] = [
    39, 126, 51, 28, 14, 48, 170, 4, 74, 176, 41, 97, 59, 168, 135, 47, 37, 105, 50, 156,
    86, 255, 46, 199, 180, 59, 70, 91, 115, 97, 0, 99, 4, 36, 239, 190, 34, 203, 163, 219,
    180, 227, 86, 145, 127, 135, 156, 153, 90, 233, 67, 236, 106, 49, 208, 20, 138, 142, 229, 120,
    3, 162, 88, 162, 21, 179, 145, 92, 103, 30, 129, 127, 133, 202, 56, 51, 149, 32, 116, 118,
    221, 212, 183, 94, 21, 119, 67, 132, 7, 176, 32, 97, 172, 249, 114, 120, 22, 190, 49, 4,
    178, 64, 14, 134, 8, 17, 145, 19, 150, 185, 229, 67, 153, 26, 235, 163, 148, 99, 161, 229,
    249, 4, 228, 126, 168, 152, 251, 125,
];

const THRESHOLD_2OF3_VK_GAMMA_G2: [u8; 128] = [
    25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73, 51,
    53, 169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31, 30, 118,
    66, 106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70, 222, 189, 92,
    217, 146, 246, 237, 9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173, 105, 12, 51, 149,
    188, 75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151, 91, 18, 200, 94, 165,
    219, 140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143, 227, 209, 231, 105, 12, 67, 211, 123,
    76, 230, 204, 1, 102, 250, 125, 170,
];

const THRESHOLD_2OF3_VK_DELTA_G2: [u8; 128] = [
    29, 114, 184, 44, 64, 234, 78, 3, 238, 224, 93, 201, 228, 128, 232, 180, 91, 123, 145, 146,
    196, 12, 135, 103, 51, 0, 6, 171, 28, 177, 135, 99, 29, 93, 126, 176, 192, 19, 74, 86,
    247, 137, 253, 168, 185, 114, 246, 107, 15, 174, 126, 255, 198, 239, 42, 212, 174, 56, 206, 77,
    16, 18, 36, 112, 38, 184, 189, 191, 81, 22, 122, 32, 115, 187, 146, 228, 17, 244, 201, 143,
    99, 215, 116, 167, 219, 216, 161, 161, 83, 61, 86, 9, 140, 48, 110, 147, 10, 200, 225, 5,
    124, 207, 247, 48, 112, 52, 71, 72, 74, 200, 120, 212, 205, 77, 110, 247, 85, 148, 237, 147,
    35, 3, 29, 56, 170, 14, 230, 24,
];

const THRESHOLD_2OF3_VK_IC0_G1: [u8; 64] = [
    19, 233, 68, 213, 227, 16, 102, 206, 99, 70, 127, 16, 137, 100, 148, 167, 210, 146, 189, 110,
    167, 62, 63, 91, 53, 214, 199, 132, 94, 20, 236, 131, 45, 144, 120, 40, 89, 210, 15, 24,
    231, 180, 190, 61, 6, 151, 173, 191, 154, 45, 108, 230, 240, 50, 206, 79, 199, 219, 35, 184,
    230, 74, 85, 33,
];

const THRESHOLD_2OF3_VK_IC1_G1: [u8; 64] = [
    40, 48, 114, 9, 160, 109, 251, 95, 85, 101, 221, 27, 115, 79, 75, 213, 52, 184, 7, 40,
    218, 232, 203, 86, 225, 73, 28, 156, 65, 113, 1, 213, 15, 1, 55, 114, 196, 169, 216, 191,
    56, 47, 207, 164, 211, 39, 243, 188, 57, 182, 252, 135, 236, 72, 82, 106, 248, 103, 232, 1,
    75, 216, 241, 166,
];

const THRESHOLD_2OF3_VK_IC2_G1: [u8; 64] = [
    34, 105, 167, 149, 221, 132, 108, 71, 253, 6, 139, 178, 125, 79, 87, 68, 225, 135, 185, 239,
    80, 83, 74, 14, 53, 169, 60, 67, 116, 106, 193, 103, 45, 26, 255, 89, 141, 153, 235, 166,
    208, 181, 178, 146, 163, 168, 46, 76, 128, 240, 3, 13, 221, 133, 46, 198, 136, 156, 149, 27,
    135, 33, 167, 220,
];

const THRESHOLD_2OF3_VK_IC3_G1: [u8; 64] = [
    8, 81, 196, 96, 155, 125, 116, 204, 68, 234, 45, 204, 177, 49, 212, 109, 162, 157, 18, 225,
    253, 3, 203, 166, 124, 196, 222, 148, 31, 74, 123, 152, 17, 72, 4, 52, 244, 255, 247, 174,
    97, 23, 165, 75, 248, 222, 232, 179, 153, 25, 126, 135, 237, 25, 70, 247, 90, 62, 70, 242,
    50, 35, 225, 54,
];

const THRESHOLD_2OF3_VK_IC4_G1: [u8; 64] = [
    42, 105, 46, 1, 190, 183, 253, 99, 167, 196, 109, 233, 50, 112, 206, 210, 113, 186, 188, 19,
    93, 232, 81, 52, 94, 71, 39, 248, 77, 46, 230, 214, 41, 237, 185, 45, 7, 19, 222, 201,
    190, 164, 225, 100, 213, 163, 141, 191, 13, 80, 85, 39, 252, 48, 147, 216, 163, 71, 116, 139,
    190, 146, 205, 75,
];

const THRESHOLD_2OF3_PROOF_A: [u8; 64] = [
    39, 17, 95, 41, 7, 12, 22, 148, 75, 50, 134, 162, 183, 117, 249, 163, 46, 48, 166, 12,
    37, 240, 206, 101, 55, 152, 48, 64, 120, 74, 28, 118, 33, 37, 72, 194, 184, 140, 252, 94,
    211, 135, 121, 14, 77, 215, 211, 129, 137, 129, 137, 92, 222, 112, 60, 139, 23, 245, 164, 102,
    180, 180, 211, 41,
];

const THRESHOLD_2OF3_PROOF_B: [u8; 128] = [
    8, 66, 187, 20, 136, 91, 226, 209, 45, 21, 116, 63, 146, 89, 20, 136, 205, 123, 22, 120,
    171, 91, 118, 157, 127, 138, 244, 85, 151, 225, 72, 130, 37, 6, 53, 207, 169, 85, 12, 250,
    77, 86, 133, 118, 194, 142, 218, 230, 188, 225, 203, 24, 172, 200, 161, 22, 20, 78, 182, 55,
    215, 254, 157, 135, 46, 104, 122, 81, 219, 141, 108, 40, 82, 122, 206, 148, 88, 87, 26, 52,
    186, 96, 138, 110, 222, 220, 48, 192, 207, 73, 71, 23, 51, 205, 207, 39, 16, 233, 70, 179,
    202, 131, 181, 153, 145, 93, 13, 242, 213, 154, 202, 77, 119, 103, 149, 31, 51, 96, 134, 70,
    198, 168, 184, 14, 116, 63, 81, 241,
];

const THRESHOLD_2OF3_PROOF_C: [u8; 64] = [
    37, 195, 161, 84, 3, 182, 99, 174, 28, 198, 243, 131, 62, 188, 31, 32, 197, 212, 211, 58,
    210, 112, 33, 59, 125, 193, 16, 133, 121, 140, 3, 218, 12, 234, 69, 146, 24, 118, 226, 239,
    234, 26, 92, 230, 210, 222, 176, 166, 143, 242, 35, 187, 241, 183, 151, 252, 115, 32, 73, 128,
    85, 84, 70, 254,
];

const THRESHOLD_2OF3_PUBLIC_INPUT_0: [u8; 32] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 48, 57,
];

const THRESHOLD_2OF3_PUBLIC_INPUT_1: [u8; 32] = [
    29, 147, 119, 120, 193, 130, 93, 42, 157, 147, 27, 110, 144, 52, 64, 124, 172, 151, 37, 180,
    70, 166, 213, 122, 70, 159, 172, 135, 8, 35, 190, 142,
];

const THRESHOLD_2OF3_PUBLIC_INPUT_2: [u8; 32] = [
    7, 115, 103, 165, 8, 181, 218, 250, 254, 147, 129, 229, 210, 207, 123, 156, 33, 193, 25, 196,
    249, 26, 102, 220, 164, 144, 248, 232, 127, 120, 177, 0,
];

const THRESHOLD_2OF3_PUBLIC_INPUT_3: [u8; 32] = [
    42, 245, 124, 190, 239, 161, 6, 202, 45, 86, 171, 177, 85, 211, 255, 233, 76, 64, 222, 147,
    78, 91, 39, 44, 53, 198, 179, 167, 210, 234, 25, 29,
];

const MERKLE_INCLUSION_VK_ALPHA_G1: [u8; 64] = [
    40, 6, 153, 96, 58, 139, 243, 137, 236, 177, 89, 49, 51, 45, 27, 34, 30, 125, 165, 218,
    50, 68, 8, 0, 64, 28, 248, 152, 62, 226, 169, 252, 4, 181, 151, 193, 103, 61, 134, 158,
    33, 190, 148, 199, 173, 185, 179, 57, 160, 149, 97, 207, 36, 234, 132, 176, 140, 126, 71, 179,
    238, 67, 207, 101,
];

const MERKLE_INCLUSION_VK_BETA_G2: [u8; 128] = [
    23, 54, 141, 20, 234, 17, 75, 223, 201, 233, 89, 253, 154, 8, 162, 155, 16, 89, 123, 101,
    165, 79, 88, 66, 163, 133, 197, 175, 44, 178, 164, 69, 18, 116, 58, 120, 238, 132, 37, 174,
    86, 160, 246, 60, 230, 159, 3, 229, 64, 119, 150, 189, 1, 4, 72, 178, 81, 154, 111, 137,
    132, 12, 196, 136, 10, 17, 18, 24, 163, 210, 236, 209, 20, 84, 182, 155, 205, 109, 225, 69,
    92, 191, 157, 89, 61, 83, 149, 6, 20, 61, 72, 181, 148, 248, 242, 239, 2, 2, 212, 189,
    82, 190, 172, 37, 83, 209, 16, 119, 254, 170, 235, 145, 249, 246, 97, 174, 21, 7, 88, 34,
    70, 146, 114, 241, 108, 189, 192, 174,
];

const MERKLE_INCLUSION_VK_GAMMA_G2: [u8; 128] = [
    25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73, 51,
    53, 169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31, 30, 118,
    66, 106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70, 222, 189, 92,
    217, 146, 246, 237, 9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173, 105, 12, 51, 149,
    188, 75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151, 91, 18, 200, 94, 165,
    219, 140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143, 227, 209, 231, 105, 12, 67, 211, 123,
    76, 230, 204, 1, 102, 250, 125, 170,
];

const MERKLE_INCLUSION_VK_DELTA_G2: [u8; 128] = [
    3, 244, 138, 183, 110, 49, 36, 170, 31, 111, 197, 229, 104, 17, 16, 57, 246, 13, 36, 83,
    231, 249, 24, 252, 33, 137, 230, 57, 152, 212, 217, 145, 27, 120, 198, 146, 57, 15, 220, 186,
    21, 203, 200, 155, 32, 108, 151, 247, 238, 69, 6, 17, 235, 255, 233, 103, 88, 109, 70, 55,
    160, 94, 207, 249, 41, 206, 5, 226, 14, 43, 156, 227, 215, 50, 97, 60, 211, 148, 1, 142,
    241, 33, 113, 18, 149, 255, 165, 84, 127, 163, 84, 81, 57, 58, 200, 131, 18, 39, 100, 61,
    75, 124, 109, 62, 236, 37, 5, 178, 104, 43, 249, 187, 7, 0, 126, 44, 49, 78, 144, 199,
    218, 192, 180, 141, 171, 168, 133, 6,
];

const MERKLE_INCLUSION_VK_IC0_G1: [u8; 64] = [
    35, 30, 217, 112, 172, 107, 121, 59, 185, 93, 1, 96, 41, 190, 79, 13, 7, 133, 5, 51,
    254, 94, 1, 53, 189, 93, 96, 239, 60, 147, 157, 94, 32, 241, 75, 87, 1, 94, 155, 46,
    160, 131, 105, 19, 163, 88, 184, 229, 13, 184, 59, 31, 35, 134, 104, 90, 153, 165, 189, 188,
    130, 54, 187, 184,
];

const MERKLE_INCLUSION_VK_IC1_G1: [u8; 64] = [
    39, 78, 167, 18, 111, 77, 151, 31, 172, 51, 20, 153, 157, 196, 134, 45, 35, 225, 119, 129,
    228, 230, 206, 81, 183, 234, 209, 207, 115, 199, 200, 177, 11, 185, 191, 99, 200, 238, 23, 186,
    12, 200, 117, 210, 216, 106, 192, 250, 41, 114, 45, 209, 80, 99, 44, 108, 32, 113, 184, 216,
    92, 74, 105, 25,
];

const MERKLE_INCLUSION_PROOF_A: [u8; 64] = [
    27, 207, 47, 177, 134, 212, 37, 182, 220, 132, 8, 21, 65, 147, 221, 108, 109, 63, 174, 31,
    92, 117, 169, 87, 45, 40, 16, 202, 82, 55, 236, 25, 6, 251, 44, 56, 36, 18, 143, 32,
    212, 253, 68, 255, 200, 19, 177, 136, 186, 204, 113, 176, 195, 100, 101, 124, 147, 35, 179, 23,
    215, 220, 142, 7,
];

const MERKLE_INCLUSION_PROOF_B: [u8; 128] = [
    44, 249, 243, 109, 155, 193, 245, 72, 143, 226, 179, 63, 240, 224, 43, 200, 17, 98, 146, 150,
    210, 36, 108, 166, 183, 169, 131, 202, 168, 215, 188, 190, 12, 169, 177, 187, 27, 163, 27, 92,
    195, 128, 112, 131, 15, 135, 228, 238, 1, 118, 123, 115, 116, 63, 61, 118, 105, 119, 214, 61,
    123, 92, 255, 162, 10, 4, 80, 129, 211, 251, 198, 203, 42, 220, 132, 71, 27, 32, 66, 22,
    122, 53, 186, 27, 121, 89, 80, 116, 186, 202, 154, 135, 155, 80, 74, 122, 6, 118, 123, 193,
    80, 107, 35, 182, 144, 119, 23, 156, 52, 55, 204, 196, 105, 152, 93, 252, 7, 67, 39, 174,
    147, 247, 193, 63, 250, 60, 20, 201,
];

const MERKLE_INCLUSION_PROOF_C: [u8; 64] = [
    11, 1, 255, 1, 226, 160, 74, 135, 67, 216, 123, 138, 90, 9, 56, 245, 84, 104, 24, 201,
    238, 137, 193, 79, 209, 139, 59, 143, 221, 72, 189, 120, 46, 183, 239, 161, 84, 206, 95, 149,
    211, 164, 78, 76, 239, 255, 3, 211, 92, 87, 66, 205, 84, 69, 76, 17, 166, 67, 221, 130,
    45, 123, 251, 74,
];

const MERKLE_INCLUSION_PUBLIC_INPUT_0: [u8; 32] = [
    19, 82, 183, 163, 64, 228, 93, 240, 108, 121, 210, 99, 250, 31, 150, 153, 128, 197, 182, 226,
    13, 9, 255, 171, 210, 170, 51, 176, 125, 62, 200, 62,
];

fn setup() -> (Env, Address, RegistryContractClient<'static>) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(RegistryContract, (admin.clone(),));
    let client = RegistryContractClient::new(&env, &contract_id);
    (env, admin, client)
}

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

fn valid_public_inputs(env: &Env) -> Vec<BytesN<32>> {
    vec![env, BytesN::from_array(env, &VALID_PUBLIC_INPUT)]
}

fn range_proof_vk(env: &Env) -> VerifyingKey {
    VerifyingKey {
        alpha: BytesN::from_array(env, &RANGE_PROOF_VK_ALPHA_G1),
        beta: BytesN::from_array(env, &RANGE_PROOF_VK_BETA_G2),
        gamma: BytesN::from_array(env, &RANGE_PROOF_VK_GAMMA_G2),
        delta: BytesN::from_array(env, &RANGE_PROOF_VK_DELTA_G2),
        ic: vec![
            env,
            BytesN::from_array(env, &RANGE_PROOF_VK_IC0_G1),
            BytesN::from_array(env, &RANGE_PROOF_VK_IC1_G1),
            BytesN::from_array(env, &RANGE_PROOF_VK_IC2_G1),
            BytesN::from_array(env, &RANGE_PROOF_VK_IC3_G1),
        ],
    }
}

fn range_proof_public_inputs(env: &Env) -> Vec<BytesN<32>> {
    vec![
        env,
        BytesN::from_array(env, &RANGE_PROOF_PUBLIC_INPUT_0),
        BytesN::from_array(env, &RANGE_PROOF_PUBLIC_INPUT_1),
        BytesN::from_array(env, &RANGE_PROOF_PUBLIC_INPUT_2),
    ]
}

fn threshold_2of3_vk(env: &Env) -> VerifyingKey {
    VerifyingKey {
        alpha: BytesN::from_array(env, &THRESHOLD_2OF3_VK_ALPHA_G1),
        beta: BytesN::from_array(env, &THRESHOLD_2OF3_VK_BETA_G2),
        gamma: BytesN::from_array(env, &THRESHOLD_2OF3_VK_GAMMA_G2),
        delta: BytesN::from_array(env, &THRESHOLD_2OF3_VK_DELTA_G2),
        ic: vec![
            env,
            BytesN::from_array(env, &THRESHOLD_2OF3_VK_IC0_G1),
            BytesN::from_array(env, &THRESHOLD_2OF3_VK_IC1_G1),
            BytesN::from_array(env, &THRESHOLD_2OF3_VK_IC2_G1),
            BytesN::from_array(env, &THRESHOLD_2OF3_VK_IC3_G1),
            BytesN::from_array(env, &THRESHOLD_2OF3_VK_IC4_G1),
        ],
    }
}

fn threshold_2of3_public_inputs(env: &Env) -> Vec<BytesN<32>> {
    vec![
        env,
        BytesN::from_array(env, &THRESHOLD_2OF3_PUBLIC_INPUT_0),
        BytesN::from_array(env, &THRESHOLD_2OF3_PUBLIC_INPUT_1),
        BytesN::from_array(env, &THRESHOLD_2OF3_PUBLIC_INPUT_2),
        BytesN::from_array(env, &THRESHOLD_2OF3_PUBLIC_INPUT_3),
    ]
}

fn merkle_inclusion_vk(env: &Env) -> VerifyingKey {
    VerifyingKey {
        alpha: BytesN::from_array(env, &MERKLE_INCLUSION_VK_ALPHA_G1),
        beta: BytesN::from_array(env, &MERKLE_INCLUSION_VK_BETA_G2),
        gamma: BytesN::from_array(env, &MERKLE_INCLUSION_VK_GAMMA_G2),
        delta: BytesN::from_array(env, &MERKLE_INCLUSION_VK_DELTA_G2),
        ic: vec![
            env,
            BytesN::from_array(env, &MERKLE_INCLUSION_VK_IC0_G1),
            BytesN::from_array(env, &MERKLE_INCLUSION_VK_IC1_G1),
        ],
    }
}

fn merkle_inclusion_public_inputs(env: &Env) -> Vec<BytesN<32>> {
    vec![env, BytesN::from_array(env, &MERKLE_INCLUSION_PUBLIC_INPUT_0)]
}

// End-to-end example per circuit (#183): a real proof generated by circom +
// snarkjs from each circuit's own fixtures, verified through the registry's
// verify_proof(circuit_id, ...) after registering that circuit's real
// verifying key. This is the full generate-proof -> format -> verify flow,
// just run locally against a fresh test Env instead of the live Testnet
// registry — registering on the live deployment requires the deployed
// registry's admin key, which is a maintainer action (see #183's PR).

#[test]
fn round_trip_register_and_verify_range_proof() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&RANGE_PROOF_CIRCUIT_ID, &range_proof_vk(&env));

    let result = client.verify_proof(
        &RANGE_PROOF_CIRCUIT_ID,
        &Bytes::from_array(&env, &RANGE_PROOF_PROOF_A),
        &Bytes::from_array(&env, &RANGE_PROOF_PROOF_B),
        &Bytes::from_array(&env, &RANGE_PROOF_PROOF_C),
        &range_proof_public_inputs(&env),
    );

    assert!(result);
}

#[test]
fn round_trip_rejects_tampered_range_proof() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&RANGE_PROOF_CIRCUIT_ID, &range_proof_vk(&env));

    let tampered = (-Bn254G1Affine::from_array(&env, &RANGE_PROOF_PROOF_A)).to_array();
    let result = client.verify_proof(
        &RANGE_PROOF_CIRCUIT_ID,
        &Bytes::from_array(&env, &tampered),
        &Bytes::from_array(&env, &RANGE_PROOF_PROOF_B),
        &Bytes::from_array(&env, &RANGE_PROOF_PROOF_C),
        &range_proof_public_inputs(&env),
    );

    assert!(!result);
}

#[test]
fn round_trip_register_and_verify_threshold_2of3() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&THRESHOLD_2OF3_CIRCUIT_ID, &threshold_2of3_vk(&env));

    let result = client.verify_proof(
        &THRESHOLD_2OF3_CIRCUIT_ID,
        &Bytes::from_array(&env, &THRESHOLD_2OF3_PROOF_A),
        &Bytes::from_array(&env, &THRESHOLD_2OF3_PROOF_B),
        &Bytes::from_array(&env, &THRESHOLD_2OF3_PROOF_C),
        &threshold_2of3_public_inputs(&env),
    );

    assert!(result);
}

#[test]
fn round_trip_rejects_tampered_threshold_2of3() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&THRESHOLD_2OF3_CIRCUIT_ID, &threshold_2of3_vk(&env));

    let tampered = (-Bn254G1Affine::from_array(&env, &THRESHOLD_2OF3_PROOF_A)).to_array();
    let result = client.verify_proof(
        &THRESHOLD_2OF3_CIRCUIT_ID,
        &Bytes::from_array(&env, &tampered),
        &Bytes::from_array(&env, &THRESHOLD_2OF3_PROOF_B),
        &Bytes::from_array(&env, &THRESHOLD_2OF3_PROOF_C),
        &threshold_2of3_public_inputs(&env),
    );

    assert!(!result);
}

#[test]
fn round_trip_register_and_verify_merkle_inclusion() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&MERKLE_INCLUSION_CIRCUIT_ID, &merkle_inclusion_vk(&env));

    let result = client.verify_proof(
        &MERKLE_INCLUSION_CIRCUIT_ID,
        &Bytes::from_array(&env, &MERKLE_INCLUSION_PROOF_A),
        &Bytes::from_array(&env, &MERKLE_INCLUSION_PROOF_B),
        &Bytes::from_array(&env, &MERKLE_INCLUSION_PROOF_C),
        &merkle_inclusion_public_inputs(&env),
    );

    assert!(result);
}

#[test]
fn round_trip_rejects_tampered_merkle_inclusion() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&MERKLE_INCLUSION_CIRCUIT_ID, &merkle_inclusion_vk(&env));

    let tampered = (-Bn254G1Affine::from_array(&env, &MERKLE_INCLUSION_PROOF_A)).to_array();
    let result = client.verify_proof(
        &MERKLE_INCLUSION_CIRCUIT_ID,
        &Bytes::from_array(&env, &tampered),
        &Bytes::from_array(&env, &MERKLE_INCLUSION_PROOF_B),
        &Bytes::from_array(&env, &MERKLE_INCLUSION_PROOF_C),
        &merkle_inclusion_public_inputs(&env),
    );

    assert!(!result);
}

#[test]
fn register_circuit_requires_admin_auth() {
    let (env, admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));

    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths.get(0).unwrap().0, admin);
    assert!(client.has_circuit(&POSEIDON_CIRCUIT_ID));
}

#[test]
#[should_panic]
fn register_circuit_panics_without_auth() {
    let (env, _admin, client) = setup();
    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));
}

#[test]
fn verify_proof_returns_false_for_unknown_circuit() {
    let (env, _admin, client) = setup();

    let result = client.verify_proof(
        &UNKNOWN_CIRCUIT_ID,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &valid_public_inputs(&env),
    );

    assert!(!result);
}

#[test]
fn round_trip_register_and_verify_valid_proof() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));

    let result = client.verify_proof(
        &POSEIDON_CIRCUIT_ID,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &valid_public_inputs(&env),
    );

    assert!(result);
}

#[test]
fn round_trip_rejects_tampered_proof() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));

    let tampered = (-Bn254G1Affine::from_array(&env, &VALID_PROOF_A)).to_array();
    let result = client.verify_proof(
        &POSEIDON_CIRCUIT_ID,
        &Bytes::from_array(&env, &tampered),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &valid_public_inputs(&env),
    );

    assert!(!result);
}

#[test]
fn verify_proof_returns_false_for_wrong_public_input_count() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));

    let too_many = vec![
        &env,
        BytesN::from_array(&env, &VALID_PUBLIC_INPUT),
        BytesN::from_array(&env, &VALID_PUBLIC_INPUT),
    ];
    let result = client.verify_proof(
        &POSEIDON_CIRCUIT_ID,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &too_many,
    );

    assert!(!result);
}

// verification_result event coverage: one test per outcome path, asserting
// the event's success/inputs_hash fields against what verify_proof was
// actually called with.

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
    success: bool,
    public_inputs: &Vec<BytesN<32>>,
) {
    let expected = VerificationResult {
        success,
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
    let (env, _admin, client) = setup();
    env.mock_all_auths();
    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));
    let public_inputs = valid_public_inputs(&env);

    let result = client.verify_proof(
        &POSEIDON_CIRCUIT_ID,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs,
    );
    assert!(result);

    assert_single_verification_event(&env, &client.address, true, &public_inputs);
}

#[test]
fn verify_proof_emits_event_on_pairing_failure() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();
    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));
    let tampered = (-Bn254G1Affine::from_array(&env, &VALID_PROOF_A)).to_array();
    let public_inputs = valid_public_inputs(&env);

    let result = client.verify_proof(
        &POSEIDON_CIRCUIT_ID,
        &Bytes::from_array(&env, &tampered),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs,
    );
    assert!(!result);

    assert_single_verification_event(&env, &client.address, false, &public_inputs);
}

#[test]
fn verify_proof_emits_event_on_wrong_public_input_count() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();
    client.register_circuit(&POSEIDON_CIRCUIT_ID, &poseidon_vk(&env));

    let too_many = vec![
        &env,
        BytesN::from_array(&env, &VALID_PUBLIC_INPUT),
        BytesN::from_array(&env, &VALID_PUBLIC_INPUT),
    ];
    let result = client.verify_proof(
        &POSEIDON_CIRCUIT_ID,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &too_many,
    );
    assert!(!result);

    assert_single_verification_event(&env, &client.address, false, &too_many);
}

#[test]
fn verify_proof_emits_event_on_unknown_circuit() {
    let (env, _admin, client) = setup();
    let public_inputs = valid_public_inputs(&env);

    let result = client.verify_proof(
        &UNKNOWN_CIRCUIT_ID,
        &Bytes::from_array(&env, &VALID_PROOF_A),
        &Bytes::from_array(&env, &VALID_PROOF_B),
        &Bytes::from_array(&env, &VALID_PROOF_C),
        &public_inputs,
    );
    assert!(!result);

    assert_single_verification_event(&env, &client.address, false, &public_inputs);
}

// Two-step admin transfer and upgrade (#12).

#[test]
fn admin_ownership_handoff_succeeds() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();
    let new_admin = Address::generate(&env);

    client.propose_admin(&new_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    client.accept_admin();
    assert_eq!(client.pending_admin(), None);
    assert_eq!(client.admin(), new_admin);
}

#[test]
#[should_panic]
fn propose_admin_rejects_non_admin_caller() {
    let (env, _admin, client) = setup();
    let attacker = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "propose_admin",
                args: (&new_admin,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .propose_admin(&new_admin);
}

#[test]
#[should_panic]
fn accept_admin_rejects_non_pending_admin_caller() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();
    let new_admin = Address::generate(&env);
    let attacker = Address::generate(&env);

    client.propose_admin(&new_admin);

    client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "accept_admin",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .accept_admin();
}

#[test]
#[should_panic]
fn accept_admin_fails_without_pending_admin() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();

    client.accept_admin();
}

#[test]
fn upgrade_succeeds_for_admin() {
    let (env, _admin, client) = setup();
    env.mock_all_auths();
    let wasm_hash = env.deployer().upload_contract_wasm(Bytes::new(&env));

    client.upgrade(&wasm_hash);
}

#[test]
#[should_panic]
fn upgrade_rejects_non_admin_caller() {
    let (env, _admin, client) = setup();
    let attacker = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(Bytes::new(&env));

    client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "upgrade",
                args: (&wasm_hash,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .upgrade(&wasm_hash);
}
