import { describe, expect, it } from "vitest";

import { capImages } from "./thumbnail";

// downscaleDataUrl/fileToDataUrl need real canvas/FileReader (verified in-browser);
// only the pure attachment-cap logic is unit-tested here.
describe("capImages", () => {
  it("appends incoming images up to the cap", () => {
    expect(capImages(["a"], ["b", "c"], 3)).toEqual(["a", "b", "c"]);
  });

  it("drops overflow beyond the cap, keeping earlier images first", () => {
    expect(capImages(["a", "b"], ["c", "d"], 3)).toEqual(["a", "b", "c"]);
    expect(capImages([], ["a", "b", "c", "d"], 3)).toEqual(["a", "b", "c"]);
  });

  it("handles empty inputs", () => {
    expect(capImages([], [], 3)).toEqual([]);
  });
});
