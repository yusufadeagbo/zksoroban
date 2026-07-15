pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template Threshold2of3() {
    signal input key0;
    signal input key1;
    signal input key2;
    signal input active[3];

    signal input messageHash;
    signal input commitment0;
    signal input commitment1;
    signal input commitment2;

    signal mhSquared;
    mhSquared <== messageHash * messageHash;

    for (var i = 0; i < 3; i++) {
        active[i] * (active[i] - 1) === 0;
    }

    component atLeastTwo = GreaterEqThan(3);
    atLeastTwo.in[0] <== active[0] + active[1] + active[2];
    atLeastTwo.in[1] <== 2;
    atLeastTwo.out === 1;

    component h0 = Poseidon(1);
    h0.inputs[0] <== key0;
    component h1 = Poseidon(1);
    h1.inputs[0] <== key1;
    component h2 = Poseidon(1);
    h2.inputs[0] <== key2;

    active[0] * (h0.out - commitment0) === 0;
    active[1] * (h1.out - commitment1) === 0;
    active[2] * (h2.out - commitment2) === 0;
}

component main {public [messageHash, commitment0, commitment1, commitment2]} = Threshold2of3();
