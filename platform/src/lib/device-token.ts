/**
 * Platform-signed, stateless tokens for the headless device flow (HMAC-SHA256
 * over a JSON payload). Two kinds:
 *  - challenge nonce: `{ t: "chal", deviceId, exp }` — returned by /challenge,
 *    signed by the device's ML-DSA key, and checked at /token.
 *  - device bearer:  `dodidev_<payload>.<mac>` with `{ t: "dev", accountId,
 *    deviceId, exp }` — issued by /token and accepted by resolveAuth. Verified
 *    statelessly (no DB), so it carries the account it resolves to.
 */
import crypto from "node:crypto";

const BEARER_PREFIX = "dodidev_";

function secret(): string {
  const s = process.env.DEVICE_TOKEN_SECRET;
  if (!s) throw new Error("DEVICE_TOKEN_SECRET is not set");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(payload: string): string {
  return b64url(crypto.createHmac("sha256", secret()).update(payload).digest());
}

interface SignedPayload {
  t: "chal" | "dev";
  exp: number;
  [k: string]: unknown;
}

function sign(payload: SignedPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${hmac(body)}`;
}

function open(token: string): SignedPayload | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = hmac(body);
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  let payload: SignedPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  return payload;
}

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const BEARER_TTL_MS = 15 * 60 * 1000;

export function issueChallenge(deviceId: string): string {
  return sign({ t: "chal", deviceId, exp: Date.now() + CHALLENGE_TTL_MS });
}

/** Verify a challenge nonce came from us, is unexpired, and is for this device. */
export function verifyChallenge(nonce: string, deviceId: string): boolean {
  const p = open(nonce);
  return !!p && p.t === "chal" && p.deviceId === deviceId;
}

export function issueDeviceBearer(accountId: string, deviceId: string): string {
  return (
    BEARER_PREFIX +
    sign({ t: "dev", accountId, deviceId, exp: Date.now() + BEARER_TTL_MS })
  );
}

/** Parse + verify a device bearer; null if not a device token (e.g. a user JWT). */
export function verifyDeviceBearer(
  token: string,
): { accountId: string; deviceId: string } | null {
  if (!token.startsWith(BEARER_PREFIX)) return null;
  const p = open(token.slice(BEARER_PREFIX.length));
  if (!p || p.t !== "dev") return null;
  return { accountId: String(p.accountId), deviceId: String(p.deviceId) };
}
