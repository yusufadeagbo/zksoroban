pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template RangeProof(n) {
    signal input secret;
    signal input secret_bits[n];
    signal input min;
    signal input max;
    signal input commitment;

    var lc = 0;
    for (var i = 0; i < n; i++) {
        secret_bits[i] * (secret_bits[i] - 1) === 0;
        lc += secret_bits[i] * (2 ** i);
    }
    lc === secret;

    component hash = Poseidon(1);
    hash.inputs[0] <== secret;
    commitment === hash.out;

    component geMin = LessEqThan(n);
    geMin.in[0] <== min;
    geMin.in[1] <== secret;
    geMin.out === 1;

    component leMax = LessEqThan(n);
    leMax.in[0] <== secret;
    leMax.in[1] <== max;
    leMax.out === 1;
}

component main {public [min, max, commitment]} = RangeProof(64);
