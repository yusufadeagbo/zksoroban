pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";

template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0;

    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

template MerkleInclusion(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input root;

    component switchers[depth];
    component hashers[depth];

    signal levelHashes[depth + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        switchers[i] = DualMux();
        switchers[i].in[0] <== levelHashes[i];
        switchers[i].in[1] <== pathElements[i];
        switchers[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].out[0];
        hashers[i].inputs[1] <== switchers[i].out[1];

        levelHashes[i + 1] <== hashers[i].out;
    }

    root === levelHashes[depth];
}

component main {public [root]} = MerkleInclusion(20);
