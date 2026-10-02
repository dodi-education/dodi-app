import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Screens ported before their targets existed shipped controls hard-wired as
 * `disabled` (the dashboard's "Add game" and "Add kid" stayed dead after the
 * Game Studio and kid pages arrived). A control may be disabled by a
 * condition, never by a bare `disabled` attribute.
 */
const SRC = resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe("screens", () => {
  it("have no controls hard-wired as disabled", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${relative(SRC, file)}:${i + 1}` }))
        // `disabled` as a bare JSX attribute: followed by whitespace, `>` or `/>`, not `=`.
        .filter(({ line }) => /<[A-Z]\w*\b[^>]*\sdisabled(\s|\/?>|$)/.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
