import { NextResponse } from "next/server";

import { SendFeedbackRequestSchema } from "@dodi/protocol/feedback";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { notifyFeedbackReceived } from "@/services/feedback-notifications";
import {
  createFeedbackMessage,
  decodeFeedbackImage,
  FeedbackTargetError,
  type FeedbackImage,
} from "@/services/feedback-messages";
import { consumeRateLimit } from "@/services/rate-limits";

/** Messages per account and hour: plenty for real use, a cap on inbox spam. */
const FEEDBACK_LIMIT = { bucket: "feedback", limit: 20, windowMs: 60 * 60 * 1000 };

/** Well above the largest valid body (a 2 MiB image is about 2.8 MB of base64). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * User-authed: "Give feedback". A feature request, bug report, inappropriate
 * content (the in-app flagging Google Play requires for AI-generated content,
 * and the App Store for user-generated content) or anything else, with an
 * optional image. Stored plaintext for the ops console and emailed to the
 * operator, the image as an attachment.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId } = auth;

  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }
  const body: unknown = await request.json().catch(() => null);
  const result = SendFeedbackRequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }
  const input = result.data;
  let image: FeedbackImage | null = null;
  if (input.image) {
    image = decodeFeedbackImage(input.image);
    if (!image) {
      return NextResponse.json(
        { error: "The image must be a JPEG, PNG or WebP file", code: "INVALID_IMAGE" },
        { status: 400 },
      );
    }
  }

  try {
    const attempt = await consumeRateLimit(serviceDb, { accountId, ...FEEDBACK_LIMIT });
    if (!attempt.allowed) {
      return NextResponse.json({ error: "Too many messages", code: "RATE_LIMITED" }, { status: 429 });
    }

    const feedback = await createFeedbackMessage(serviceDb, {
      accountId,
      senderName: input.senderName,
      category: input.category,
      message: input.message,
      gameId: input.gameId ?? null,
      clientPlatform: input.clientPlatform,
      image,
    });
    await notifyFeedbackReceived(serviceDb, feedback, image);
    return NextResponse.json({ id: feedback.id }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackTargetError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverErrorResponse(error, "Failed to send feedback", "api/feedback#POST", {
      accountId,
      expose: false,
    });
  }
}
