import { NextResponse } from "next/server";
import { z } from "zod/v4";

import {
  isValidPublicationHandle,
  normalizePublicationHandle,
  publicationHandleError,
} from "@dodi/protocol/publication-handle";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import {
  isPublicationHandleAvailable,
  setAccountPublicationHandle,
} from "@/services/accounts";

/**
 * The account's PUBLIC author byline for dodi Discover. Chosen on the first
 * publish and editable afterwards; the rules live in
 * `@dodi/protocol/publication-handle` so the form and this route agree.
 */
const SetHandleSchema = z.object({ handle: z.string().min(1).max(64) });

/** `?handle=` availability probe. Returns a boolean only, never a listing. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId } = auth;

  const raw = new URL(request.url).searchParams.get("handle") ?? "";
  const handle = normalizePublicationHandle(raw);
  const invalid = publicationHandleError(handle);
  if (invalid) {
    return NextResponse.json({ available: false, reason: invalid });
  }

  try {
    const available = await isPublicationHandleAvailable(serviceClient(), handle);
    return NextResponse.json({ available, handle });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to check handle",
      "api/account/publication-handle#GET",
      { accountId },
    );
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = SetHandleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const handle = normalizePublicationHandle(parsed.data.handle);
  if (!isValidPublicationHandle(handle)) {
    return NextResponse.json(
      { error: "Invalid handle", reason: publicationHandleError(handle) },
      { status: 400 },
    );
  }

  try {
    const ok = await setAccountPublicationHandle(supabase, accountId, handle);
    if (!ok) {
      return NextResponse.json(
        { error: "That handle is already taken", reason: "taken" },
        { status: 409 },
      );
    }
    return NextResponse.json({ handle });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to set handle",
      "api/account/publication-handle#PUT",
      { accountId },
    );
  }
}
