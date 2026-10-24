import { describe, expect, it } from "vitest";

import { isReadByDodi, type StudioChatMessage, userTurn } from "./transcript";

const AT = "2026-10-24T09:15:00.000Z";

describe("userTurn", () => {
  it("stamps the parent's turn and leaves out an empty image list", () => {
    expect(userTurn("make it red", [], AT)).toEqual({ role: "user", text: "make it red", at: AT });
    expect(userTurn("like this", ["data:a"], AT).images).toEqual(["data:a"]);
  });
});

describe("isReadByDodi", () => {
  const answered: StudioChatMessage[] = [userTurn("make it", [], AT), { role: "assistant", text: "Done." }];

  it("is read once dodi replied", () => {
    expect(isReadByDodi(answered, 0, false)).toBe(true);
  });

  it("is read while dodi works on the latest turn", () => {
    const pending = [...answered, userTurn("now blue", [], AT)];
    expect(isReadByDodi(pending, 2, true)).toBe(true);
    expect(isReadByDodi(pending, 2, false)).toBe(false);
  });

  it("an unanswered turn is read once a later turn got a reply", () => {
    const thread: StudioChatMessage[] = [
      userTurn("first (no provider)", [], AT),
      userTurn("second", [], AT),
      { role: "assistant", text: "Done." },
    ];
    expect(isReadByDodi(thread, 0, false)).toBe(true);
  });

  it("never marks dodi's own replies", () => {
    expect(isReadByDodi(answered, 1, true)).toBe(false);
  });
});
