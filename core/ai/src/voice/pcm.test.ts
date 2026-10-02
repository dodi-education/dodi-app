import { describe, expect, it } from "vitest";

import { decodeUtf8 } from "./voice-socket";
import {
  base64ToBytes,
  bytesToBase64,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
  resampleLinear,
} from "./pcm";

describe("pcm helpers", () => {
  it("base64 round-trips every remainder length and matches the platform encoder", () => {
    for (let n = 0; n < 10; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 250) & 0xff);
      const encoded = bytesToBase64(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
      expect([...base64ToBytes(encoded)]).toEqual([...bytes]);
    }
  });

  it("decodes PCM16 LE into normalized floats and back", () => {
    const pcm = new Int16Array([0, 16384, -16384, 32767, -32768]);
    const b64 = Buffer.from(new Uint8Array(pcm.buffer)).toString("base64");
    const floats = pcm16Base64ToFloat32(b64);
    expect([...floats]).toEqual([0, 0.5, -0.5, 32767 / 32768, -1]);

    const back = new Int16Array(base64ToBytes(float32ToPcm16Base64(floats)).buffer);
    expect([...back]).toEqual([0, 16384, -16384, 32767, -32768]);
  });

  it("resamples 48 kHz to 16 kHz by length", () => {
    const out = resampleLinear(new Float32Array(480), 48000, 16000);
    expect(out.length).toBe(160);
  });

  it("decodes UTF-8 without TextDecoder too", () => {
    const original = globalThis.TextDecoder;
    const bytes = new TextEncoder().encode("Grüße 🎉");
    try {
      (globalThis as { TextDecoder?: unknown }).TextDecoder = undefined;
      expect(decodeUtf8(bytes)).toBe("Grüße 🎉");
    } finally {
      globalThis.TextDecoder = original;
    }
  });
});
