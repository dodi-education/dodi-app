/**
 * The parent area's navigation, shared by the web's sidebar / drawer and the
 * mobile app's drawer: which destinations exist, in which groups and order,
 * their icons (semantic names both clients' `Icon` wrappers map), and when an
 * item counts as active. Labels are message keys.
 */

export type ParentNavIcon =
  | "dashboard"
  | "kids"
  | "personas"
  | "games"
  | "camera"
  | "activities"
  | "usage"
  | "settings"
  | "bell"
  | "lock"
  | "sparkles"
  | "qrcode";

export interface ParentNavItem {
  href: string;
  /** Message key (e.g. "nav.dashboard"). */
  labelKey: string;
  icon: ParentNavIcon;
  /** Extra path prefixes that also mark this item active. */
  aliases?: string[];
}

export interface ParentNavGroup {
  labelKey: string;
  items: ParentNavItem[];
}

export const PARENT_NAV_GROUPS: ParentNavGroup[] = [
  {
    labelKey: "nav.navGroupFamily",
    items: [
      { href: "/parent/dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
      { href: "/parent/kids", labelKey: "nav.kids", icon: "kids" },
      { href: "/parent/personas", labelKey: "nav.personas", icon: "personas" },
      // Creating/editing a game lives under /parent/game-studio; keep Games active there.
      { href: "/parent/games", labelKey: "nav.gameStudio", icon: "games", aliases: ["/parent/game-studio"] },
      { href: "/parent/snapshots", labelKey: "nav.parentSnapshots", icon: "camera" },
    ],
  },
  {
    labelKey: "nav.navGroupInsights",
    items: [
      { href: "/parent/activities", labelKey: "nav.activities", icon: "activities" },
      { href: "/parent/usage", labelKey: "nav.usage", icon: "usage" },
    ],
  },
];

/** The settings sub-navigation (web: overlay rail on wide screens, tab strip on phones). */
export const SETTINGS_NAV: ParentNavItem[] = [
  { href: "/parent/settings/general", labelKey: "settings.navGeneral", icon: "settings" },
  { href: "/parent/settings/notifications", labelKey: "settings.navNotifications", icon: "bell" },
  { href: "/parent/settings/security", labelKey: "settings.navSecurity", icon: "lock" },
  { href: "/parent/settings/ai-providers", labelKey: "settings.navAiProviders", icon: "sparkles" },
  { href: "/parent/settings/game-studio", labelKey: "settings.navGameStudio", icon: "games" },
  { href: "/parent/settings/devices", labelKey: "settings.navDevices", icon: "qrcode" },
];

/** True when the current path falls under a nav item (its href or an alias). */
export function isNavItemActive(item: Pick<ParentNavItem, "href" | "aliases">, pathname: string): boolean {
  return [item.href, ...(item.aliases ?? [])].some((prefix) => pathname.startsWith(prefix));
}
