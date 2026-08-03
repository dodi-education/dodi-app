/**
 * Static validation of AI-generated game code.
 *
 * Checks that the code bundle is safe for sandbox execution and
 * correctly implements the bridge protocol. Pure + isomorphic — runs in the
 * browser agent loop (client-side generation) and anywhere else.
 */

import { BACKGROUND_IMAGE_PLACEHOLDER, hasBackgroundPlaceholder } from "./background-image";
import { isUnbuiltBundle } from "./placeholder";
import type { MetricKey, ProgressKind } from "./success";
import { STANDARD_TOOLS_BY_NAME } from "./toolbox";
import {
  TRANSLATIONS_SCRIPT_TYPE,
  extractTranslations,
  hasTranslationsBlock,
  translateCallKeys,
} from "./translations";

const MAX_BUNDLE_BYTES = 200 * 1024;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidateGameOptions {
  /** When "goal", enforce the progress/success protocol below. */
  progressKind?: ProgressKind;
  /** Metric keys the game's success criteria depend on. */
  requiredMetrics?: MetricKey[];
  /** Standardized commands the game declared — checked ⊆ registry + present in code. */
  capabilities?: string[];
  /**
   * Whether a generated background image exists for this build — the code must
   * then reference {{BACKGROUND_IMAGE}} (and must not without one).
   */
  hasBackgroundImage?: boolean;
  /**
   * Require the embedded translations block + `dodi.translate` usage (the
   * generation-agent loop sets this). Leave unset on the zip-import path so
   * legacy bundles without a block keep importing; a PRESENT-but-malformed
   * block always fails regardless of this option.
   */
  requireTranslations?: boolean;
}

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script\b[^>]*\bsrc\s*=\s*/i, reason: "External script loads are not allowed" },
  { pattern: /\bfetch\s*\(/i, reason: "Network access via fetch() is not allowed" },
  { pattern: /\bXMLHttpRequest\b/i, reason: "XMLHttpRequest is not allowed" },
  { pattern: /\bWebSocket\b/i, reason: "WebSocket is not allowed" },
  { pattern: /\bimport\s*\(/i, reason: "Dynamic import() is not allowed" },
  { pattern: /\bnavigator\.sendBeacon\b/i, reason: "sendBeacon is not allowed" },
  { pattern: /\bdocument\.cookie\b/i, reason: "Accessing document.cookie is not allowed" },
];

export function validateGameCode(
  code: string,
  options?: ValidateGameOptions,
): ValidationResult {
  const errors: string[] = [];

  // Size check
  const sizeBytes = new TextEncoder().encode(code).byteLength;
  if (sizeBytes > MAX_BUNDLE_BYTES) {
    errors.push(`Bundle size ${sizeBytes} bytes exceeds limit of ${MAX_BUNDLE_BYTES} bytes`);
  }

  if (!code.trim()) {
    errors.push("Code bundle is empty");
    return { valid: false, errors };
  }

  // Blocked patterns
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(reason);
    }
  }

  // Bridge protocol checks
  if (!/addEventListener\s*\(\s*["']message["']/i.test(code) && !/\bonmessage\s*=/i.test(code)) {
    errors.push("Missing message event listener — game must listen for postMessage bridge events");
  }

  if (!/game:ready/i.test(code)) {
    errors.push("Missing 'game:ready' message — game must send game:ready on init");
  }

  if (!/dodi:command/i.test(code)) {
    errors.push("Missing 'dodi:command' handler — game must respond to dodi:command messages");
  }

  // Basic HTML check
  if (!/<html/i.test(code) && !/<body/i.test(code) && !/<script/i.test(code)) {
    errors.push("Code does not appear to be valid HTML — must contain at least a <script> tag");
  }

  // Progress & success protocol checks (goal games only)
  if (options?.progressKind === "goal") {
    if (!/game:progress/i.test(code)) {
      errors.push(
        "Goal game must emit 'game:progress' messages so the host can track progress and success",
      );
    }
    if (!/progressKind/i.test(code)) {
      errors.push(
        "Goal game must include the reserved 'dodi' progress state (set progressKind/progress/metrics)",
      );
    }
    for (const metric of options.requiredMetrics ?? []) {
      if (!new RegExp(`\\b${metric}\\b`).test(code)) {
        errors.push(`Goal game must report the '${metric}' metric required by its success criteria`);
      }
    }
  }

  // Background-image placeholder consistency (see @dodi/games/background-image).
  if (options?.hasBackgroundImage !== undefined) {
    const referenced = hasBackgroundPlaceholder(code);
    if (options.hasBackgroundImage && !referenced) {
      errors.push(
        `A background image was generated but the code never references ${BACKGROUND_IMAGE_PLACEHOLDER} ` +
          `— emit the background-image style block and use var(--background-image)`,
      );
    }
    if (!options.hasBackgroundImage && referenced) {
      errors.push(
        `Code references ${BACKGROUND_IMAGE_PLACEHOLDER} but no background image exists — ` +
          `remove the background-image style block`,
      );
    }
  }

  // Translations block (see ./translations). Skipped for the unbuilt stub —
  // it has no real code yet.
  if (!isUnbuiltBundle(code)) {
    const { translations, errors: translationErrors } = extractTranslations(code);
    errors.push(...translationErrors);
    if (translations) {
      const sourceDict = translations.locales[translations.sourceLocale] ?? {};
      const missing = translateCallKeys(code).filter((key) => !(key in sourceDict));
      if (missing.length > 0) {
        errors.push(
          `dodi.translate() is called with keys missing from the "${translations.sourceLocale}" ` +
            `translations: ${missing.join(", ")} — add them to the translations block`,
        );
      }
    }
    if (options?.requireTranslations) {
      if (!hasTranslationsBlock(code)) {
        errors.push(
          `Missing <script type="${TRANSLATIONS_SCRIPT_TYPE}"> block — every game must ship its ` +
            `visible text as {"sourceLocale":"…","locales":{"…":{"key":"text"}}} and render it via dodi.translate()`,
        );
      } else if (translations) {
        if (Object.keys(translations.locales[translations.sourceLocale] ?? {}).length === 0) {
          errors.push(
            "The translations block's source locale has no entries — move the game's visible text into it",
          );
        }
        if (!/dodi\.translate\s*\(/.test(code)) {
          errors.push(
            "The game never calls dodi.translate() — all visible text must be rendered through it",
          );
        }
      }
    }
  }

  // Standardized capabilities: each declared command must be in the registry and
  // (best-effort) implemented in the code's bridge handler.
  for (const cap of options?.capabilities ?? []) {
    const tool = STANDARD_TOOLS_BY_NAME[cap];
    if (!tool || !tool.declarable) {
      errors.push(`Unknown capability '${cap}' — use only the standard command vocabulary`);
      continue;
    }
    // Client-intercepted tools: the game implements the delivery command instead
    // (generate_drawing → set_generated_image, generate_text → set_generated_text).
    const needle = tool.deliveryCommand ?? cap;
    if (!code.includes(needle)) {
      errors.push(`Declares capability '${cap}' but the code has no '${needle}' handler`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
