import { describe, expect, it } from "vitest";

import { screenTargets, slugOf, webRouteOf } from "./routes";

describe("visual-parity routes", () => {
  it("maps page files to routes, dropping route groups and dynamic segments", () => {
    expect(webRouteOf("clients/web/src/app/(auth)/login/page.tsx")).toBe("/login");
    expect(webRouteOf("clients/web/src/app/parent/settings/general/page.tsx")).toBe("/parent/settings/general");
    expect(webRouteOf("clients/web/src/app/parent/kids/[id]/page.tsx")).toBeNull();
    expect(webRouteOf("clients/web/src/components/parent/parent-pin-gate.tsx")).toBeNull();
  });

  it("targets only features done on mobile", () => {
    const targets = screenTargets([
      { id: "a", area: "auth", title: "", web: "done", mobile: "done", web_paths: ["clients/web/src/app/(auth)/login/page.tsx"] },
      { id: "b", area: "parent", title: "", web: "done", mobile: "planned", phase: 4, web_paths: ["clients/web/src/app/parent/kids/page.tsx"] },
      { id: "c", area: "parent", title: "", web: "done", mobile: "done", web_paths: ["clients/web/src/app/parent/dashboard/page.tsx"] },
    ]);
    expect(targets).toEqual([
      { featureId: "a", route: "/login", isSignedIn: false },
      { featureId: "c", route: "/parent/dashboard", isSignedIn: true },
    ]);
    expect(slugOf("/parent/settings/general")).toBe("parent__settings__general");
  });
});
