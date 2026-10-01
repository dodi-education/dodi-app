import { describe, expect, it } from "vitest";

import { checkParity, type Feature, type RepoView } from "./check";

const repo = (patch: Partial<RepoView> = {}): RepoView => ({
  webRoutes: ["clients/web/src/app/parent/dashboard/page.tsx"],
  mobileScreens: [],
  corePackages: ["studio", "client-state"],
  exists: () => true,
  ...patch,
});

const feature = (patch: Partial<Feature> = {}): Feature => ({
  id: "parent.dashboard",
  area: "parent",
  title: "Dashboard",
  web: "done",
  mobile: "planned",
  phase: 2,
  web_paths: ["clients/web/src/app/parent/dashboard/page.tsx"],
  ...patch,
});

const errorsOf = (features: Feature[], view = repo()) => checkParity({ features }, view).errors;

describe("checkParity", () => {
  it("accepts a consistent manifest", () => {
    expect(errorsOf([feature()])).toEqual([]);
  });

  it("flags a web route no feature claims", () => {
    expect(errorsOf([feature({ web_paths: [], web: "planned" })])).toContainEqual(
      expect.stringContaining("parent/dashboard/page.tsx belongs to no feature"),
    );
  });

  it("flags a mobile screen no feature claims", () => {
    const view = repo({ mobileScreens: ["clients/mobile/src/app/parent/dashboard.tsx"] });
    expect(errorsOf([feature()], view)).toContainEqual(
      expect.stringContaining("mobile screen clients/mobile/src/app/parent/dashboard.tsx"),
    );
  });

  it("requires a phase or notes for a planned client", () => {
    expect(errorsOf([feature({ phase: undefined })])).toContainEqual(
      expect.stringContaining("mobile is planned but has no `phase` or `notes`"),
    );
    expect(errorsOf([feature({ phase: undefined, notes: "after the redesign" })])).toEqual([]);
  });

  it("requires notes for n/a", () => {
    expect(errorsOf([feature({ mobile: "n/a", phase: undefined })])).toContainEqual(
      expect.stringContaining("mobile is n/a but has no `notes`"),
    );
  });

  it("requires every path of a done client to exist", () => {
    const view = repo({ exists: () => false });
    expect(errorsOf([feature()], view)).toContainEqual(
      expect.stringContaining("web is done but clients/web/src/app/parent/dashboard/page.tsx does not exist"),
    );
  });

  it("only warns about missing paths of a planned client", () => {
    const report = checkParity(
      { features: [feature({ mobile_paths: ["clients/mobile/src/app/parent/dashboard.tsx"] })] },
      repo({ exists: (p) => !p.startsWith("clients/mobile") }),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(1);
  });

  it("rejects unknown statuses, duplicate ids and unknown core packages", () => {
    const errors = errorsOf([feature({ mobile: "soon", core: ["nope"] }), feature()]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mobile status "soon"'),
        expect.stringContaining("duplicate id"),
        expect.stringContaining('unknown core package "nope"'),
      ]),
    );
  });
});
