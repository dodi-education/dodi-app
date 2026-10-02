import { describe, expect, it } from "vitest";

import * as recipes from "./index";

/**
 * The portable parts of each recipe (everything except `web*` keys) are what
 * the mobile app applies through NativeWind, so they must not contain classes
 * only a browser understands. Those belong in the recipe's `web` part.
 */
const BROWSER_ONLY = [
  /(^|\s)(hover|focus|focus-visible|group-|peer-|aria-|data-\[|has-|\[&|\[a&|file:|selection:|placeholder:|md:|sm:|lg:|wide:|compact:)/,
  /(^|\s)(inline-flex|whitespace-nowrap|transition|outline-none|w-fit|select-none|pointer-events-none)(\s|$)/,
];

/** Every class string reachable from a recipe, labelled by its path. */
function collect(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === "string") out.push([path, value]);
  else if (typeof value === "function") {
    // cva recipes: evaluate with defaults and with every variant combination we can see.
    // Other exported helpers (snapshotFlashTarget, kidAvatarColor) need their
    // arguments and return no class string; they're skipped.
    let classes: unknown;
    try {
      classes = (value as (p?: object) => unknown)();
    } catch {
      return;
    }
    if (typeof classes === "string") out.push([path, classes]);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("web")) continue;
      collect(child, `${path}.${key}`, out);
    }
  }
}

describe("ui recipes", () => {
  it("keep browser-only classes out of the portable parts", () => {
    const strings: Array<[string, string]> = [];
    for (const [name, value] of Object.entries(recipes)) collect(value, name, strings);
    const offenders = strings.filter(([, classes]) => BROWSER_ONLY.some((re) => re.test(classes)));
    expect(offenders).toEqual([]);
  });

  // React Native doesn't shrink flex children by default (flexShrink 0; the web
  // defaults to 1), so `min-w-0` alone never lets a box narrow there: a title
  // next to actions overflows instead of truncating (the kid game view's title
  // pushed its delete button off screen). A portable part that means "may
  // shrink" must say so.
  it("pair min-w-0 with an explicit shrink in the portable parts", () => {
    const strings: Array<[string, string]> = [];
    for (const [name, value] of Object.entries(recipes)) collect(value, name, strings);
    const offenders = strings.filter(
      ([, classes]) =>
        /(^|\s)min-w-0(\s|$)/.test(classes) && !/(^|\s)(shrink|flex-1|w-full)(\s|$)/.test(classes),
    );
    expect(offenders).toEqual([]);
  });

  it("button and badge variants exist for every label color", () => {
    for (const variant of Object.keys(recipes.buttonIconColor)) {
      expect(recipes.button.box({ variant: variant as recipes.ButtonVariant })).toContain("rounded-md");
    }
    expect(recipes.badge.text({ variant: "key" })).toContain("font-mono");
  });

  it("cycles kid avatar colors by list position (negative indexes too)", () => {
    expect(recipes.kidAvatarColor(0)).toEqual(recipes.kidAvatarPalette[0]);
    expect(recipes.kidAvatarColor(5)).toEqual(recipes.kidAvatarPalette[1]);
    expect(recipes.kidAvatarColor(-1)).toEqual(recipes.kidAvatarPalette[3]);
  });
});
