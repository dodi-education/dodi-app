import type { AgentScope } from "@dodi/protocol/agent-scopes";

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
  | "qrcode"
  | "ai";

export interface ParentNavItem {
  href: string;
  /** Message key (e.g. "nav.dashboard"). */
  labelKey: string;
  icon: ParentNavIcon;
  /** Extra path prefixes that also mark this item active. */
  aliases?: string[];
  /**
   * Who sees it besides the owner and co-parents: `"any"` = every family
   * member, a scope = scoped members holding it. Absent = owner and
   * co-parents only.
   */
  requires?: "any" | AgentScope;
}

export interface ParentNavGroup {
  labelKey: string;
  items: ParentNavItem[];
}

export const PARENT_NAV_GROUPS: ParentNavGroup[] = [
  {
    labelKey: "nav.navGroupAccount",
    items: [
      { href: "/parent/dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
      { href: "/parent/kids", labelKey: "nav.kids", icon: "kids" },
      // Personas live inside Companions (a tab); old /parent/personas links redirect.
      { href: "/parent/companions", labelKey: "nav.companions", icon: "personas", aliases: ["/parent/personas"] },
      // Creating/editing a game lives under /parent/game-studio; keep Games active there.
      {
        href: "/parent/games",
        labelKey: "nav.gameStudio",
        icon: "games",
        aliases: ["/parent/game-studio"],
        requires: "games",
      },
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

/**
 * The settings sub-navigation (web: overlay rail on wide screens, tab strip on
 * phones). Settings are the active account's; what belongs to the person
 * (email, language, password, their accounts, deleting their profile) is on
 * the profile page (PROFILE_HREF).
 */
export const SETTINGS_NAV: ParentNavItem[] = [
  { href: "/parent/settings/general", labelKey: "settings.navGeneral", icon: "settings", requires: "any" },
  // The account's people and everything that can open the vault: browsers,
  // the app, the robot, agents. Scoped members see the people only.
  { href: "/parent/settings/access", labelKey: "settings.navAccess", icon: "qrcode", requires: "any" },
  { href: "/parent/settings/notifications", labelKey: "settings.navNotifications", icon: "bell", requires: "any" },
  { href: "/parent/settings/security", labelKey: "settings.navSecurity", icon: "lock" },
  { href: "/parent/settings/ai-providers", labelKey: "settings.navAiProviders", icon: "sparkles" },
  { href: "/parent/settings/game-studio", labelKey: "settings.navGameStudio", icon: "games" },
];

/**
 * The person's own page (reached from their email at the foot of the menu):
 * their profile across accounts, open to everyone in the account.
 */
export const PROFILE_HREF = "/parent/profile";

/** True when the current path falls under a nav item (its href or an alias). */
export function isNavItemActive(item: Pick<ParentNavItem, "href" | "aliases">, pathname: string): boolean {
  return [item.href, ...(item.aliases ?? [])].some((prefix) => pathname.startsWith(prefix));
}

/**
 * Who is looking: their role in the family and, for a scoped member, what
 * they were granted. `role` null = not loaded yet (treated like full access:
 * the platform refuses anything a member may not do regardless).
 */
export interface ParentAccess {
  role: "owner" | "co_parent" | "member" | null;
  scopes: readonly string[];
}

/** Owners and co-parents see everything; scoped members what they were granted. */
export function canSeeNavItem(item: Pick<ParentNavItem, "requires">, access: ParentAccess): boolean {
  if (access.role !== "member") return true;
  if (item.requires === "any") return true;
  return item.requires !== undefined && access.scopes.includes(item.requires);
}

/** The parent navigation this person sees (empty groups dropped). */
export function parentNavFor(access: ParentAccess): ParentNavGroup[] {
  return PARENT_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNavItem(item, access)),
  })).filter((group) => group.items.length > 0);
}

/** The settings tabs this person sees. */
export function settingsNavFor(access: ParentAccess): ParentNavItem[] {
  return SETTINGS_NAV.filter((item) => canSeeNavItem(item, access));
}

/**
 * Whether this person may open a parent page. Pages belong to the nav item
 * they fall under; anything else in the parent area (allowing an agent, the
 * event log, ...) is for the owner and co-parents.
 */
export function isParentPathAllowed(pathname: string, access: ParentAccess): boolean {
  if (access.role !== "member") return true;
  // The settings index only redirects to a tab.
  if (pathname === "/parent/settings" || pathname === "/parent/settings/") return true;
  if (pathname.startsWith(PROFILE_HREF)) return true;
  const items = [...PARENT_NAV_GROUPS.flatMap((group) => group.items), ...SETTINGS_NAV];
  const match = items.find((item) => isNavItemActive(item, pathname));
  return match ? canSeeNavItem(match, access) : false;
}

/** Where this person lands in the parent area. */
export function parentHomeFor(access: ParentAccess): string {
  return parentNavFor(access)[0]?.items[0]?.href ?? "/parent/settings/general";
}

/** Whether this person may switch to the kid view (the family's kids and their data). */
export function canUseKidView(access: ParentAccess): boolean {
  return access.role !== "member";
}
