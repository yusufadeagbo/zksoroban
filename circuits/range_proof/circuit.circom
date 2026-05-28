pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

template RangeProof32() {
    signal input x;
    signal input commitment;

    component bits = Num2Bits(32);
    bits.in <== x;

    component hash = Poseidon(1);
    hash.inputs[0] <== x;

    commitment === hash.out;
}

component main {public [commitment]} = RangeProof32();
