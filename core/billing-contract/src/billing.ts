import { z } from "zod";

/**
 * Credit balance in EUR cents, two buckets: `monthly` (plan grants, drained
 * first, floor 0) and `extra` (top-ups; may go negative from post-paid
 * reconcile overshoot). `totalCents` is the sum — dodi AI is usable while it
 * is positive.
 */
export const BalanceSchema = z.object({
  monthlyCents: z.number().int(),
  extraCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.literal("EUR"),
});
export type Balance = z.infer<typeof BalanceSchema>;

/**
 * `GET /api/billing/status` — the parent-facing money snapshot. Balances come from
 * the commercial ledger; `lastReconcileAt` is the "balance as of" timestamp
 * the UI shows (the ledger lags real usage by the pull/reconcile cadence).
 */
export const BillingStatusResponseSchema = z.object({
  canUse: z.boolean(),
  balance: BalanceSchema,
  lastReconcileAt: z.string().nullable(),
  lastUsagePullAt: z.string().nullable(),
});
export type BillingStatusResponse = z.infer<typeof BillingStatusResponseSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["credit", "debit", "hold", "release", "adjustment"]),
  bucket: z.enum(["monthly", "extra"]),
  /** Signed delta applied to the bucket, in EUR cents. */
  amountCents: z.number().int(),
  source: z.enum([
    "top_up_stripe",
    "plan_grant",
    "admin_adjustment",
    "provider_usage_correction_post_month_closing",
  ]),
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const LedgerPageSchema = z.object({
  entries: z.array(LedgerEntrySchema),
  nextCursor: z.string().nullable(),
});
export type LedgerPage = z.infer<typeof LedgerPageSchema>;

/**
 * `GET /api/billing/usage` — the parent-facing usage summary for one month
 * (daily accruals grouped per service). Charges converge with provider
 * revisions until the month is closed; `asOf` is the last successful pull.
 */
export const UsageSummaryLineSchema = z.object({
  model: z.string(),
  unitType: z.string(),
  quantity: z.number().nullable(),
  chargedEurCents: z.number().int(),
});
export const UsageSummaryServiceSchema = z.object({
  service: z.string(),
  chargedEurCents: z.number().int(),
  lines: z.array(UsageSummaryLineSchema),
});
export const UsageSummaryResponseSchema = z.object({
  month: z.string(),
  services: z.array(UsageSummaryServiceSchema),
  totalChargedEurCents: z.number().int(),
  asOf: z.string().nullable(),
});
export type UsageSummaryResponse = z.infer<typeof UsageSummaryResponseSchema>;

/**
 * `POST /api/internal/credits/adjust` (ops m2m) — the audited manual credit path
 * (support actions; dev seeding while Stripe is out of scope). Positive
 * `amountCents` credits, negative debits. Idempotent per `idempotencyKey`.
 */
export const CreditsAdjustRequestSchema = z.object({
  accountId: z.uuid(),
  bucket: z.enum(["monthly", "extra"]),
  amountCents: z.number().int(),
  reason: z.string().min(1),
  actor: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type CreditsAdjustRequest = z.infer<typeof CreditsAdjustRequestSchema>;
