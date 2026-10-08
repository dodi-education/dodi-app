import {
  ACCESSORIES,
  CHARACTER_MODELS,
  COLOR_SWATCHES,
  DEFAULT_CHARACTER_MODEL,
  isAccessoryName,
  isCharacterModelId,
  type AccessoryName,
  type CharacterModelId,
} from "./character-catalog";

/**
 * A companion's look: which catalog avatar it wears, its colors and its
 * accessories. Sealed as JSON in companions.look_enc; the server never sees it.
 * Pure (no three.js).
 */
export interface CompanionLook {
  v: 1;
  model: CharacterModelId;
  /** Customizable material name → base color (#rrggbb). Absent = the model's own. */
  colors: Record<string, string>;
  accessories: AccessoryName[];
}

const HEX = /^#[0-9a-f]{6}$/i;

export function defaultLook(model: CharacterModelId = DEFAULT_CHARACTER_MODEL): CompanionLook {
  return { v: 1, model, colors: {}, accessories: [] };
}

/**
 * A look as stored is untrusted (the server can't validate a sealed blob, and
 * older clients may know fewer models): unknown models fall back to the
 * default, and colors or accessories the model doesn't offer are dropped.
 */
export function sanitizeLook(raw: unknown): CompanionLook {
  if (typeof raw !== "object" || raw === null) return defaultLook();
  const record = raw as Record<string, unknown>;
  const model = isCharacterModelId(record.model) ? record.model : DEFAULT_CHARACTER_MODEL;
  const customizable = new Set(CHARACTER_MODELS[model].customizable.map((p) => p.material));

  const colors: Record<string, string> = {};
  if (typeof record.colors === "object" && record.colors !== null) {
    for (const [material, color] of Object.entries(record.colors)) {
      if (customizable.has(material) && typeof color === "string" && HEX.test(color)) {
        colors[material] = color.toLowerCase();
      }
    }
  }

  const accessories: AccessoryName[] = [];
  if (Array.isArray(record.accessories)) {
    for (const name of record.accessories) {
      if (isAccessoryName(name) && ACCESSORIES[name].isKidSelectable && !accessories.includes(name)) {
        accessories.push(name);
      }
    }
  }
  return { v: 1, model, colors, accessories };
}

/** Two looks that render the same. */
export function isSameLook(a: CompanionLook, b: CompanionLook): boolean {
  if (a.model !== b.model) return false;
  const aColors = Object.entries(a.colors).sort(([x], [y]) => x.localeCompare(y));
  const bColors = Object.entries(b.colors).sort(([x], [y]) => x.localeCompare(y));
  if (JSON.stringify(aColors) !== JSON.stringify(bColors)) return false;
  return [...a.accessories].sort().join() === [...b.accessories].sort().join();
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The toon shadow tone for a base color: the swatch's own pair when it is a
 * swatch, else the base darkened by the ratio the model's own colors use
 * (`defaultBase` → `defaultShade`), falling back to 75%.
 */
export function shadeFor(base: string, defaultBase?: string, defaultShade?: string): string {
  const swatch = COLOR_SWATCHES.find((s) => s.base.toLowerCase() === base.toLowerCase());
  if (swatch) return swatch.shade;
  const color = channels(base);
  if (defaultBase && defaultShade && HEX.test(defaultBase) && HEX.test(defaultShade)) {
    const from = channels(defaultBase);
    const to = channels(defaultShade);
    return toHex(color.map((c, i) => c * (from[i] > 0 ? Math.min(1, to[i] / from[i]) : 0.75)) as [number, number, number]);
  }
  return toHex(color.map((c) => c * 0.75) as [number, number, number]);
}
