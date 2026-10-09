import {
  ACCESSORIES,
  COLOR_SWATCHES,
  DEFAULT_CHARACTER_MODEL,
  characterModelFor,
  customAssetIdOf,
  isAccessoryName,
  isCharacterModelId,
  isCustomAssetRef,
  type AccessoryRef,
  type CharacterModelRef,
} from "./character-catalog";

/**
 * A companion's look: which avatar it wears (a catalog one, or the family's
 * own as `custom:<asset id>`), its colors and its accessories (catalog names
 * or `custom:<asset id>`). Sealed as JSON in companions.look_enc; the server
 * never sees it. Pure (no three.js).
 */
export interface CompanionLook {
  v: 1;
  model: CharacterModelRef;
  /** Customizable material name → base color (#rrggbb). Absent = the model's own. */
  colors: Record<string, string>;
  accessories: AccessoryRef[];
}

export interface SanitizeLookOptions {
  /**
   * The family's own assets that exist (character_assets ids). Given, custom
   * refs to anything else are dropped (a deleted asset: the avatar falls back
   * to the default). Absent, well-formed custom refs are kept as they are:
   * the caller can't tell yet, and saving must not lose them.
   */
  customAssetIds?: ReadonlySet<string>;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function defaultLook(model: CharacterModelRef = DEFAULT_CHARACTER_MODEL): CompanionLook {
  return { v: 1, model, colors: {}, accessories: [] };
}

/**
 * A look as stored is untrusted (the server can't validate a sealed blob, and
 * older clients may know fewer models): unknown models fall back to the
 * default, and colors or accessories the model doesn't offer are dropped.
 */
export function sanitizeLook(raw: unknown, options: SanitizeLookOptions = {}): CompanionLook {
  if (typeof raw !== "object" || raw === null) return defaultLook();
  const record = raw as Record<string, unknown>;
  const isKnownCustom = (value: unknown): value is AccessoryRef & CharacterModelRef => {
    if (!isCustomAssetRef(value)) return false;
    const id = customAssetIdOf(value);
    return id !== null && (options.customAssetIds?.has(id) ?? true);
  };
  const model: CharacterModelRef =
    isCharacterModelId(record.model) || isKnownCustom(record.model) ? record.model : DEFAULT_CHARACTER_MODEL;
  const customizable = new Set(characterModelFor(model).customizable.map((p) => p.material));

  const colors: Record<string, string> = {};
  if (typeof record.colors === "object" && record.colors !== null) {
    for (const [material, color] of Object.entries(record.colors)) {
      if (customizable.has(material) && typeof color === "string" && HEX.test(color)) {
        colors[material] = color.toLowerCase();
      }
    }
  }

  const accessories: AccessoryRef[] = [];
  if (Array.isArray(record.accessories)) {
    for (const name of record.accessories) {
      const isCatalog = isAccessoryName(name) && ACCESSORIES[name].isKidSelectable;
      if ((isCatalog || isKnownCustom(name)) && !accessories.includes(name)) {
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
