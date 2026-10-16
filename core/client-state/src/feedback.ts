/**
 * "Give feedback": feature requests, bug reports, inappropriate content and
 * anything else a parent wants to tell the dodi team. Flagging inappropriate
 * content is also the in-app report path Google Play requires for AI-generated
 * content and the App Store for user-generated content (Discover games open
 * the form with that category and the game attached).
 *
 * The message goes to the operator in plaintext (POST /api/feedback), with the
 * account email so the team can reply; the form says so before it is sent.
 */
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
} from "@dodi/protocol/feedback";
import type { FeedbackCategory } from "@dodi/types/database";

import type { PlatformApi } from "./platform";

export { FEEDBACK_CATEGORIES, FEEDBACK_MESSAGE_MAX_LENGTH, FEEDBACK_SENDER_NAME_MAX_LENGTH };
export type { FeedbackCategory };

export interface FeedbackDraft {
  senderName: string;
  category: FeedbackCategory | "";
  message: string;
  /** Set when the form was opened from a game (it travels as context, not as a choice). */
  gameId: string | null;
}

/** Where the form was opened from: a Discover game presets the category and attaches the game. */
export interface FeedbackContext {
  category?: FeedbackCategory;
  gameId?: string | null;
}

/** A `feedback` message key for a draft that cannot be sent yet. */
export type FeedbackDraftError = "nameRequired" | "categoryRequired" | "messageRequired";

export type SubmitFeedbackOutcome =
  | { kind: "sent" }
  /** A `feedback` message key. */
  | { kind: "error"; key: FeedbackDraftError | "rateLimited" | "failed" };

/** The starting draft for the feedback form. */
export function createFeedbackDraft(context: FeedbackContext = {}): FeedbackDraft {
  return {
    senderName: "",
    category: context.category ?? "",
    message: "",
    gameId: context.gameId ?? null,
  };
}

/** What still blocks sending, in form order, or null when the draft is complete. */
export function feedbackDraftError(draft: FeedbackDraft): FeedbackDraftError | null {
  if (!draft.senderName.trim()) return "nameRequired";
  if (!draft.category) return "categoryRequired";
  if (!draft.message.trim()) return "messageRequired";
  return null;
}

/** Collapse anything that would break the single-line name (the server refuses control characters). */
function singleLine(value: string): string {
  return value.replace(/\p{Cc}+/gu, " ").trim();
}

export async function submitFeedback(
  deps: { api: Pick<PlatformApi, "request"> },
  draft: FeedbackDraft,
  clientPlatform: "web" | "mobile",
): Promise<SubmitFeedbackOutcome> {
  const error = feedbackDraftError(draft);
  if (error) return { kind: "error", key: error };
  const senderName = singleLine(draft.senderName).slice(0, FEEDBACK_SENDER_NAME_MAX_LENGTH);
  const message = draft.message.trim().slice(0, FEEDBACK_MESSAGE_MAX_LENGTH);
  try {
    const res = await deps.api.request("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderName,
        category: draft.category,
        message,
        ...(draft.gameId ? { gameId: draft.gameId } : {}),
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
