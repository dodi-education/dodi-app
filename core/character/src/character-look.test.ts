import { describe, expect, it } from "vitest";

import { COLOR_SWATCHES } from "./character-catalog";
import { defaultLook, isSameLook, sanitizeLook, shadeFor } from "./character-look";

describe("sanitizeLook", () => {
  it("reads garbage as the default look", () => {
    expect(sanitizeLook(null)).toEqual(defaultLook());
    expect(sanitizeLook("x")).toEqual(defaultLook());
  });

  it("falls back to the default model and drops what the model doesn't offer", () => {
    const look = sanitizeLook({
      model: "dragon",
      colors: { skin: "#FF0000", dark: "#000000", beak: "red", suit: "#00ff00" },
      accessories: ["party_hat", "headphones", "crown", "party_hat"],
    });
    expect(look).toEqual({ v: 1, model: "dodi", colors: { skin: "#ff0000", suit: "#00ff00" }, accessories: ["party_hat"] });
  });
});

describe("isSameLook", () => {
  it("ignores order", () => {
    const a = sanitizeLook({ colors: { skin: "#111111", suit: "#222222" }, accessories: ["glasses", "scarf"] });
    const b = sanitizeLook({ colors: { suit: "#222222", skin: "#111111" }, accessories: ["scarf", "glasses"] });
    expect(isSameLook(a, b)).toBe(true);
    expect(isSameLook(a, defaultLook())).toBe(false);
  });
});

describe("shadeFor", () => {
  it("uses a swatch's own shadow tone", () => {
    expect(shadeFor(COLOR_SWATCHES[3].base)).toBe(COLOR_SWATCHES[3].shade);
  });

  it("darkens other colors like the model's own pair", () => {
    expect(shadeFor("#808080", "#ffffff", "#c0c0c0")).toBe("#606060");
    expect(shadeFor("#808080")).toBe("#606060");
  });
});
