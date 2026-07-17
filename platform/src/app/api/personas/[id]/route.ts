import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  deletePersona,
  getPersona,
  updatePersona,
} from "@/services/personas";

// Account personas are E2EE: `name`/`soul` arrive as opaque `enc:v1:`
// ciphertext, so these only bound the ciphertext (the client enforces the
// plaintext limits before sealing). The server never reads the plaintext.
const UpdatePersonaSchema = z.object({
  name: z.string().min(1).max(2000).optional(),
  soul: z.string().min(1).max(200000).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const persona = await getPersona(supabase, id);
    if (!persona || (!persona.is_system_default && persona.account_id !== accountId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(persona);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch persona",
      "api/personas/[id]#GET",
      { accountId, expose: false },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const existing = await getPersona(supabase, id);
  if (!existing || existing.account_id !== accountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.is_system_default) {
    return NextResponse.json(
      { error: "Cannot edit the default persona" },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const result = UpdatePersonaSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const persona = await updatePersona(supabase, id, result.data);
    return NextResponse.json(persona);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to update persona",
      "api/personas/[id]#PATCH",
      { accountId },
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const existing = await getPersona(supabase, id);
  if (!existing || existing.account_id !== accountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.is_system_default) {
    return NextResponse.json(
      { error: "Cannot delete the default persona" },
      { status: 403 },
    );
  }

  try {
    await deletePersona(supabase, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to delete persona",
      "api/personas/[id]#DELETE",
      { accountId, expose: false },
    );
  }
}
