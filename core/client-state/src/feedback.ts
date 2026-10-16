/**
 * "Give feedback": feature requests, bug reports, inappropriate content and
 * anything else a parent wants to tell the dodi team. Flagging inappropriate
 * content is also the in-app report path Google Play requires for AI-generated
 * content and the App Store for user-generated content (Discover games open
 * the form with that category and the game attached).
 *
 * The message goes to the operator in plaintext (POST /api/feedback), with the
 * account email so the team can reply; the form says so before it is sent.
 * A parent may attach one image (a screenshot, say). It is re-encoded on the
 * device first (`prepareFeedbackImage`), which bounds its size and drops EXIF
 * data such as a photo's location.
 */
import {
  dataUrlByteLength,
  FEEDBACK_CATEGORIES,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
} from "@dodi/protocol/feedback";
import type { FeedbackCategory } from "@dodi/types/database";

import type { PlatformApi } from "./platform";

export {
  FEEDBACK_CATEGORIES,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
};
export type { FeedbackCategory };

export interface FeedbackDraft {
  senderName: string;
  category: FeedbackCategory | "";
  message: string;
  /** Set when the form was opened from a game (it travels as context, not as a choice). */
  gameId: string | null;
  /** The attached image as a JPEG data URL, already prepared; null for none. */
  image: string | null;
}

/** Where the form was opened from: a Discover game presets the category and attaches the game. */
export interface FeedbackContext {
  category?: FeedbackCategory;
  gameId?: string | null;
}

/**
 * The largest file a parent may pick. It is shrunk well below the upload limit
 * before sending; this only spares the device from decoding something huge.
 */
export const FEEDBACK_IMAGE_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

/** A box the image is scaled down into, and the JPEG quality (0..1) to encode it at. */
export interface FeedbackImageBound {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

/**
 * Raster work on the device (a canvas on the web, the native image
 * manipulator on mobile). Matches `ImageOps.downscale` of `@dodi/studio`:
 * scale down into the bound and encode as a JPEG data URL, null when the
 * image cannot be read.
 */
export interface FeedbackImageScaler {
  downscale(dataUrl: string, bound: FeedbackImageBound): Promise<string | null>;
}

/**
 * Tried in order until the JPEG fits FEEDBACK_IMAGE_MAX_BYTES. The first one
 * keeps a phone screenshot's text sharp and almost always fits.
 */
export const FEEDBACK_IMAGE_BOUNDS: readonly FeedbackImageBound[] = [
  { maxWidth: 2048, maxHeight: 2048, quality: 0.85 },
  { maxWidth: 1600, maxHeight: 1600, quality: 0.75 },
  { maxWidth: 1280, maxHeight: 1280, quality: 0.7 },
];

/** A `feedback` message key for an image that cannot be attached. */
export type FeedbackImageError = "imageUnreadable" | "imageTooLarge";

export type PrepareFeedbackImageOutcome =
  | { kind: "ready"; image: string }
  | { kind: "error"; key: FeedbackImageError };

/** A `feedback` message key for a draft that cannot be sent yet. */
export type FeedbackDraftError = "nameRequired" | "categoryRequired" | "messageRequired";

export type SubmitFeedbackOutcome =
  | { kind: "sent" }
  /** A `feedback` message key. */
  | { kind: "error"; key: FeedbackDraftError | "imageTooLarge" | "rateLimited" | "failed" };

/** The starting draft for the feedback form. */
export function createFeedbackDraft(context: FeedbackContext = {}): FeedbackDraft {
  return {
    senderName: "",
    category: context.category ?? "",
    message: "",
    gameId: context.gameId ?? null,
    image: null,
  };
}

/** Whether a picked file is too large to even try (its size in bytes, when known). */
export function feedbackImageSourceError(byteSize: number | null | undefined): FeedbackImageError | null {
  return byteSize != null && byteSize > FEEDBACK_IMAGE_SOURCE_MAX_BYTES ? "imageTooLarge" : null;
}

/**
 * Turn a picked or pasted image (any data URL the device can decode) into
 * the JPEG that gets sent: scaled into the first bound it fits at, re-encoded
 * so no EXIF data survives.
 */
export async function prepareFeedbackImage(
  scaler: FeedbackImageScaler,
  source: string,
): Promise<PrepareFeedbackImageOutcome> {
  for (const bound of FEEDBACK_IMAGE_BOUNDS) {
    const image = await scaler.downscale(source, bound).catch(() => null);
    if (!image) return { kind: "error", key: "imageUnreadable" };
    if (dataUrlByteLength(image) <= FEEDBACK_IMAGE_MAX_BYTES) return { kind: "ready", image };
  }
  return { kind: "error", key: "imageTooLarge" };
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
        ...(draft.image ? { image: draft.image } : {}),
        clientPlatform,
      }),
    });
    if (res.ok) return { kind: "sent" };
    if (res.status === 413) return { kind: "error", key: "imageTooLarge" };
    if (res.status === 429) return { kind: "error", key: "rateLimited" };
    return { kind: "error", key: "failed" };
  } catch {
    return { kind: "error", key: "failed" };
  }
}
