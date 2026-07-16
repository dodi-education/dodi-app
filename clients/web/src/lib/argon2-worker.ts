/**
 * Routes @dodi/crypto's Argon2id through a dedicated Web Worker so vault
 * unlock/wrap key derivation runs off the main thread (no frozen spinner or
 * "page unresponsive" prompts during login on slow devices).
 *
 * Imported for its side effect (from the vault store): in a browser it
 * registers the worker-backed executor; under SSR/tests it does nothing and
 * the in-thread hash-wasm default stays in place. If the worker can't run
 * (CSP, construction failure), derivation falls back to the same WASM
 * implementation on the main thread — slower UX, identical keys.
 */
import { setArgon2idExecutor, type Argon2Params } from "@dodi/crypto";

import type {
  Argon2WorkerRequest,
  Argon2WorkerResponse,
} from "@/workers/argon2.worker";

interface PendingDerivation {
  resolve(key: Uint8Array): void;
  reject(error: Error): void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingDerivation>();

function failAllPending(reason: string): void {
  const requests = [...pending.values()];
  pending.clear();
  worker?.terminate();
  worker = null; // next derivation spawns a fresh worker
  for (const request of requests) request.reject(new Error(reason));
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/argon2.worker.ts", import.meta.url));
  worker.onmessage = (event: MessageEvent<Argon2WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.key);
    else request.reject(new Error(response.error));
  };
  worker.onerror = () => failAllPending("argon2 worker crashed");
  return worker;
}

function deriveInWorker(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  params: Argon2Params,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject });
    const request: Argon2WorkerRequest = { id, passwordBytes, salt, params };
    getWorker().postMessage(request);
  });
}

if (typeof window !== "undefined" && typeof Worker !== "undefined") {
  setArgon2idExecutor(async (passwordBytes, salt, params) => {
    try {
      return await deriveInWorker(passwordBytes, salt, params);
    } catch {
      // Worker infrastructure failed — derive in-thread instead. Argon2id
      // itself is deterministic, so a retry can't change the outcome, only
      // where it runs.
      const { argon2id } = await import("hash-wasm");
      return argon2id({
        password: passwordBytes,
        salt,
        iterations: params.t,
        memorySize: params.m,
        parallelism: params.p,
        hashLength: params.dkLen,
        outputType: "binary",
      });
    }
  });
}
