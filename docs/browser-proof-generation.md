# Manual Test: Generating a Proof in the Browser

`@zksoroban/sdk/browser` is a browser-safe build of the SDK's proof
generator. It exports a single `generateProof(secret, commitment, wasm, zkey)`
function that takes the circuit's `.wasm` and `.zkey` as `Uint8Array` —
no filesystem access, so the caller's secret never has to leave the browser
tab. This walks through loading the built bundle in a plain HTML page (no
bundler, no dev server framework) and generating a real proof in front of
DevTools.

This is a manual verification procedure, not an automated test — automated
coverage for `generateProof`'s logic lives in `sdk/test/generateProof.test.ts`.

---

## 1. Build the SDK

From `sdk/`:

```bash
npm install
npm run build
```

This runs the full pipeline (`build:cjs`, `build:esm`, `build:types`, and
`build:browser`) and produces `sdk/dist/browser/index.mjs` — a single
self-contained ES module with snarkjs and its dependencies bundled in.

## 2. Compile the circuit and get a secret/commitment pair

The demo circuit's `.zkey` is committed to the repo, but its `.wasm` is a
build artifact (see `demo/README.md`):

```bash
cd circuits/poseidon_preimage
mkdir -p build
circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
cd ../../sdk
```

Use the CLI's `prove` command to get a secret and its matching commitment —
`generateProof` needs both (the commitment is a public circuit input, not
something it derives for you):

```bash
node dist/cjs/cli.js prove --secret 12345
```

```
commitment: 4267533774488295900887461483015112262021273608761099826938271132511348470966
```

## 3. Set up a plain HTML page

Create a scratch directory and copy in the three files the page needs —
the bundle, the wasm, and the zkey:

```bash
mkdir -p /tmp/browser-proof-test
cp dist/browser/index.mjs /tmp/browser-proof-test/zksoroban-sdk-browser.mjs
cp ../circuits/poseidon_preimage/build/circuit_js/circuit.wasm /tmp/browser-proof-test/
cp ../circuits/poseidon_preimage/setup/circuit.zkey /tmp/browser-proof-test/
```

Then create `/tmp/browser-proof-test/index.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>zksoroban browser proof test</title></head>
<body>
<pre id="out">running...</pre>
<script type="module">
  import { generateProof } from "./zksoroban-sdk-browser.mjs";

  const out = document.getElementById("out");
  const log = (line) => { out.textContent += "\n" + line; };

  async function main() {
    const secret = 12345n;
    const commitment = 4267533774488295900887461483015112262021273608761099826938271132511348470966n;

    const wasm = new Uint8Array(await (await fetch("./circuit.wasm")).arrayBuffer());
    const zkey = new Uint8Array(await (await fetch("./circuit.zkey")).arrayBuffer());
    log(`fetched wasm (${wasm.length} bytes) and zkey (${zkey.length} bytes)`);

    const { proof, publicSignals } = await generateProof(secret, commitment, wasm, zkey);
    log("proof.protocol: " + proof.protocol);
    log("publicSignals: " + JSON.stringify(publicSignals));
    log("OK");
  }

  main().catch((err) => log("ERROR: " + err.message));
</script>
</body>
</html>
```

Swap in your own `secret`/`commitment` pair if you used a different `--secret`
in step 2.

## 4. Serve it and open it in a browser

Browsers block `fetch()` of local files from a `file://` page, so this needs
an actual (even trivial) HTTP server:

```bash
cd /tmp/browser-proof-test
python3 -m http.server 8934
```

Open `http://localhost:8934/index.html`. Expect to see, within a few
seconds:

```
running...
fetched wasm (1633991 bytes) and zkey (186597 bytes)
proof.protocol: groth16
publicSignals: ["4267533774488295900887461483015112262021273608761099826938271132511348470966"]
OK
```

That `publicSignals` value should match the commitment from step 2 — this
confirms the proof was generated for the secret you chose, using WASM loaded
from an in-memory `ArrayBuffer`/`Uint8Array`, with no Node APIs involved.

**Verified 2026-08-25** against this exact page and a secret of `12345`, in
Chrome, with no console errors.

### Trying the error path

Passing a `commitment` that doesn't match the `secret` (e.g. changing it by
1) makes the circuit's constraint check fail during witness generation.
`generateProof` surfaces this as a rejected promise carrying a typed
`SorobanZkError` with `code: "PROOF_GENERATION_FAILED"`, not an uncaught
exception or a hung page — try it by editing the `commitment` constant above
and reloading.

## Why this is a separate entry point

`@zksoroban/sdk`'s default entry re-exports `verifyOnChain`, `verifyOffChain`,
and `poseidon` — all of which either open files (`poseidon`'s constant
loader) or pull in `@stellar/stellar-sdk`. Importing the default entry in a
browser bundle would drag those in unnecessarily (and `poseidon` would
outright fail — it calls `fs.readFileSync` at runtime). `@zksoroban/sdk/browser`
exports only `generateProof` and the plain `SorobanZkError`/`SorobanZkErrorCode`/
`ZkInputError` types needed to handle its result, built separately via
`sdk/vite.config.mts`.
