import { randomBytes } from "./primitives";

// Uppercase, with the visually ambiguous characters removed (no O/0, L/I/1's
// look-alikes): O, L, I and the digit 0 are excluded so a kid reading a code
// aloud or copying it off a screen can't confuse it. The result is exactly 32
// symbols, which divides 256 evenly — so `byte % 32` is unbiased (the old
// 36-symbol alphabet had a slight modulo bias toward its first 4 letters).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ123456789";

/**
 * A short, random, PUBLIC friend handle (Signal-username style) — NOT derived
 * from the child's name, so it carries no personal data and can stay plaintext
 * (the child's real name lives in the encrypted `display_name`). Used for
 * friend discovery / "add by handle". Codes are canonically UPPERCASE; the
 * client uppercases typed input so lookups stay case-insensitive in practice.
 */
export function generateSocialId(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
