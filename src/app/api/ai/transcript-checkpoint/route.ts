import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // sendBeacon sends with Content-Type: text/plain, not JSON
    const raw = await request.text();
    const body: unknown = JSON.parse(raw);

    if (
      typeof body !== "object" ||
      body === null ||
      !("profileId" in body) ||
      !("transcript" in body)
    ) {
      return NextResponse.json(
        { error: "Missing profileId or transcript" },
        { status: 400 },
      );
    }

    const { profileId, transcript, sessionStartedAt } = body as {
      profileId: string;
      transcript: string;
      sessionStartedAt?: string;
    };

    // Verify profile ownership
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Upsert checkpoint — one per profile, latest always wins
    const { error } = await supabase
      .from("transcript_checkpoints")
      .upsert(
        {
          profile_id: profileId,
          account_id: user.id,
          transcript,
          session_started_at: sessionStartedAt ?? null,
        },
        { onConflict: "profile_id" },
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save checkpoint";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
