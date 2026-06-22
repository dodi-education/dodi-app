import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { sanitizeGameBundle } from "@dodi/platform/game-sanitizer";
import type { GameUpdate, Json } from "@dodi/types/database";
import {
  deleteCustomGame,
  getGame,
  replaceGameSharings,
  updateCustomGame,
} from "@dodi/platform/services/games";
import { mapSuccessDefinition } from "@/lib/services/game-generation";
import { getTranslation, applyTranslation } from "@dodi/platform/services/game-translations";
import { createLogger } from "@dodi/platform/logger";

const log = createLogger("game-update");

const UpdateGameSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  target_age_min: z.number().int().min(1).max(25).optional(),
  target_age_max: z.number().int().min(1).max(25).optional(),
  estimated_duration_minutes: z.number().int().min(1).max(180).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  code_bundle: z.string().min(1).optional(),
  markdown: z.string().max(100000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  learning_goal: z.string().max(2000).optional(),
  success_definition: z.string().max(2000).optional(),
  profile_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  audience: z
    .object({
      isFamily: z.boolean(),
      audienceIds: z.array(z.string().uuid()),
    })
    .optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? "en";

  try {
    const game = await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const translation = await getTranslation(supabase, game.id, locale);
    return NextResponse.json(applyTranslation(game, translation));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = UpdateGameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const existing = await getGame(supabase, id);
    if (!existing) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (existing.is_system) {
      return NextResponse.json(
        { error: "Cannot edit system game directly" },
        { status: 403 },
      );
    }

    // `audience` lives in the game_sharings table; `metadata` is a column that
    // we shallow-merge. `is_active` / `profile_id` flow through as plain columns.
    const { audience, metadata: rawMetadata, ...columnUpdates } = parsed.data;
    const updates: GameUpdate = { ...columnUpdates };

    if (rawMetadata !== undefined) {
      const existingMeta =
        existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
          ? (existing.metadata as Record<string, unknown>)
          : {};
      updates.metadata = { ...existingMeta, ...rawMetadata } as GameUpdate["metadata"];
    }

    if (updates.code_bundle) {
      updates.code_bundle = sanitizeGameBundle(updates.code_bundle).code;
    }

    // When the success definition changes, re-derive the structured criteria so
    // the host can evaluate it — without regenerating the game code.
    if (parsed.data.success_definition !== undefined) {
      try {
        const mapped = await mapSuccessDefinition(
          supabase,
          user.id,
          parsed.data.success_definition,
          { learningGoal: parsed.data.learning_goal ?? existing.learning_goal },
        );
        updates.success_criteria = mapped.successCriteria as unknown as Json;
        updates.progress_kind = mapped.progressKind;
      } catch (mapErr) {
        // Persist the text even if mapping fails; criteria stay as-is.
        log.warn("success_mapping_failed", {
          gameId: id,
          error: mapErr instanceof Error ? mapErr.message : "unknown",
        });
      }
    }

    const game =
      Object.keys(updates).length > 0
        ? await updateCustomGame(supabase, id, updates)
        : existing;

    if (audience) {
      await replaceGameSharings(supabase, id, user.id, {
        family: audience.isFamily,
        profileIds: audience.audienceIds,
      });
    }

    return NextResponse.json(game);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await getGame(supabase, id);
    if (!existing) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (existing.is_system) {
      return NextResponse.json(
        { error: "Cannot delete system game" },
        { status: 403 },
      );
    }

    await deleteCustomGame(supabase, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
