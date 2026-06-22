/**
 * Static validation of AI-generated game code.
 *
 * Checks that the code bundle is safe for sandbox execution and
 * correctly implements the bridge protocol.
 */

import type { MetricKey, ProgressKind } from "@/lib/games/success";

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

  return {
    valid: errors.length === 0,
    errors,
  };
}
