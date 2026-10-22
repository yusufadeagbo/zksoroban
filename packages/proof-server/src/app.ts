import express, { Express, Request, Response } from "express";
import { createAuthMiddleware } from "./auth.js";
import { WorkerPool } from "./workerPool.js";
import type { ProveRequestBody } from "./types.js";

export interface AppOptions {
  workerPool?: WorkerPool;
  apiKey?: string;
}

export function createApp(options?: AppOptions): Express {
  const app = express();
  const workerPool = options?.workerPool || new WorkerPool();

  app.use(express.json({ limit: "10mb" }));
  app.use(createAuthMiddleware(options?.apiKey));

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      workers: workerPool.size,
      queued: workerPool.queueLength,
      busy: workerPool.busyWorkers
    });
  });

  app.post("/prove", async (req: Request, res: Response): Promise<void> => {
    const body: ProveRequestBody = req.body;

    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Request body must be a JSON object" });
      return;
    }

    const circuit = body.circuit || "poseidon_preimage";
    if (typeof circuit !== "string" || !circuit.trim()) {
      res.status(400).json({ error: "Invalid circuit name" });
      return;
    }

    let secret = body.secret;
    let commitment = body.commitment;

    if (body.inputs && typeof body.inputs === "object") {
      if (secret === undefined) secret = body.inputs.secret as string;
      if (commitment === undefined) commitment = body.inputs.commitment as string;
    }

    if (secret === undefined || secret === null) {
      res.status(400).json({ error: "Missing required input: secret" });
      return;
    }

    if (commitment === undefined || commitment === null) {
      res.status(400).json({ error: "Missing required input: commitment" });
      return;
    }

    // Validate that secret and commitment are valid numeric/bigint representations
    try {
      BigInt(secret as any);
    } catch {
      res.status(400).json({ error: "Input 'secret' must be a valid integer or numeric string" });
      return;
    }

    try {
      BigInt(commitment as any);
    } catch {
      res.status(400).json({ error: "Input 'commitment' must be a valid integer or numeric string" });
      return;
    }

    try {
      const result = await workerPool.execute({
        circuit,
        secret: String(secret),
        commitment: String(commitment),
        wasmBase64: body.wasm,
        zkeyBase64: body.zkey,
        wasmPath: body.wasmPath,
        zkeyPath: body.zkeyPath
      });

      res.status(200).json({
        proof: result.proof,
        publicSignals: result.publicSignals
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Constraint / generation failures are 400 client errors; internal file or system errors are 500
      if (
        message.includes("PROOF_GENERATION_FAILED") ||
        message.includes("does not satisfy") ||
        message.includes("Assert Failed") ||
        message.includes("ZkInputError") ||
        message.includes("outside the BN254 field")
      ) {
        res.status(400).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  return app;
}
