/**
 * Where a game's `preview_image` loads from, for clients without a web origin
 * of their own (the app).
 *
 * Family games carry their preview inline as a decrypted `data:image/` URL.
 * System games store a path on the web app ("/images/game-previews/…", served
 * from clients/web/public), which the web resolves against its own origin and
 * the app has to resolve against the web app's.
 *
 * Anything else yields null (the caller shows the tag tile): a still-sealed
 * `enc:v1:` record, protocol-relative "//host" paths, plain http and any other
 * scheme.
 */
export function previewImageSource(src: string | null | undefined, appOrigin: string): string | null {
  if (!src) return null;
  if (src.startsWith("data:image/")) return src;
  if (/^https:\/\//i.test(src)) return src;
  // A single leading slash: "//host" and "/\host" would leave the origin.
  if (src.startsWith("/") && src[1] !== "/" && src[1] !== "\\") {
    return `${appOrigin.replace(/\/+$/, "")}${src}`;
  }
  return null;
}
