.PHONY: help install build build-contract build-sdk codegen codegen-check test test-contract test-sdk test-circuits lint demo clean verifier-cost-check update-verifier-cost-baseline

CIRCUIT_DIR := circuits/poseidon_preimage
CIRCUIT_BUILD := $(CIRCUIT_DIR)/build
CONTRACT_MANIFEST := contracts/verifier/Cargo.toml

help:
	@echo "zksoroban development targets"
	@echo "  make install       Install SDK and demo npm dependencies"
	@echo "  make build         Build the verifier contract and TypeScript SDK"
	@echo "  make codegen       Regenerate the SDK's contract types from the built contract"
	@echo "  make codegen-check Fail if the SDK's generated contract types are out of date"
	@echo "  make test          Run contract, SDK, and circuit checks"
	@echo "  make lint          Run Rust and TypeScript lint checks"
	@echo "  make circuits      Compile and verify the reference circuit"
	@echo "  make demo          Run the end-to-end demo"
	@echo "  make verifier-cost-check           Check verify_proof's instruction cost against the committed baseline"
	@echo "  make update-verifier-cost-baseline Re-measure verify_proof's instruction cost and commit it as the new baseline"
	@echo "  make clean         Remove generated build artifacts and node_modules"

install:
	npm install --prefix sdk
	npm install --prefix demo

build: build-contract build-sdk

build-contract:
	cargo build --manifest-path $(CONTRACT_MANIFEST) --target wasm32v1-none --release

# The SDK's build regenerates its contract types from the compiled contract,
# so it needs the contract built first.
build-sdk: build-contract
	npm run build --prefix sdk

codegen: build-contract
	npm run codegen --prefix sdk

codegen-check: build-contract
	npm run codegen:check --prefix sdk

test: test-contract test-sdk test-circuits

test-contract:
	cargo test --manifest-path $(CONTRACT_MANIFEST)

test-sdk:
	npm test --prefix sdk

test-circuits: circuits

circuits:
	cd $(CIRCUIT_DIR) && circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
	cd $(CIRCUIT_DIR) && npx snarkjs groth16 fullprove input_example.json build/circuit_js/circuit.wasm setup/circuit.zkey proof.json public.json
	cd $(CIRCUIT_DIR) && npx snarkjs groth16 verify setup/verification_key.json public.json proof.json

verifier-cost-check: build-contract
	cargo test --manifest-path $(CONTRACT_MANIFEST) --test cost_regression

update-verifier-cost-baseline: build-contract
	UPDATE_COST_BASELINE=1 cargo test --manifest-path $(CONTRACT_MANIFEST) --test cost_regression -- --nocapture

lint: codegen-check
	cargo fmt --manifest-path $(CONTRACT_MANIFEST) -- --check
	cargo clippy --manifest-path $(CONTRACT_MANIFEST) --all-targets -- -D warnings
	npm run lint --prefix sdk
	npm run lint --prefix demo

demo:
	npm start --prefix demo

clean:
	cargo clean --manifest-path $(CONTRACT_MANIFEST)
	rm -rf sdk/dist sdk/node_modules demo/dist demo/node_modules
	rm -rf $(CIRCUIT_BUILD) $(CIRCUIT_DIR)/proof.json $(CIRCUIT_DIR)/public.json
