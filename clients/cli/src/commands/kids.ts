/**
 * dodi kids [--memory <kid id>]: who the agent builds for. Names and ages need
 * the kids:basic scope, the memory dossier kids:memory. Both arrive sealed and
 * are opened here.
 */
import { ageFromBirthdate } from "@dodi/intl/age";

import { parse } from "../lib/args";
import { EXIT, type Output } from "../lib/output";
import { connect, type Connection } from "../lib/session";

const USAGE = "dodi kids [--memory <kid id>]";

interface AgentKidRow {
  id: string;
  language: string;
  display_name?: string;
  birthdate?: string | null;
}

export interface KidSummary {
  id: string;
  /** "Kid 1", "Kid 2" … without kids:basic. */
  name: string;
  age: number | null;
  language: string;
}

export async function listKids(conn: Connection): Promise<KidSummary[]> {
  const rows = await conn.api<AgentKidRow[]>("/api/kids");
  return rows.map((row, index) => ({
    id: row.id,
    name: row.display_name ? (conn.vault.decryptField(row.display_name) ?? `Kid ${index + 1}`) : `Kid ${index + 1}`,
    age: row.birthdate ? ageFromBirthdate(conn.vault.decryptField(row.birthdate)) : null,
    language: row.language,
  }));
}

export async function kidMemory(conn: Connection, kidId: string): Promise<string> {
  const { memory } = await conn.api<{ memory: string | null }>(`/api/kids/${encodeURIComponent(kidId)}/dossier`);
  return memory ? (conn.vault.decryptField(memory) ?? "") : "";
}

export async function runKids(argv: string[], out: Output): Promise<number> {
  const args = parse(argv, { memory: { type: "string" } }, USAGE);
  const memoryKid = args.str("memory");
  const conn = await connect();
  if (memoryKid) {
    const memory = await kidMemory(conn, memoryKid);
    out.result({ kidId: memoryKid, memory }, () => memory || "(no memory yet)");
    return EXIT.ok;
  }
  const kids = await listKids(conn);
  out.result({ kids }, () =>
    kids.length === 0
      ? "No kids in this family yet."
      : [
          "Use what you learn here only to choose difficulty and themes. Never put a kid's name or details into a game.",
          "",
          ...kids.map((kid) => `${kid.id}  ${kid.name}${kid.age != null ? `, ${kid.age}` : ""}  (${kid.language})`),
        ].join("\n"),
  );
  return EXIT.ok;
}
