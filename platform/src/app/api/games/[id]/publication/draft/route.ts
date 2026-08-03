import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import {
  PublicationError,
  savePublicationDraft,
} from "@/services/game-publications";

/**
 * The DRAFT publication request of `[id]` — written by the publish dialog's
 * translate step so the parent's paid listing translations survive closing the
 * dialog. The body is a vault-SEALED blob (enc:v1:): the source game is still
 * E2EE-private at draft time, so the server never sees these texts in
 * plaintext (that disclosure happens at submit). Read back via the sibling
 * publication GET; converted into the submit log row by submitPublication.
 */
const DraftSchema = z.object({
  listingTranslationsEnc: z.string().startsWith("enc:v1:").max(200_000),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId } = auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await savePublicationDraft(serviceClient(), {
      sourceGameId: id,
      accountId,
      listingTranslationsEnc: parsed.data.listingTranslationsEnc,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PublicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverErrorResponse(
      error,
      "Failed to save publication draft",
      "api/games/[id]/publication/draft#PUT",
      { accountId },
    );
  }
}
