import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkStatic } from "./game-check";
import { FIXTURE_BRIEFING, FIXTURE_GAME_HTML, fixtureMeta } from "./game-fixture.test-support";
import { readGameProject, renderGameMd } from "./game-project";

async function project(code: string, meta = fixtureMeta("T")) {
  const dir = await mkdtemp(path.join(tmpdir(), "dodi-check-"));
  await writeFile(path.join(dir, "game.md"), renderGameMd(meta, FIXTURE_BRIEFING));
  await writeFile(path.join(dir, "game.html"), code);
  return readGameProject(dir);
}

describe("static check before pushing manual edits", () => {
  it("passes a complete game", async () => {
    expect(checkStatic(await project(FIXTURE_GAME_HTML)).errors).toEqual([]);
  });

  it("reports a game without the bridge", async () => {
    const result = checkStatic(await project("<html><body><script>console.log(1)</script></body></html>"));
    expect(result.errors.join("\n")).toMatch(/message event listener/);
  });

  it("blocks network access", async () => {
    const result = checkStatic(await project(FIXTURE_GAME_HTML.replace("render();\n    send(", "fetch('x');render();\n    send(")));
    expect(result.errors.join("\n")).toMatch(/fetch/);
    expect(result.sanitizedCode).toBeNull();
  });

  it("asks a goal game for its success protocol", async () => {
    const result = checkStatic(await project(FIXTURE_GAME_HTML, { ...fixtureMeta("T"), progress_kind: "goal" }));
    expect(result.errors.join("\n")).toMatch(/game:progress/);
    expect(result.errors.join("\n")).toMatch(/success_criteria/);
  });
});
