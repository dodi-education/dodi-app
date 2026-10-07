import { z } from "zod";

import { BalanceSchema } from "./billing";

/**
 * Providers dodi AI hands out inference keys for. Widens as providers are
 * added — `KeysResponseSchema` drops entries for providers a client does not
 * know, so an older client keeps working with the keys it can drive.
 */
export const InferenceProviderSchema = z.enum(["xai", "venice"]);
export type InferenceProvider = z.infer<typeof InferenceProviderSchema>;

/**
 * One inference credential from `GET ai.dodi.app/api/keys`. The secret is a
 * session credential: hold it in memory only — never in the platform DB, the
 * vault, or any client-side storage. A provider 401 means "refetch /keys", not
 * "key gone":
 *  - xAI rotates the secret in place (daily cron); `providerKeyId` stays the
 *    same for the account's lifetime.
 *  - Venice cannot rotate in place: each rotation mints a new provider key, so
 *    `providerKeyId` changes and the key carries an `expiresAt` after which the
 *    provider rejects it. Refetch before it passes.
 */
export const InferenceKeySchema = z.object({
  provider: InferenceProviderSchema,
  apiKey: z.string().min(1),
  providerKeyId: z.string().min(1),
  mintedAt: z.string(),
  /** ISO timestamp the provider stops accepting this secret; absent = no hard expiry. */
  expiresAt: z.string().optional(),
});
export type InferenceKey = z.infer<typeof InferenceKeySchema>;

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set(InferenceProviderSchema.options);

export const KeysResponseSchema = z.object({
  keys: z.preprocess(
    (raw) =>
      Array.isArray(raw)
        ? raw.filter(
            (entry: unknown) =>
              typeof entry === "object" &&
              entry !== null &&
              KNOWN_PROVIDERS.has(String((entry as { provider?: unknown }).provider)),
          )
        : raw,
    z.array(InferenceKeySchema),
  ),
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
