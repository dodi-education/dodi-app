/**
 * Normalize a raw `commands` array from an AI assistant response into safe,
 * typed GameCommand objects. Pure and browser-importable (no server deps) so the
 * client-side in-game assistant can sanitize the model's JSON output directly.
 */
import type { Json } from "@/types/database";
import type { GameCommand } from "@/types/games";

function toJsonValue(value: unknown): Json | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const next: Json[] = [];
    for (const item of value) {
      const parsed = toJsonValue(item);
      if (parsed !== undefined) {
        next.push(parsed);
      }
    }
    return next;
  }

  if (typeof value === "object") {
    const next: Record<string, Json | undefined> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = toJsonValue(nested);
    }
    return next;
  }

  return undefined;
}

function toJsonRecord(value: unknown): Record<string, Json | undefined> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const next: Record<string, Json | undefined> = {};
  for (const [key, nested] of Object.entries(value)) {
    next[key] = toJsonValue(nested);
  }

  return next;
}

export function normalizeCommands(raw: unknown): GameCommand[] {
  if (!Array.isArray(raw)) return [];

  const commands: GameCommand[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    if (typeof record.type !== "string") continue;

    const payload =
      record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
        ? toJsonRecord(record.payload)
        : undefined;

    commands.push({
      type: record.type,
      payload,
    });

    if (commands.length >= 10) break;
  }

  return commands;
}
