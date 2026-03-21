import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("save-voice-game");
import { createCustomGame, updateCustomGame } from "@/lib/services/games";
import { sanitizeGameBundle } from "@/lib/game-sanitizer";

const SaveVoiceCreatedSchema = z.object({
  profileId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  subject: z.string().max(100).optional(),
  difficulty: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  codeBundle: z.string().min(1),
  markdown: z.string().optional(),
  gameId: z.string().uuid().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = SaveVoiceCreatedSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, title, description, subject, difficulty, tags, codeBundle, markdown, gameId } =
    parsed.data;
  log.info("save_requested", {
    profileId,
    title,
    gameId,
    isUpdate: !!gameId,
    codeSizeChars: codeBundle.length,
  });

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Validate the code bundle
    const sanitized = sanitizeGameBundle(codeBundle);

    if (gameId) {
      // Update existing game (remix save)
      const game = await updateCustomGame(supabase, gameId, {
        title,
        description: description ?? "",
        subject: subject ?? "creativity",
        difficulty: difficulty ?? "easy",
        tags: tags ?? [],
        code_bundle: sanitized.code,
        markdown: markdown ?? "",
      });

      log.info("save_complete", { profileId, gameId: game.id, created: false });
      return NextResponse.json({ game, created: false });
    }

    // Create new game
    const game = await createCustomGame(supabase, {
      accountId: user.id,
      profileId,
      title,
      description: description ?? "",
      subject: subject ?? "creativity",
      difficulty: difficulty ?? "easy",
      tags: tags ?? [],
      codeBundle: sanitized.code,
      markdown: markdown ?? "",
      createdBy: "ai",
    });

    log.info("save_complete", { profileId, gameId: game.id, created: true });
    return NextResponse.json({ game, created: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save game";
    log.error("save_failed", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
