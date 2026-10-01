import { NpubConflictError } from "@dodi/protocol/client";

import { mobileAuthApi } from "@/adapters/auth";
import { clientState } from "@/lib/client-state";

/** The shared sign-in / registration flows over this app's auth client and stores. */
export const authDeps = {
  auth: mobileAuthApi,
  vault: clientState.vault,
  account: clientState.account,
};

export const isNpubConflict = (error: unknown): boolean => error instanceof NpubConflictError;
