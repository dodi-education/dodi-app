import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { button } from "@dodi/ui-recipes";

import {
  BUTTON_HIT_SLOP,
  BUTTON_SIZES,
  KID_BUTTON_SIZES,
  KID_BUTTON_VARIANTS,
  kidButtonBox,
  kidButtonHitSlop,
} from "@/lib/control-targets";
import { boxFromClasses, MIN_TARGET_PT, targetWith } from "@/lib/hit-slop";

import { type ControlFinding, scanControls } from "./test-support/a11y-scan";

/**
 * The accessibility rules (CLAUDE.md, clients/mobile/CLAUDE.md), checked on
 * the source so they stay fixed:
 *
 * - every RN pressable has an `accessibilityRole`; so does any view taking a press
 * - a control with nothing that reads as text has an `accessibilityLabel`
 * - a pressable whose box (from its classes, or padding + content) is under
 *   44pt has a `hitSlop` that reaches 44pt; the kit's buttons do it themselves
 * - fields and switches are named (`accessibilityLabel`)
 * - an image is content (accessible + labelled) or hidden decoration
 * - every animation reads the reduce-motion setting
 * - text scaling is never switched off, and its caps are named (lib/font-scale)
 *
 * The scan (test-support/a11y-scan.ts) type-checks the app, so recipe classes
 * (`kidCard.iconButton`) are read from @dodi/ui-recipes, not guessed.
 */
const SRC = resolve(__dirname);

function format(findings: ControlFinding[]): string[] {
  return findings.map((f) => `${f.rule}: ${f.at} <${f.tag}> ${f.detail}`);
}

describe("controls (source scan)", () => {
  it("have roles, labels, 44pt targets; fields are named; images are content or hidden", () => {
    expect(format(scanControls(SRC))).toEqual([]);
  }, 60_000);
});

describe("the scan itself", () => {
  // Fixtures in a temp dir: a violation per rule, and the compliant patterns
  // the app relies on, so the scan neither misses nor over-reports.
  const dir = mkdtempSync(join(tmpdir(), "a11y-scan-"));
  const src = join(dir, "src");
  mkdirSync(src);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const PRELUDE = `import { Image, Pressable, Text, TextInput, View } from "react-native";
const Icon = (_: { name: string; size?: number }) => null;
const noop = (): void => undefined;
`;

  it("reports each kind of violation", () => {
    writeFileSync(
      join(src, "bad.tsx"),
      `${PRELUDE}export function Bad() {
  return (
    <View>
      <Pressable onPress={noop} accessibilityLabel="x" className="min-h-11"><Text>no role</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={noop} className="size-11"><Icon name="close" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" className="size-8"><Icon name="close" /></Pressable>
      <Pressable accessibilityRole="button" className="px-2 py-1"><Text className="text-sm">Small</Text></Pressable>
      <TextInput placeholder="Name" />
      <Image source={{ uri: "a" }} />
      <Image source={{ uri: "a" }} accessibilityLabel="A cat" />
      <Text onPress={noop}>tap</Text>
    </View>
  );
}
`,
    );
    const found = scanControls(src, dir).map((f) => `${f.rule}@${f.at.split(":")[1]}`);
    expect(found).toEqual([
      "role@7",
      "label@8",
      "target@9",
      "target@10",
      "field@11",
      "image@12",
      "image@13",
      "role@14",
    ]);
    rmSync(join(src, "bad.tsx"));
  });

  it("accepts the compliant patterns", () => {
    writeFileSync(
      join(src, "good.tsx"),
      `${PRELUDE}export function Good(props: { onPress: () => void }) {
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" className="size-8" hitSlop={6}><Icon name="close" /></Pressable>
      <Pressable accessibilityRole="link" hitSlop={10}><Text>Label</Text></Pressable>
      <Pressable accessibilityRole="button" className="min-h-11 px-3"><Text>Row</Text></Pressable>
      <Pressable accessibilityRole="button" className="h-9" hitSlop={{ top: 4, bottom: 4 }}><Text>Ok</Text></Pressable>
      <Pressable accessible={false} className="absolute inset-0" onPress={noop} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open"><Image source={{ uri: "a" }} /></Pressable>
      <Pressable {...props}><Icon name="close" /></Pressable>
      <TextInput accessibilityLabel="Name" />
      <Image source={{ uri: "a" }} accessibilityElementsHidden importantForAccessibility="no" />
      <Image source={{ uri: "a" }} accessible accessibilityLabel="A cat" />
      <View accessible accessibilityLabel="dodi"><Image source={{ uri: "a" }} /></View>
      <Text onPress={noop} accessibilityRole="link">tap</Text>
    </View>
  );
}
`,
    );
    expect(format(scanControls(src, dir))).toEqual([]);
    rmSync(join(src, "good.tsx"));
  });
});

