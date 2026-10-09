/**
 * A coarse, non-identifying description of a signed-in client for the Access
 * list: browser family and OS only ("Firefox on Linux"), never versions,
 * device models or hostnames (see the encrypt-inferable-fields rule: a label
 * stays plaintext only because it says this little). Built by the client
 * from its own user agent, and by the server for login sessions that never
 * registered.
 */

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function first(table: Array<[RegExp, string]>, value: string): string | null {
  return table.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

/** "Firefox on Linux", "Safari on iOS"; null when nothing is recognisable. */
export function clientLabelFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const browser = first(BROWSERS, userAgent);
  const system = first(SYSTEMS, userAgent);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system;
}

/** The mobile app's label: the OS only. */
export function appClientLabel(os: "ios" | "android" | string): string {
  if (os === "ios") return "dodi app on iOS";
  if (os === "android") return "dodi app on Android";
  return "dodi app";
}
