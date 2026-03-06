import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { sanitizeGameBundle } from "@/lib/game-sanitizer";
import type { GameUpdate } from "@/types/database";
import {
  deleteCustomGame,
  getGame,
  updateCustomGame,
} from "@/lib/services/games";

const UpdateGameSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  subject: z.string().min(1).max(60).optional(),
  difficulty: z.string().min(1).max(40).optional(),
  target_age_min: z.number().int().min(1).max(25).optional(),
  target_age_max: z.number().int().min(1).max(25).optional(),
  estimated_duration_minutes: z.number().int().min(1).max(180).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  code_bundle: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
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
    const game = await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json(game);
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

    const updates: GameUpdate = {
      ...parsed.data,
      metadata: parsed.data.metadata as GameUpdate["metadata"],
    };

    if (parsed.data.metadata === undefined) {
      delete updates.metadata;
    }

    if (updates.code_bundle) {
      updates.code_bundle = sanitizeGameBundle(updates.code_bundle).code;
    }

    const game = await updateCustomGame(supabase, id, updates);
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
