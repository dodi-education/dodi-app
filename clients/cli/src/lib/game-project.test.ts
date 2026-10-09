import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readGameProject, renderGameMd, splitFrontMatter, toCreateBody, toUpdateBody } from "./game-project";
import { STARTER_BRIEFING, STARTER_GAME_HTML, starterMeta } from "./game-template";

async function folder(meta: string, code = STARTER_GAME_HTML): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "dodi-game-"));
  await writeFile(path.join(dir, "game.md"), meta);
  await writeFile(path.join(dir, "game.html"), code);
  return dir;
}

describe("game folder", () => {
  it("round-trips the starter through game.md", async () => {
    const dir = await folder(renderGameMd(starterMeta("Dino Count"), STARTER_BRIEFING));
    const project = await readGameProject(dir);
    expect(project.meta.title).toBe("Dino Count");
    expect(project.meta.capabilities).toEqual(["save_state"]);
    expect(project.briefing).toBe(STARTER_BRIEFING);
    expect(renderGameMd(project.meta, project.briefing)).toBe(renderGameMd(starterMeta("Dino Count"), STARTER_BRIEFING));
  });

  it("derives required metrics from the conditions", async () => {
    const dir = await folder(`---
title: Count
progress_kind: goal
success_criteria:
  description: ten right
  match: all
  conditions:
    - { metric: correct, op: ">=", value: 10 }
---
body`);
    const { meta } = await readGameProject(dir);
    expect(meta.success_criteria?.requiredMetrics).toEqual(["correct"]);
  });

  it.each([
    ["an unknown field", "title: x\ncolour: red", "unknown field"],
    ["a tag outside the catalog", "title: x\ntags: [dinosaurs]", '"tags" must come from'],
    ["an invented capability", "title: x\ncapabilities: [fly]", '"capabilities" must come from'],
    ["ages the wrong way round", "title: x\nage_min: 8\nage_max: 4", "above"],
    ["a missing title", "description: x", '"title" is required'],
  ])("rejects %s", async (_name, yaml, message) => {
    const dir = await folder(`---\n${yaml}\n---\n`);
    await expect(readGameProject(dir)).rejects.toThrow(message);
  });

  it("maps onto the create and update bodies", async () => {
    const dir = await folder(renderGameMd({ ...starterMeta("X"), audience: ["kid-2"] }, "brief"));
    const project = await readGameProject(dir);
    const create = toCreateBody(project, "kid-1", ["kid-1", "kid-2"], "<html></html>");
    expect(create).toMatchObject({ kidId: "kid-1", markdown: "brief", audience: { isFamily: false, audienceIds: ["kid-2"] } });
    expect(create.metadata).toMatchObject({ capabilities: ["save_state"], createdWith: "dodi-cli" });
    const update = toUpdateBody(project, ["kid-1", "kid-2"], "<html></html>");
    expect(update).toMatchObject({ code_bundle: "<html></html>", create_version: true });
    expect(() => toUpdateBody(project, ["kid-1"], "")).toThrow("unknown kid");
  });

  it("splits front matter only at the top", () => {
    expect(splitFrontMatter("---\na: 1\n---\nbody --- here")).toEqual({ yaml: "a: 1", body: "body --- here" });
    expect(splitFrontMatter("no front matter")).toBeNull();
  });
});
