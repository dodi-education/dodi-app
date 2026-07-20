import { describe, expect, it } from "vitest";

import { tokenizeDossier } from "./dossier-citations";

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";

describe("tokenizeDossier", () => {
  it("splits text and citations, numbering in reading order", () => {
    const doc = `## Interests\n- Loves mango [source:${S1}]\n- Builds towers [source:${S2}]`;
    const tokens = tokenizeDossier(doc);

    expect(tokens).toEqual([
      { type: "text", text: "## Interests\n- Loves mango" },
      { type: "citation", sourceId: S1, num: 1 },
      { type: "text", text: "\n- Builds towers" },
      { type: "citation", sourceId: S2, num: 2 },
    ]);
  });

  it("reuses the number when the same source is cited again", () => {
    const doc = `- A [source:${S1}]\n- B [source:${S2}] [source:${S1}]`;
    const nums = tokenizeDossier(doc)
      .filter((t) => t.type === "citation")
      .map((t) => t.num);
    expect(nums).toEqual([1, 2, 1]);
  });

  it("swallows the whitespace before a marker so text ends cleanly", () => {
    const [text] = tokenizeDossier(`word   [source:${S1}]`);
    expect(text).toEqual({ type: "text", text: "word" });
  });

  it("returns the whole input as one text token when there are no citations", () => {
    expect(tokenizeDossier("plain text")).toEqual([
      { type: "text", text: "plain text" },
    ]);
  });

  it("ignores malformed markers", () => {
    const doc = "- A [source:not-a-uuid] B";
    expect(tokenizeDossier(doc)).toEqual([{ type: "text", text: doc }]);
  });
});
