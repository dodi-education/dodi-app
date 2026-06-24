import { randomBytes } from "./primitives";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A short, random, PUBLIC friend handle (Signal-username style) — NOT derived
 * from the child's name, so it carries no personal data and can stay plaintext
 * (the child's real name lives in the encrypted `display_name`). Used for
 * friend discovery / "add by handle".
 */
export function generateSocialId(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
