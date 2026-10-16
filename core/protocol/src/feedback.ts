/**
 * "Give feedback": what a parent sends the dodi team from the app (POST
 * /api/feedback). The platform route validates with this schema and the
 * clients build their drafts against the same limits, so the form can never
 * produce a request the server refuses for its shape.
 *
 * Feedback is plaintext by design: the parent writes to the operator on
 * purpose, and the form says so before it is sent.
 */
import { z } from "zod/v4";

import type { FeedbackCategory, FeedbackClientPlatform } from "@dodi/types/database";

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
  clientPlatform: z.enum(FEEDBACK_CLIENT_PLATFORMS),
});
export type SendFeedbackRequest = z.infer<typeof SendFeedbackRequestSchema>;
