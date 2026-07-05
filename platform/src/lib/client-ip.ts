/**
 * Client IP extraction + privacy-preserving hashing, used only for the
 * newsletter-signup rate limit. We never store a raw IP: it's HMAC'd under a
 * server-only pepper (NEWSLETTER_IP_HASH_SECRET) so the DB holds a
 * non-reversible, rotatable key that can throttle abuse without retaining PII.
 */
import { createHmac } from "node:crypto";

/**
 * Best-effort client IP from proxy headers. On Vercel the platform injects
 * `x-forwarded-for` and its LEFTMOST entry is the real client (subsequent
 * entries are proxies); `x-real-ip` is a single-value fallback. Returns null
 * when neither is present (e.g. some local setups).
 */
export function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real ? real : null;
}

/**
 * HMAC-SHA256(ip) under NEWSLETTER_IP_HASH_SECRET, hex. Returns null when
 * there's no IP or no secret configured — in which case the caller simply skips
 * the per-IP rate limit (the other spam layers still apply).
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const secret = process.env.NEWSLETTER_IP_HASH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(ip).digest("hex");
}
