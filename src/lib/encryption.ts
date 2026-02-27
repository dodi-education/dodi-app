import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface EncryptedValue {
  iv: string;
  ciphertext: string;
  tag: string;
}

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET?.trim();
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET environment variable is not set");
  }
  // Accept 64-char hex string (32 bytes) or 44-char base64 (32 bytes)
  if (secret.length === 64 && /^[0-9a-f]+$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  const buf = Buffer.from(secret, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "ENCRYPTION_SECRET must be a 32-byte key (64 hex chars or 44 base64 chars)",
    );
  }
  return buf;
}

export function encrypt(plaintext: string): EncryptedValue {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decrypt(encrypted: EncryptedValue): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  const tag = Buffer.from(encrypted.tag, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
