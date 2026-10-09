import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Tripwire: every route an agent bearer (the dodi CLI) can reach is listed
 * here with its scope. Opening a new route to agents is a deliberate change
 * to this list, never a side effect.
 */
const AGENT_ROUTES: Record<string, string[]> = {
  "authorized-clients/self/route.ts": ["any", "any"],
  "character-assets/[id]/publication/route.ts": [
    "assets:publish",
    "assets:publish",
  ],
  "character-assets/[id]/route.ts": ["assets", "assets"],
  "character-assets/route.ts": ["assets", "assets"],
  "character-assets/shared/route.ts": ["assets"],
  "games/[id]/publication/draft/route.ts": ["games:publish"],
  "games/[id]/publication/route.ts": ["games:publish", "games:publish"],
  "games/[id]/route.ts": ["games", "games"],
  "games/[id]/versions/[versionId]/route.ts": ["games"],
  "games/[id]/versions/route.ts": ["games"],
  "games/route.ts": ["games", "games"],
  "games/screenshot/route.ts": ["games"],
  "kids/[id]/dossier/route.ts": ["kids:memory"],
  "kids/route.ts": ["any"],
  "vault/keys/route.ts": ["any"],
  "whoami/route.ts": ["any"],
};

const API_DIR = path.join(__dirname, "..", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("agent-reachable routes", () => {
  it("match the reviewed list", () => {
    const found: Record<string, string[]> = {};
    for (const file of routeFiles(API_DIR)) {
      const scopes = [
        ...readFileSync(file, "utf8").matchAll(/agentScope: "([^"]+)"/g),
      ].map((m) => m[1]);
      if (scopes.length > 0) found[path.relative(API_DIR, file)] = scopes;
    }
    expect(found).toEqual(AGENT_ROUTES);
  });
});
