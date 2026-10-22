# @zksoroban/proof-server

HTTP proof generation REST server for `zksoroban` circuits. Exposes `generateProof` as a concurrent REST API backed by a Node.js `worker_threads` worker pool.

---

## Features

- **REST API:** Simple HTTP `POST /prove` endpoint for generating zero-knowledge proofs.
- **Worker Pool:** Proof generation runs in a background worker thread pool (`worker_threads`), preventing CPU-heavy snarkjs/WASM witness computation from blocking Node's main event loop.
- **API Key Authentication:** Protects endpoints via `x-api-key` header verification.
- **Structured Error Handling:** Detailed JSON error codes and messages (400 for input/constraint validation, 401 for unauthorized, 500 for internal server errors).
- **Health Checks:** `GET /health` reports worker pool size, active workers, and queue depth.
- **Container Ready:** Included `Dockerfile` for containerized deployments.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port the server listens on | `3000` |
| `API_KEY` | Optional API key. When set, requests must pass this value in `x-api-key` header. If unset or empty, authentication is disabled. | *(empty)* |
| `WORKER_POOL_SIZE` | Number of worker threads to spawn for proof generation | `os.cpus().length` (minimum 2) |
| `CIRCUIT_WASM_PATH` | Path to `circuit.wasm` | `../../circuits/poseidon_preimage/build/circuit_js/circuit.wasm` |
| `CIRCUIT_ZKEY_PATH` | Path to `circuit.zkey` | `../../circuits/poseidon_preimage/setup/circuit.zkey` |

---

## Getting Started

### Installation

From the repository root or inside `packages/proof-server`:

```bash
npm install
```

### Running Locally

Start the server:

```bash
npm start
```

Run in development mode with live reload:

```bash
npm run dev
```

### Running with Docker

Build the Docker image:

```bash
docker build -f packages/proof-server/Dockerfile -t zksoroban-proof-server .
```

Run the container:

```bash
docker run -p 3000:3000 -e API_KEY="your-secret-api-key" zksoroban-proof-server
```

---

## API Specification

### 1. Health Check

**Endpoint:** `GET /health`  
**Description:** Check server status and worker pool capacity.

#### Example Request

```bash
curl http://localhost:3000/health
```

#### Example Response (200 OK)

```json
{
  "status": "ok",
  "workers": 4,
  "queued": 0,
  "busy": 0
}
```

---

### 2. Generate Proof

**Endpoint:** `POST /prove`  
**Headers:**
- `Content-Type: application/json`
- `x-api-key: <API_KEY>` *(required if `API_KEY` environment variable is configured)*

#### Request Body Schema

```json
{
  "circuit": "poseidon_preimage",
  "inputs": {
    "secret": "12345",
    "commitment": "67890"
  }
}
```

*Note:* Top-level `secret` and `commitment` fields are also accepted:

```json
{
  "secret": "12345",
  "commitment": "67890"
}
```

#### Successful Response (200 OK)

```json
{
  "proof": {
    "pi_a": [
      "1234...",
      "5678...",
      "1"
    ],
    "pi_b": [
      ["1234...", "5678..."],
      ["9012...", "3456..."],
      ["1", "0"]
    ],
    "pi_c": [
      "9012...",
      "3456...",
      "1"
    ],
    "protocol": "groth16",
    "curve": "bn128"
  },
  "publicSignals": [
    "67890"
  ]
}
```

#### Error Responses

- **401 Unauthorized:** Missing or invalid `x-api-key` header when `API_KEY` is configured.
  ```json
  {
    "error": "Unauthorized"
  }
  ```

- **400 Bad Request:** Missing or invalid input field, or constraint dissatisfaction.
  ```json
  {
    "error": "Missing required input: secret"
  }
  ```

- **500 Internal Server Error:** Unexpected execution or filesystem failure.
  ```json
  {
    "error": "Circuit WASM file not found at: ..."
  }
  ```

#### Example `curl` Commands

##### Proving with API key:

```bash
curl -X POST http://localhost:3000/prove \
  -H "Content-Type: application/json" \
  -H "x-api-key: my-secret-api-key" \
  -d '{
    "circuit": "poseidon_preimage",
    "inputs": {
      "secret": "12345",
      "commitment": "67890"
    }
  }'
```

##### Proving without API key (when API_KEY is unset):

```bash
curl -X POST http://localhost:3000/prove \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "12345",
    "commitment": "67890"
  }'
```

---

## Testing

Run unit and integration test suite:

```bash
npm test
```
