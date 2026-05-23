.PHONY: help install build build-contract build-sdk test test-contract test-sdk test-circuits lint demo clean

CIRCUIT_DIR := circuits/poseidon_preimage
CIRCUIT_BUILD := $(CIRCUIT_DIR)/build
CONTRACT_MANIFEST := contracts/verifier/Cargo.toml

help:
	@echo "zksoroban development targets"
	@echo "  make install       Install SDK and demo npm dependencies"
	@echo "  make build         Build the verifier contract and TypeScript SDK"
	@echo "  make test          Run contract, SDK, and circuit checks"
	@echo "  make lint          Run Rust and TypeScript lint checks"
	@echo "  make circuits      Compile and verify the reference circuit"
	@echo "  make demo          Run the end-to-end demo"
	@echo "  make clean         Remove generated build artifacts and node_modules"

install:
	npm install --prefix sdk
	npm install --prefix demo

build: build-contract build-sdk

build-contract:
	cargo build --manifest-path $(CONTRACT_MANIFEST) --target wasm32v1-none --release

build-sdk:
	npm run build --prefix sdk

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

lint:
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
