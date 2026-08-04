import { describe, expect, it } from "vitest";

import { validateGameCode } from "./agent-validator";
import { UNBUILT_GAME_PLACEHOLDER } from "./placeholder";

// Minimal bridge-compliant bundle; per-test we splice in the command handlers.
function bundle(handlers: string): string {
  return `<!doctype html><html><body><script>
    window.addEventListener('message', function (e) {
      var m = e.data;
      if (m.type === 'dodi:init') { parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*'); }
      if (m.type === 'dodi:command') {
        var type = m.payload.command.type;
        ${handlers}
        parent.postMessage({ type: 'game:result' }, '*');
      }
    });
  </script></body></html>`;
}

describe("validateGameCode — capabilities", () => {
  it("passes when declared bridge commands are handled in code", () => {
    const code = bundle(`if (type === 'submit_answer') {} if (type === 'next_task') {}`);
    const r = validateGameCode(code, { capabilities: ["submit_answer", "next_task"] });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a capability outside the standard vocabulary", () => {
    const code = bundle(`if (type === 'submit_answer') {}`);
    const r = validateGameCode(code, { capabilities: ["submit_answer", "make_pizza"] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("make_pizza"))).toBe(true);
  });

  it("flags a declared bridge command with no handler in code", () => {
    const code = bundle(`if (type === 'submit_answer') {}`);
    const r = validateGameCode(code, { capabilities: ["submit_answer", "next_task"] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("next_task"))).toBe(true);
  });

  it("checks generate_drawing via its set_generated_image handler", () => {
    const withHandler = bundle(`if (type === 'set_generated_image') {}`);
    expect(validateGameCode(withHandler, { capabilities: ["generate_drawing"] }).valid).toBe(true);

    const without = bundle(`if (type === 'submit_answer') {}`);
    const r = validateGameCode(without, { capabilities: ["generate_drawing"] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("set_generated_image"))).toBe(true);
  });

  it("checks generate_text via its set_generated_text handler", () => {
    const withHandler = bundle(`if (type === 'set_generated_text') {}`);
    expect(validateGameCode(withHandler, { capabilities: ["generate_text"] }).valid).toBe(true);

    const without = bundle(`if (type === 'submit_answer') {}`);
    const r = validateGameCode(without, { capabilities: ["generate_text"] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("set_generated_text"))).toBe(true);
  });

  it("checks generate_voice via its set_generated_voice handler", () => {
    const withHandler = bundle(`if (type === 'set_generated_voice') {}`);
    expect(validateGameCode(withHandler, { capabilities: ["generate_voice"] }).valid).toBe(true);

    const without = bundle(`if (type === 'submit_answer') {}`);
    const r = validateGameCode(without, { capabilities: ["generate_voice"] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("set_generated_voice"))).toBe(true);
  });
});

describe("validateGameCode — background image placeholder", () => {
  const withPlaceholder = () =>
    bundle(``).replace(
      "<body>",
      `<body><style id="background-image">:root{--background-image:url("{{BACKGROUND_IMAGE}}")}</style>`,
    );

  it("image available + placeholder referenced → valid", () => {
    const r = validateGameCode(withPlaceholder(), { hasBackgroundImage: true });
    expect(r.valid).toBe(true);
  });

  it("image available + placeholder missing → error", () => {
    const r = validateGameCode(bundle(``), { hasBackgroundImage: true });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("{{BACKGROUND_IMAGE}}"))).toBe(true);
  });

  it("no image + placeholder referenced → error", () => {
    const r = validateGameCode(withPlaceholder(), { hasBackgroundImage: false });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("no background image"))).toBe(true);
  });

  it("no image + no placeholder → valid; option omitted → never checked", () => {
    expect(validateGameCode(bundle(``), { hasBackgroundImage: false }).valid).toBe(true);
    expect(validateGameCode(withPlaceholder()).valid).toBe(true);
  });
});

describe("validateGameCode — translations", () => {
  const block = (json: unknown) =>
    `<script type="application/dodi-translations">${JSON.stringify(json)}</script>`;
  const withTranslations = (handlers = "", json?: unknown) =>
    bundle(handlers + `; document.title = dodi.translate('game.start');`).replace(
      "<body>",
      "<body>" +
        block(
          json ?? {
            sourceLocale: "de",
            locales: { de: { "game.start": "Los geht's!" } },
          },
        ),
    );

  it("legacy bundle without a block stays valid when not required (import path)", () => {
    expect(validateGameCode(bundle(``)).valid).toBe(true);
  });

  it("requireTranslations rejects a bundle without a block", () => {
    const r = validateGameCode(bundle(``), { requireTranslations: true });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("application/dodi-translations"))).toBe(true);
  });

  it("requireTranslations accepts a bundle with block + translate call", () => {
    const r = validateGameCode(withTranslations(), { requireTranslations: true });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("a malformed block fails even without the option (import path)", () => {
    const code = bundle(``).replace(
      "<body>",
      `<body><script type="application/dodi-translations">{broken</script>`,
    );
    const r = validateGameCode(code);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("not valid JSON"))).toBe(true);
  });

  it("flags translate() keys missing from the source locale", () => {
    const code = withTranslations(`; dodi.translate('game.missing');`);
    const r = validateGameCode(code, { requireTranslations: true });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("game.missing"))).toBe(true);
  });

  it("requireTranslations rejects an empty source dictionary", () => {
    const code = bundle(`; dodi.translate;`).replace(
      "<body>",
      "<body>" + block({ sourceLocale: "de", locales: { de: {} } }),
    );
    const r = validateGameCode(code, { requireTranslations: true });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("no entries"))).toBe(true);
  });

  it("skips translation checks for the unbuilt stub", () => {
    const r = validateGameCode(UNBUILT_GAME_PLACEHOLDER, { requireTranslations: true });
    expect(r.errors.some((e) => e.includes("dodi-translations"))).toBe(false);
  });
});
