import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkGame, checkStatic } from "./game-check";
import { readGameProject, renderGameMd } from "./game-project";
import { STARTER_BRIEFING, STARTER_GAME_HTML, starterMeta } from "./game-template";

async function project(code: string, meta = starterMeta("T")) {
  const dir = await mkdtemp(path.join(tmpdir(), "dodi-check-"));
  await writeFile(path.join(dir, "game.md"), renderGameMd(meta, STARTER_BRIEFING));
  await writeFile(path.join(dir, "game.html"), code);
  return readGameProject(dir);
}

describe("dodi games check (static)", () => {
  it("passes the starter game", async () => {
    const result = checkStatic(await project(STARTER_GAME_HTML));
    expect(result.errors).toEqual([]);
    expect(result.translations.covered.sort()).toEqual(["de", "en"]);
  });

  it("reports a game without the bridge", async () => {
    const result = checkStatic(await project("<html><body><script>console.log(1)</script></body></html>"));
    expect(result.errors.join("\n")).toMatch(/message event listener/);
    expect(result.errors.join("\n")).toMatch(/game:ready/);
  });

  it("blocks network access", async () => {
    const result = checkStatic(await project(STARTER_GAME_HTML.replace("render();\n    send(", "fetch('x');render();\n    send(")));
    expect(result.errors.join("\n")).toMatch(/fetch/);
    expect(result.sanitizedCode).toBeNull();
  });

  it("asks a goal game for its success protocol", async () => {
    const result = checkStatic(await project(STARTER_GAME_HTML, { ...starterMeta("T"), progress_kind: "goal" }));
    expect(result.errors.join("\n")).toMatch(/game:progress/);
    expect(result.errors.join("\n")).toMatch(/success_criteria/);
  });

  it("warns when Discover languages are missing", async () => {
    const enOnly = STARTER_GAME_HTML.replace(
      /,"de":\{"game\.title"[^\n]*?\}\}\}/,
      "}}",
    );
    expect(enOnly).not.toContain('"de":');
    const result = checkStatic(await project(enOnly));
    expect(result.errors).toEqual([]);
    expect(result.warnings.join("\n")).toMatch(/missing de/);
  });

  it("skips the runtime when told to", async () => {
    const report = await checkGame(await project(STARTER_GAME_HTML), { runtime: "none" });
    expect(report.ok).toBe(true);
    expect(report.runtime).toBeNull();
  });
});
