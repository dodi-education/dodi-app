/**
 * Client-side seal/open for a companion's custom tricks (custom_tricks.trick_enc),
 * via a VaultSession. The whole record is one enc:v1 JSON blob, so the server
 * never sees the trick's name, the kid's words or which bones it moves.
 */
import type { Json } from "@dodi/types/database";

import type { VaultSession } from "./session";

/** The sealed record, as stored. `script` is a motion script (@dodi/character). */
export interface CustomTrickRecord {
  v: 1;
  name: string;
  /** What the kid asked for, in their words. */
  description: string;
  /** The avatar model it was written for. */
  model: string;
  /** Bones it moves; an avatar without one of them can't do it. */
  requiredBones: string[];
  script: Json;
}

export function sealCustomTrick(session: VaultSession, record: CustomTrickRecord): string {
  return session.encryptJson(record as unknown as Json);
}

/** Opens a sealed trick; null when it doesn't open or isn't a trick record. */
export function openCustomTrick(session: VaultSession, trickEnc: string): CustomTrickRecord | null {
  let raw: unknown;
  try {
    raw = session.decryptJson<unknown>(trickEnc);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (
    record.v !== 1 ||
    typeof record.name !== "string" ||
    typeof record.model !== "string" ||
    !Array.isArray(record.requiredBones) ||
    typeof record.script !== "object" ||
    record.script === null
  ) {
    return null;
  }
  return {
    v: 1,
    name: record.name,
    description: typeof record.description === "string" ? record.description : "",
    model: record.model,
    requiredBones: record.requiredBones.filter((b): b is string => typeof b === "string"),
    script: record.script as Json,
  };
}
