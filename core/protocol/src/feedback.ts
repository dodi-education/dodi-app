/**
 * "Give feedback": what a parent sends the dodi team from the app (POST
 * /api/feedback). The platform route validates with this schema and the
 * clients build their drafts against the same limits, so the form can never
 * produce a request the server refuses for its shape.
 *
 * Feedback is plaintext by design: the parent writes to the operator on
 * purpose, and the form says so before it is sent. That includes the one
 * image a parent may attach (a screenshot, say), which travels as a base64
 * data URL in the same JSON body.
 */
import { z } from "zod/v4";

import type {
  FeedbackCategory,
  FeedbackClientPlatform,
  FeedbackImageContentType,
} from "@dodi/types/database";

/** Must match the `feedback_messages_category_check` CHECK constraint. */
export const FEEDBACK_CATEGORIES = [
  "feature_request",
  "bug_report",
  "inappropriate_content",
  "other",
] as const satisfies readonly FeedbackCategory[];

export const FEEDBACK_CLIENT_PLATFORMS = ["web", "mobile"] as const satisfies readonly FeedbackClientPlatform[];

/** Must match `feedback_messages_sender_name_length_check`. */
export const FEEDBACK_SENDER_NAME_MAX_LENGTH = 100;
/** Must match `feedback_messages_message_length_check`. */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;

/**
 * Must match `feedback_message_images_content_type_check`. The clients always
 * send JPEG (re-encoding drops EXIF data such as a photo's location); the
 * server also takes PNG and WebP, and checks the bytes, not just the label.
 */
export const FEEDBACK_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const satisfies readonly FeedbackImageContentType[];

/** Must match `feedback_message_images_byte_size_check`: 2 MiB of image bytes. */
export const FEEDBACK_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** The longest data URL that can hold FEEDBACK_IMAGE_MAX_BYTES. */
const IMAGE_DATA_URL_MAX_LENGTH =
  "data:image/jpeg;base64,".length + Math.ceil(FEEDBACK_IMAGE_MAX_BYTES / 3) * 4;

const IMAGE_DATA_URL_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** How many bytes a base64 data URL holds, without decoding it. */
export function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * No control characters (newlines included) in the name: it lands in the
 * operator email's subject line.
 */
const SINGLE_LINE_RE = /^[^\p{Cc}]*$/u;

export const SendFeedbackRequestSchema = z.object({
  senderName: z
    .string()
    .trim()
    .min(1)
    .max(FEEDBACK_SENDER_NAME_MAX_LENGTH)
    .regex(SINGLE_LINE_RE, "The name must be a single line"),
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX_LENGTH),
  /** Set when the parent opened the form from a game (a Discover report). */
  gameId: z.string().uuid().optional(),
  /** An attached image as a `data:image/{jpeg,png,webp};base64,` URL. */
  image: z
    .string()
    .max(IMAGE_DATA_URL_MAX_LENGTH)
    .regex(IMAGE_DATA_URL_RE, "The image must be a JPEG, PNG or WebP data URL")
    .refine((value) => dataUrlByteLength(value) <= FEEDBACK_IMAGE_MAX_BYTES, "The image is too large")
    .optional(),
  clientPlatform: z.enum(FEEDBACK_CLIENT_PLATFORMS),
});
export type SendFeedbackRequest = z.infer<typeof SendFeedbackRequestSchema>;
