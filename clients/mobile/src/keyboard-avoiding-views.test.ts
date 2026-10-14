import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Bug: on Android the keyboard covered the login form's submit button. The
 * app draws edge to edge (Expo SDK 57, `edgeToEdgeEnabled=true`), so the
 * window no longer shrinks for the keyboard (`adjustResize` is a no-op) and a
 * KeyboardAvoidingView without a `behavior` on Android
 * (`Platform.OS === "ios" ? "padding" : undefined`) does nothing there. Every
 * KeyboardAvoidingView takes its props from `keyboardAvoidance()`
 * (lib/keyboard-avoidance), which pads on both platforms with the offset for
 * where the view sits.
 */
const SRC = resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** Each `<KeyboardAvoidingView …>` opening tag; braces are balanced, so a `>` inside an attribute does not end it. */
function openingTags(source: string): string[] {
  const tags: string[] = [];
  let from = source.indexOf("<KeyboardAvoidingView");
  while (from !== -1) {
    let depth = 0;
    let end = from;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(from, end + 1));
    from = source.indexOf("<KeyboardAvoidingView", end);
  }
  return tags;
}

const views = sourceFiles(SRC).flatMap((file) =>
  openingTags(readFileSync(file, "utf8")).map((tag) => ({ at: relative(SRC, file), tag })),
);

describe("KeyboardAvoidingView", () => {
  it("lifts on Android too: every one takes its props from keyboardAvoidance()", () => {
    const offenders = views
      .filter(({ tag }) => !tag.includes("{...keyboardAvoidance("))
      .map(({ at, tag }) => `${at}  ${tag.replace(/\s+/g, " ")}`);
    expect(offenders).toEqual([]);
  });

  it("the scan finds them (the Game Studio's is one)", () => {
    expect(views.map(({ at }) => at)).toContain(join("components", "studio", "game-studio.tsx"));
  });
});
