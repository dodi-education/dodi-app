/**
 * Static safety sanitizer for AI-generated game bundles.
 *
 * Pure + isomorphic: runs client-side (before persisting a generated game) and
 * server-side (defense-in-depth on the games write routes). Enforces the sandbox
 * contract — no network, no external scripts, size cap.
 *
 * Two size regimes exist: the CODE budget (200KB, enforced by the agent
 * validator on the placeholder form the model writes) and this STORED budget
 * (512KB), which additionally covers the inline background-image data URL the
 * client swaps in before persisting (see @dodi/games/background-image).
 */

const MAX_GAME_BUNDLE_WITH_ASSETS_BYTES = 512 * 1024;

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script\b[^>]*\bsrc\s*=\s*/i, reason: "External script loads are not allowed" },
  { pattern: /\bfetch\s*\(/i, reason: "Network access via fetch is not allowed" },
  { pattern: /\bXMLHttpRequest\b/i, reason: "XMLHttpRequest is not allowed" },
  { pattern: /\bWebSocket\b/i, reason: "WebSocket is not allowed" },
  { pattern: /\bimport\s*\(/i, reason: "Dynamic import is not allowed" },
  { pattern: /\bnavigator\.sendBeacon\b/i, reason: "sendBeacon is not allowed" },
  { pattern: /\bdocument\.cookie\b/i, reason: "Accessing document.cookie is not allowed" },
];

export interface SanitizedGameBundle {
  code: string;
  sizeBytes: number;
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertSafeGameBundle(code: string): void {
  const sizeBytes = getUtf8ByteLength(code);
  if (sizeBytes > MAX_GAME_BUNDLE_WITH_ASSETS_BYTES) {
    throw new Error(
      `Game bundle exceeds maximum size of ${MAX_GAME_BUNDLE_WITH_ASSETS_BYTES} bytes`,
    );
  }

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(`Unsafe game bundle: ${reason}`);
    }
  }
}

export function sanitizeGameBundle(code: string): SanitizedGameBundle {
  const trimmed = code.trim();
  assertSafeGameBundle(trimmed);

  return {
    code: trimmed,
    sizeBytes: getUtf8ByteLength(trimmed),
  };
}

export function getGameBundleLimitBytes(): number {
  return MAX_GAME_BUNDLE_WITH_ASSETS_BYTES;
}
