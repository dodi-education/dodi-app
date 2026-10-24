import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Tripwire: the routes every scoped family member (role `member`) may reach
 * without a scope. Every other route admits them only through its concrete
 * agent scope (see resolveAuth), so opening a route to all members is a
 * deliberate change to this list, never a side effect.
 */
const MEMBER_ANY_ROUTES: Record<string, string[]> = {
  "account/members/[userId]/route.ts": ["any"],
  "account/members/route.ts": ["any"],
  "account/plan/route.ts": ["any"],
  "account/route.ts": ["any", "any"],
  "authorized-clients/register/route.ts": ["any"],
  "feedback/route.ts": ["any"],
  "kids/route.ts": ["any"],
  "vault/keys/route.ts": ["any"],
  "vault/unlock-keys/route.ts": ["any"],
};

const API_DIR = path.join(__dirname, "..", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("member-reachable routes", () => {
  it("match the reviewed list", () => {
    const found: Record<string, string[]> = {};
    for (const file of routeFiles(API_DIR)) {
      const scopes = [...readFileSync(file, "utf8").matchAll(/memberScope: "([^"]+)"/g)].map(
        (m) => m[1],
      );
      if (scopes.length > 0) found[path.relative(API_DIR, file)] = scopes;
    }
    expect(found).toEqual(MEMBER_ANY_ROUTES);
  });
});
