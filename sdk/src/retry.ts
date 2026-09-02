import { SorobanZkError, SorobanZkErrorCode, RetryOptions } from "./types.js";

const DEFAULT_RETRY_OPTIONS: Required<Pick<RetryOptions, "maxAttempts" | "baseDelayMs" | "maxDelayMs">> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error: unknown): boolean {
  if (error instanceof SorobanZkError) {
    return error.code === SorobanZkErrorCode.NETWORK_ERROR;
  }
  if (error instanceof Error) {
    const msg = error.message;
    const status = (error as any).status ?? (error as any).statusCode;
    if (status === 429 || status === 503) {
      return true;
    }
    if (/timeout|timed out|ETIMEDOUT|ECONNESEST|fetch failed|network error|socket hang up|ECONNREFUSED/i.test(msg)) {
      return true;
    }
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retryOptions?: RetryOptions
}): Promise<T> {
  const maxAttempts = retryOptions?.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts;
  const baseDelayMs = retryOptions?.baseDelayMs ?? DEFAULT_RETRY_OPTIONS.baseDelayMs;
  const maxDelayMs = retryOptions?.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const sleep = retryOptions?.sleep ?? defaultSleep;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * 100, maxDelayMs);
      attempt++;
      console.debug(`[retry] Attempt ${attempt}/${maxAttempts} failed: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delay}ms)`);
      await sleep(delay);
    }
  }
}
