import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { applyPlanToAccount } from "@/services/plans";

const SelectPlanSchema = z.object({ handle: z.string().min(1) });

/**
 * User-authed: subscribe the account to a plan, copying its entitlement limits
 * onto the account. Used by the onboarding plan picker and later plan changes.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = SelectPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await applyPlanToAccount(supabase, accountId, parsed.data.handle);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set plan";
    const status = message.startsWith("Unknown or inactive plan") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
