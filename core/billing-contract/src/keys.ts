import { z } from "zod";

import { BalanceSchema } from "./billing";

/**
 * Providers dodi AI hands out inference keys for. Widens (e.g. "venice") as
 * providers are added — clients must tolerate unknown members by filtering on
 * the providers they know how to drive.
 */
export const InferenceProviderSchema = z.enum(["xai"]);
export type InferenceProvider = z.infer<typeof InferenceProviderSchema>;

/**
 * One inference credential from `GET ai.dodi.app/api/keys`. The secret is a
 * session credential: hold it in memory only — never in the platform DB, the
 * vault, or any client-side storage. The `providerKeyId` is the permanent
 * provider-side key record usage attribution is bound to; the secret behind it
 * rotates (daily cron), so a provider 401 means "refetch /keys", not "key
 * gone".
 */
export const InferenceKeySchema = z.object({
  provider: InferenceProviderSchema,
  apiKey: z.string().min(1),
  providerKeyId: z.string().min(1),
  mintedAt: z.string(),
});
export type InferenceKey = z.infer<typeof InferenceKeySchema>;

export const KeysResponseSchema = z.object({
  keys: z.array(InferenceKeySchema),
});
export type KeysResponse = z.infer<typeof KeysResponseSchema>;

/** HTTP 402 body when the balance does not allow handing out keys. */
export const KeysRefusalSchema = z.object({
  error: z.literal("insufficient_balance"),
  balance: BalanceSchema,
});
export type KeysRefusal = z.infer<typeof KeysRefusalSchema>;

/** HTTP 403 body when the key is admin-locked (misuse) — not self-healing. */
export const KeysLockedSchema = z.object({
  error: z.literal("key_locked"),
});
export type KeysLocked = z.infer<typeof KeysLockedSchema>;

/** `GET /api/keys/status` — existence/lifecycle only, never the secret. */
export const KeyStatusResponseSchema = z.object({
  exists: z.boolean(),
  status: z.enum(["active", "locked"]).nullable(),
  mintedAt: z.string().nullable(),
  lastRotatedAt: z.string().nullable(),
});
export type KeyStatusResponse = z.infer<typeof KeyStatusResponseSchema>;
