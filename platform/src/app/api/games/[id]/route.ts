import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import type { GameUpdate, Json } from "@dodi/types/database";
import {
  deleteCustomGame,
  getGame,
  getPlayableGame,
  isGameVisibleToKid,
  replaceGameSharings,
  restoreGameVersion,
  updateCustomGame,
} from "@/services/games";
import { getKid } from "@/services/kids";
import { getTranslation, applyTranslation } from "@/services/game-translations";

// Content fields arrive SEALED (enc:v1:) for private games, so every cap here is
// sized for ciphertext: an enc:v1: record costs about 43 + 1.34n characters. The
// server cannot validate the plaintext shape — these bounds are DoS guards, not
// business rules. The real plaintext limits live client-side in the studio and
// in @dodi/games/sanitizer.
const UpdateGameSchema = z.object({
  title: z.string().min(1).max(2_000).optional(),
  description: z.string().max(20_000).optional(),
  target_age_min: z.number().int().min(1).max(25).optional(),
  target_age_max: z.number().int().min(1).max(25).optional(),
  estimated_duration_minutes: z.number().int().min(1).max(180).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  code_bundle: z.string().min(1).max(1_000_000).optional(),
  markdown: z.string().max(400_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  learning_goal: z.string().max(10_000).optional(),
  success_definition: z.string().max(10_000).optional(),
  // The client maps the success definition to structured criteria in the browser
  // (BYOK: the provider key never reaches the server) and sends the result here
  // — sealed as an enc:v1: string for private games, a plain object otherwise.
  success_criteria: z
    .union([z.string().max(50_000), z.record(z.string(), z.unknown())])
    .optional(),
  preview_image: z.string().max(2_000_000).nullable().optional(),
  progress_kind: z.enum(["goal", "open"]).optional(),
  // enc:v1: sealed studio conversation transcript (server stays blind).
  agent_transcript_enc: z.string().nullable().optional(),
  kid_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  audience: z
    .object({
      isFamily: z.boolean(),
      audienceIds: z.array(z.string().uuid()),
    })
    .optional(),
  // Version history controls. create_version=false: a code_bundle change
  // overwrites the current head version instead of appending a new one.
  // restore_version_id: switch the game to an existing version (exclusive
  // with code_bundle — a restore never writes new code).
  create_version: z.boolean().optional(),
  restore_version_id: z.string().uuid().optional(),
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

  const { searchParams } = new URL(request.url);
  const kidId = searchParams.get("kidId") ?? undefined;
  let locale = searchParams.get("locale") ?? "en";

  try {
    // Kid reads may target a published Discover row this family shared — those
    // belong to other accounts (RLS-hidden), so the kid path resolves through
    // the sanitized service-role fallback. Parent reads stay RLS-only.
    const game = kidId
      ? await getPlayableGame(supabase, serviceClient(), id)
      : await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Kid deep-link: scope the read to a kid — derive its locale and gate on
    // visibility so inactive/unshared games 404 even via a direct URL.
    if (kidId) {
      const kid = await getKid(supabase, kidId);
      if (!kid || kid.account_id !== accountId) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      locale = kid.language;
      if (!(await isGameVisibleToKid(supabase, game, kidId, accountId))) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
    }

    const translation = await getTranslation(supabase, game.id, locale);
    return NextResponse.json(applyTranslation(game, translation));
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch game", "api/games/[id]#GET", {
      accountId,
    });
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

    // A submitted publication copy is frozen: editing it here would let a parent
    // change the content after review saw it. Re-submit from the source game
    // instead (RLS enforces this too — this is just the readable error).
    if (existing.publication_requested_at) {
      return NextResponse.json(
        { error: "Cannot edit a published game — re-submit from the original" },
        { status: 403 },
      );
    }

    // `audience` lives in the game_sharings table; `metadata` is a column that
    // we shallow-merge. `is_active` / `kid_id` flow through as plain columns.
    const {
      audience,
      metadata: rawMetadata,
      success_criteria: rawCriteria,
      create_version: createVersion,
      restore_version_id: restoreVersionId,
      ...columnUpdates
    } = parsed.data;

    if (restoreVersionId && columnUpdates.code_bundle) {
      return NextResponse.json(
        { error: "restore_version_id cannot be combined with code_bundle" },
        { status: 400 },
      );
    }

    if (restoreVersionId) {
      const game = await restoreGameVersion(supabase, id, restoreVersionId);
      return NextResponse.json(game);
    }

    const updates: GameUpdate = { ...columnUpdates };

    if (rawMetadata !== undefined) {
      const existingMeta =
        existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
          ? (existing.metadata as Record<string, unknown>)
          : {};
      updates.metadata = { ...existingMeta, ...rawMetadata } as GameUpdate["metadata"];
    }

    // The structured success criteria are mapped client-side (the provider key
    // that drives the mapping lives only in the unlocked vault) and arrive
    // sealed; progress_kind flows through as a plain column.
    if (rawCriteria !== undefined) {
      updates.success_criteria = rawCriteria as unknown as Json;
    }

    // No bundle sanitizing here: the code is ciphertext. The studio sanitizes
    // before sealing (@dodi/games/sanitizer), and the publication path
    // re-sanitizes the plaintext copy it receives.
    const game =
      Object.keys(updates).length > 0
        ? await updateCustomGame(supabase, id, updates, { createVersion })
        : existing;

    if (audience) {
      await replaceGameSharings(supabase, id, accountId, {
        family: audience.isFamily,
        kidIds: audience.audienceIds,
      });
    }

    return NextResponse.json(game);
  } catch (error) {
    return serverErrorResponse(error, "Failed to update game", "api/games/[id]#PATCH", {
      accountId,
    });
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
    return serverErrorResponse(error, "Failed to delete game", "api/games/[id]#DELETE", {
      accountId,
    });
  }
}
