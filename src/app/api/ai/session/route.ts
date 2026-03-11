import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import {
  decryptProviderKey,
  getModelConfig,
} from "@/lib/services/ai-providers";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import { getMemory, getParentNotes, EMPTY_MEMORY_HINT } from "@/lib/services/memory";
import { logMemoryEvent } from "@/lib/services/system-logs";
import { listGameCatalog, type GameCatalogEntry } from "@/lib/services/games";

const SessionRequestSchema = z.object({
  profileId: z.string().uuid(),
});

function buildSystemInstruction(
  soul: string,
  memory: string | null,
  parentNotes: string | null,
  name: string,
  birthdate: string | null,
  language: string,
  gameCatalog: GameCatalogEntry[],
): string {
  let ageClause = "";
  if (birthdate) {
    const birth = new Date(birthdate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    if (age > 0) {
      ageClause = ` (${age} years old)`;
    }
  }

  const languageName =
    language === "de" ? "German" : "English";

  const sections: string[] = [soul];

  // Kid memory (or first-meeting hint)
  if (memory) {
    sections.push("", "## What You Know About This Child", memory);
  } else {
    sections.push("", "## First Meeting", EMPTY_MEMORY_HINT);
  }

  // Parent notes (read-only context)
  if (parentNotes) {
    sections.push("", "## Parent Notes", parentNotes);
  }

  // Session context
  sections.push(
    "",
    "## Current Session Context",
    `- Child's name: ${name}${ageClause}`,
    `- Language: ${languageName}`,
    `- Start by greeting ${name} by name`,
  );

  // Available games
  if (gameCatalog.length > 0) {
    sections.push(
      "",
      "## Available Games",
      "When the child asks to play a game, use the `launch_game` tool with the `game_id` from this catalog. If you're unsure which game they mean, use `search_query` or `subject` to show them matching options.",
      "",
      "| id | title | subject | tags |",
      "|----|-------|---------|------|",
      ...gameCatalog.map(
        (g) => `| ${g.id} | ${g.title} | ${g.subject} | ${g.tags.join(", ")} |`,
      ),
    );
  }

  return sections.join("\n");
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const result = SessionRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  const { profileId } = result.data;

  try {
    // Fetch the profile and verify ownership
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Get the model config
    const modelConfig = await getModelConfig(supabase, user.id);
    if (!modelConfig) {
      return NextResponse.json(
        { error: "No AI provider configured" },
        { status: 400 },
      );
    }

    // Decrypt the API key for the voice provider
    const apiKey = await decryptProviderKey(
      supabase,
      user.id,
      modelConfig.voiceProvider,
    );

    // Fetch the active persona (or fall back to global default)
    let persona = profile.active_persona_id
      ? await getPersona(supabase, profile.active_persona_id)
      : null;
    if (!persona) {
      persona = await getGlobalDefaultPersona(supabase);
    }
    if (!persona) {
      return NextResponse.json(
        { error: "No persona available" },
        { status: 500 },
      );
    }

    // Fetch memory, parent notes, and game catalog
    const [memory, parentNotes, gameCatalog] = await Promise.all([
      getMemory(supabase, profileId),
      getParentNotes(supabase, profileId),
      listGameCatalog(supabase, profileId),
    ]);

    // Build the system instruction with persona soul + memory + kid context + games
    const systemInstruction = buildSystemInstruction(
      persona.soul,
      memory,
      parentNotes,
      profile.display_name,
      profile.birthdate,
      profile.language,
      gameCatalog,
    );

    // Log session_start (non-blocking)
    logMemoryEvent(supabase, {
      profile_id: profileId,
      account_id: user.id,
      persona_id: persona.id,
      event: "session_start",
      message: `Voice session started with persona ${persona.name}`,
    }).catch(() => {
      // logging failure is non-critical
    });

    // Build launch_game tool declaration if games are available
    const tools = gameCatalog.length > 0
      ? [
          {
            name: "launch_game",
            description:
              "Navigate the child to a game or show matching games. Use game_id for a specific game, or search_query/subject to filter the game library.",
            parameters: {
              type: "object",
              properties: {
                game_id: {
                  type: "string",
                  description: "The UUID of a specific game from the catalog",
                },
                search_query: {
                  type: "string",
                  description: "Free-text search to filter games",
                },
                subject: {
                  type: "string",
                  description: "Subject filter (e.g. math, creativity, science)",
                },
              },
            },
          },
        ]
      : [];

    return NextResponse.json({
      apiKey,
      model: modelConfig.voiceModel,
      voiceName: modelConfig.voiceName,
      systemInstruction,
      language: profile.language,
      ...(tools.length > 0 ? { tools } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
