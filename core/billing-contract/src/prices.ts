import { z } from "zod";

/**
 * The published dodi AI price list (`GET ai.dodi.app/api/prices`, public).
 * Prices are computed daily from provider wholesale prices + the ECB EUR
 * reference rate + dodi's margin, published effective the NEXT UTC day, and
 * charged with an as-of-day join — a price change never applies backwards.
 * All prices are EUR **gross** (incl. VAT).
 */

/** User-facing services ("dodi Voice/Thinking/Image/Code"); `code` = the app's game-generation category. */
export const AiServiceSchema = z.enum(["voice", "thinking", "image", "code"]);
export type AiService = z.infer<typeof AiServiceSchema>;

/** How a unit price is displayed (raw unit prices for tokens are sub-cent). */
export const PriceDisplayUnitSchema = z.enum([
  "per_1m_tokens",
  "per_minute",
  "per_image",
  "per_input",
]);
export type PriceDisplayUnit = z.infer<typeof PriceDisplayUnitSchema>;

export const PriceRowSchema = z.object({
  service: AiServiceSchema,
  /** Internal billing model id — informational; user-facing naming is the service. */
  model: z.string(),
  /** Provider unit_type vocabulary, verbatim (e.g. "Completion text tokens"). */
  unitType: z.string(),
  /** EUR per single unit (gross), full precision. */
  eurPerUnit: z.number(),
  displayUnit: PriceDisplayUnitSchema,
  /** EUR per display unit (gross), e.g. per 1M tokens / per minute / per image. */
  eurPerDisplayUnit: z.number(),
  effectiveFrom: z.string(),
});
export type PriceRow = z.infer<typeof PriceRowSchema>;

export const PriceListResponseSchema = z.object({
  current: z.array(PriceRowSchema),
  /** Prices already published with a future effective date (usually tomorrow). */
  upcoming: z.array(PriceRowSchema),
  currency: z.literal("EUR"),
  vatIncluded: z.literal(true),
  vatRatePct: z.number(),
  asOf: z.string(),
});
export type PriceListResponse = z.infer<typeof PriceListResponseSchema>;
