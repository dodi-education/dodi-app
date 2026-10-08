/**
 * "Report a problem": the in-app flagging of AI answers and games that Google
 * Play requires for AI-generated content and the App Store for user-generated
 * content (Discover games). The report goes to the operator in plaintext
 * (POST /api/reports); the screen says so before the parent sends it.
 */
import type { ContentReportKind, ContentReportReason } from "@dodi/types/database";

import type { PlatformApi } from "./platform";

export const REPORT_CONTENT_KINDS = [
  "companion_answer",
  "game",
  "discover_game",
] as const satisfies readonly ContentReportKind[];

export const REPORT_REASONS = [
  "inappropriate",
  "upsetting",
  "wrong",
  "other",
] as const satisfies readonly ContentReportReason[];

/** The platform's cap on the parent's description. */
export const REPORT_DETAILS_MAX_LENGTH = 2000;

export interface ContentReportDraft {
  contentKind: ContentReportKind;
  reason: ContentReportReason | "";
  details: string;
  kidId: string | null;
  /** Set when the report was opened from a game (it travels as context, not as a choice). */
  gameId: string | null;
}

export type SubmitReportOutcome =
  | { kind: "sent" }
  /** A `report` message key. */
  | { kind: "error"; key: "reasonRequired" | "rateLimited" | "failed" };

function isKind(value: string | null | undefined): value is ContentReportKind {
  return (REPORT_CONTENT_KINDS as readonly string[]).includes(value ?? "");
}

/**
 * The starting draft for the report screen. Entry points pass context in the
 * route's query: `?kind=discover_game&game=<id>` from a Discover game, a kid
 * id from a kid's page. Unknown values fall back to a companion report.
 */
export function reportDraftFromQuery(query: {
  kind?: string | null;
  game?: string | null;
  kid?: string | null;
}): ContentReportDraft {
  const gameId = query.game || null;
  const contentKind = isKind(query.kind) ? query.kind : gameId ? "game" : "companion_answer";
  return { contentKind, reason: "", details: "", kidId: query.kid || null, gameId };
}

export async function submitContentReport(
  deps: { api: Pick<PlatformApi, "request"> },
  draft: ContentReportDraft,
  clientPlatform: "web" | "mobile",
): Promise<SubmitReportOutcome> {
  if (!draft.reason) return { kind: "error", key: "reasonRequired" };
  const details = draft.details.trim().slice(0, REPORT_DETAILS_MAX_LENGTH);
  // A game only belongs to a game report; a kid to anything (who saw it).
  const gameId = draft.contentKind === "companion_answer" ? null : draft.gameId;
  try {
    const res = await deps.api.request("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentKind: draft.contentKind,
        reason: draft.reason,
        ...(details ? { details } : {}),
        ...(draft.kidId ? { kidId: draft.kidId } : {}),
        ...(gameId ? { gameId } : {}),
        clientPlatform,
      }),
    });
    if (res.ok) return { kind: "sent" };
    if (res.status === 429) return { kind: "error", key: "rateLimited" };
    return { kind: "error", key: "failed" };
  } catch {
    return { kind: "error", key: "failed" };
  }
}
