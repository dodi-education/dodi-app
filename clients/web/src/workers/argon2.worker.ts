/**
 * Dedicated Web Worker that runs Argon2id (hash-wasm) off the main thread, so
 * the multi-hundred-ms key derivation during vault unlock never freezes the UI.
 * Message protocol is defined by `@/lib/argon2-worker`, the only client.
 */
import { argon2id } from "hash-wasm";

import type { Argon2Params } from "@dodi/crypto";

export interface Argon2WorkerRequest {
  id: number;
  passwordBytes: Uint8Array;
  salt: Uint8Array;
  params: Argon2Params;
}

export type Argon2WorkerResponse =
  | { id: number; ok: true; key: Uint8Array }
  | { id: number; ok: false; error: string };

// lib.dom types `self` as a Window; narrow to the worker-scope surface we use.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Argon2WorkerRequest>) => void) | null;
  postMessage(message: Argon2WorkerResponse): void;
};

scope.onmessage = async (event) => {
  const { id, passwordBytes, salt, params } = event.data;
  try {
    const key = await argon2id({
      password: passwordBytes,
      salt,
      iterations: params.t,
      memorySize: params.m,
      parallelism: params.p,
      hashLength: params.dkLen,
      outputType: "binary",
    });
    scope.postMessage({ id, ok: true, key });
  } catch (error) {
    scope.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    passwordBytes.fill(0);
  }
};