describe("kit targets", () => {
  it("every Button size reaches 44pt (the web's h-9, size-8 … plus its hitSlop)", () => {
    for (const size of BUTTON_SIZES) {
      const box = boxFromClasses(button.box({ size }));
      const target = targetWith(box, BUTTON_HIT_SLOP[size]);
      // Every size fixes its height; icon sizes fix the width too.
      expect({ size, height: box.height !== undefined && target.height! >= MIN_TARGET_PT }).toEqual({ size, height: true });
      if (size.startsWith("icon")) {
        expect({ size, width: box.width !== undefined && target.width! >= MIN_TARGET_PT }).toEqual({ size, width: true });
      }
    }
  });

  it("every KidButton variant and size reaches 44pt", () => {
    for (const variant of KID_BUTTON_VARIANTS) {
      for (const size of KID_BUTTON_SIZES) {
        if (size === "none" && variant !== "icon") continue; // sized by its caller (and checked there)
        const target = targetWith(kidButtonBox(variant, size), kidButtonHitSlop(variant, size));
        expect({ variant, size, height: (target.height ?? 0) >= MIN_TARGET_PT }).toEqual({ variant, size, height: true });
        if (target.width !== undefined) {
          expect({ variant, size, width: target.width >= MIN_TARGET_PT }).toEqual({ variant, size, width: true });
        }
      }
    }
  });
});

// ----- Source rules (text scans) ------------------------------------------------

function appSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test-support" ? [] : appSources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** Starting an animation: Animated drivers, Reanimated, LayoutAnimation, modal transitions, frame loops, animated scrolls. */
const ANIMATES =
  /Animated\.(timing|spring|decay|loop|sequence|parallel|stagger)\(|\b(withTiming|withSpring|withRepeat|withDecay)\(|LayoutAnimation\.|animationType=|requestAnimationFrame\(|scrollTo(End)?\(\)|animated:\s*true/;
/** Reading the setting: the shared hook/getter, or a resolved flag handed in (the snapshot flash). */
const READS_REDUCE_MOTION = /useReduceMotion\(|isReduceMotionOn\(|isReducedMotion\b/;

describe("motion", () => {
  it("every file that animates reads the reduce-motion setting (lib/use-reduce-motion)", () => {
    const offenders = appSources(SRC)
      .filter((path) => !path.endsWith(join("lib", "use-reduce-motion.ts")))
      .filter((path) => {
        const code = readFileSync(path, "utf8");
        return ANIMATES.test(code) && !READS_REDUCE_MOTION.test(code);
      })
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });
});

describe("text scaling", () => {
  it("is never switched off, and caps come from lib/font-scale", () => {
    const offenders = appSources(SRC).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${relative(SRC, path)}:${i + 1}` }))
        .filter(
          ({ line }) =>
            /allowFontScaling=\{false\}|allowFontScaling:\s*false/.test(line) ||
            // A literal cap, not a named one (forwarding the prop is fine).
            /maxFontSizeMultiplier=\{(?!MAX_FONT_SCALE\.|maxFontSizeMultiplier\})/.test(line),
        )
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
