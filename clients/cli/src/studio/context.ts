/**
 * Who the studio works for, as seen by this agent: the family's kids
 * (decrypted here; names and ages with `kids:basic`, memory and the parent's
 * notes with `kids:memory`) and the parent's UI language, which the studio
 * thread is written in because the parent reads it later in the app.
 */
import type { StudioKid } from "@dodi/studio/build-runner";
import { loadStudioSessionTexts, type StudioSessionContext } from "@dodi/studio/studio-session";

import type { Connection } from "../lib/session";

interface AgentKidRow {
  id: string;
  language: string;
  display_name?: string;
  birthdate?: string | null;
  memory?: string | null;
  parent_notes?: string | null;
}

export async function loadStudioContext(conn: Connection): Promise<StudioSessionContext> {
  const [rows, self] = await Promise.all([
    conn.api<AgentKidRow[]>("/api/kids"),
    conn.api<{ language?: string }>("/api/authorized-clients/self"),
  ]);
  const open = (value: string | null | undefined) => (value ? conn.vault.decryptField(value) : null);
  const kids: StudioKid[] = rows.map((row) => ({
    id: row.id,
    name: open(row.display_name) ?? "",
    birthdate: open(row.birthdate),
    memory: open(row.memory),
    parent_notes: open(row.parent_notes),
    language: row.language,
  }));
  const locale = self.language ?? "en";
  return { kids, locale, texts: await loadStudioSessionTexts(locale) };
}
