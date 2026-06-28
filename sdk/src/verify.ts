import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr
} from "@stellar/stellar-sdk";

import { formatProof } from "./proof";
import {
  NetworkMismatchError,
  ProofBundle,
  SorobanProofCalldata,
  SorobanZkError,
  SorobanZkErrorCode,
  VerifyOptions,
  VerifyResult
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

function makeBytesScVal(bytes: Buffer): xdr.ScVal {
  return xdr.ScVal.scvBytes(bytes);
}

function makePublicInputsScVal(publicInputs: Buffer[]): xdr.ScVal {
  return xdr.ScVal.scvVec(publicInputs.map((item) => xdr.ScVal.scvBytes(item)));
}

function feeFromResult(result: xdr.TransactionResult): string {
  return result.feeCharged().toString();
}

function classifyError(error: unknown): SorobanZkError {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();

  if (lowered.includes("resource") || lowered.includes("instruction") || lowered.includes("limit")) {
    return new SorobanZkError(message, SorobanZkErrorCode.RESOURCE_LIMIT_EXCEEDED);
  }

  if (lowered.includes("network") || lowered.includes("fetch") || lowered.includes("timeout")) {
    return new SorobanZkError(message, SorobanZkErrorCode.NETWORK_ERROR);
  }

  return new SorobanZkError(message, SorobanZkErrorCode.CONTRACT_INVOCATION_FAILED);
}

function decodeReturnValueFromDiagnostics(
  diagnosticEventsXdr: string[] | undefined
): boolean | undefined {
  if (!diagnosticEventsXdr) {
    return undefined;
  }

  for (const encoded of diagnosticEventsXdr) {
    const event = xdr.DiagnosticEvent.fromXDR(encoded, "base64");
    const contractEvent = event.event();
    const topics = contractEvent.body().v0().topics();
    if (topics.length < 2) {
      continue;
    }

    const marker = scValToNative(topics[0]);
    if (marker === "fn_return") {
      return Boolean(scValToNative(contractEvent.body().v0().data()));
    }
  }

  return undefined;
}

export function assertBundleNetwork(bundle: ProofBundle, networkPassphrase: string): void {
  if (bundle.networkPassphrase !== networkPassphrase) {
    throw new NetworkMismatchError(bundle.networkPassphrase, networkPassphrase);
  }
}

function resolveCalldata(opts: VerifyOptions): SorobanProofCalldata {
  if (opts.calldata) {
    return opts.calldata;
  }

  if (opts.bundle) {
    return formatProof(opts.bundle.proof, opts.bundle.publicSignals);
  }

  throw new SorobanZkError(
    "verifyOnChain requires either calldata or a bundle",
    SorobanZkErrorCode.INVALID_PROOF_FORMAT
  );
}

export async function verifyOnChain(opts: VerifyOptions): Promise<VerifyResult> {
  try {
    const server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });
    const network = await server.getNetwork();

    if (opts.bundle) {
      assertBundleNetwork(opts.bundle, network.passphrase);
    }

    const calldata = resolveCalldata(opts);
    const account = await server.getAccount(opts.keypair.publicKey());
    const contract = new Contract(opts.contractId);

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: network.passphrase
    })
      .addOperation(
        contract.call(
          "verify_proof",
          makeBytesScVal(calldata.proofA),
          makeBytesScVal(calldata.proofB),
          makeBytesScVal(calldata.proofC),
          makePublicInputsScVal(calldata.publicInputs)
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(transaction);
    prepared.sign(opts.keypair);

    const sendResult = await server.sendTransaction(prepared);
    if (sendResult.status !== "PENDING" && sendResult.status !== "DUPLICATE") {
      throw new SorobanZkError(
        `Transaction submission failed with status ${sendResult.status}`,
        SorobanZkErrorCode.TRANSACTION_REJECTED
      );
    }

    const started = Date.now();
    while (Date.now() - started < DEFAULT_TIMEOUT_MS) {
      const result = await server._getTransaction(sendResult.hash);

      if (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new SorobanZkError(
          `Transaction ${result.txHash} failed on ledger ${result.ledger}`,
          SorobanZkErrorCode.TRANSACTION_REJECTED
        );
      }

      const returnValue = decodeReturnValueFromDiagnostics(result.diagnosticEventsXdr);
      if (typeof result.ledger !== "number" || !result.resultXdr) {
        throw new SorobanZkError(
          `Transaction ${result.txHash} did not include the expected success payload`,
          SorobanZkErrorCode.CONTRACT_INVOCATION_FAILED
        );
      }

      return {
        verified: Boolean(returnValue),
        txHash: result.txHash,
        ledger: result.ledger,
        fee: feeFromResult(xdr.TransactionResult.fromXDR(result.resultXdr, "base64"))
      };
    }

    throw new SorobanZkError(
      "Timed out waiting for transaction confirmation",
      SorobanZkErrorCode.NETWORK_ERROR
    );
  } catch (error) {
    if (error instanceof SorobanZkError) {
      throw error;
    }

    throw classifyError(error);
  }
}
