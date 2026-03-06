const MAX_GAME_BUNDLE_BYTES = 200 * 1024;

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
  if (sizeBytes > MAX_GAME_BUNDLE_BYTES) {
    throw new Error(
      `Game bundle exceeds maximum size of ${MAX_GAME_BUNDLE_BYTES} bytes`,
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
  return MAX_GAME_BUNDLE_BYTES;
}
