/**
 * PCM16 <-> base64 helpers for the voice pipeline, in plain JS so they run the
 * same in browsers and Hermes (no atob/btoa, Blob or Buffer).
 *
 * Wire format both providers use: 16-bit little-endian mono PCM, base64.
 * Microphone input is 16 kHz ({@link MIC_SAMPLE_RATE}), voice output 24 kHz
 * ({@link SPEAKER_SAMPLE_RATE}).
 */

export const MIC_SAMPLE_RATE = 16000;
export const SPEAKER_SAMPLE_RATE = 24000;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  // URL-safe variants decode too.
  table["-".charCodeAt(0)] = 62;
  table["_".charCodeAt(0)] = 63;
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}${ALPHABET[(n >> 6) & 63]}=`;
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\s=]+/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = LOOKUP[clean.charCodeAt(i)];
    if (v === 255) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return o === out.length ? out : out.slice(0, o);
}

/** Base64 PCM16 LE -> samples normalized to [-1, 1) (what an audio buffer takes). */
export function pcm16Base64ToFloat32(base64: string): Float32Array {
  const bytes = base64ToBytes(base64);
  const count = bytes.length >> 1;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let s = bytes[2 * i] | (bytes[2 * i + 1] << 8);
    if (s >= 0x8000) s -= 0x10000;
    out[i] = s / 32768;
  }
  return out;
}

/** Float samples in [-1, 1] -> base64 PCM16 LE (clamped). */
export function float32ToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    // Inverse of pcm16Base64ToFloat32 (x / 32768), clamped to the int16 range.
    const s = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32768)));
    bytes[2 * i] = s & 0xff;
    bytes[2 * i + 1] = (s >> 8) & 0xff;
  }
  return bytesToBase64(bytes);
}

/** Linear resample (e.g. a 48 kHz native mic stream down to {@link MIC_SAMPLE_RATE}). */
export function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = pos - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}
