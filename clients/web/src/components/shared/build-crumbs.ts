/**
 * Pure pathname → breadcrumb-trail mapping for the parent area. Kept free of
 * React/Next imports so it can be unit-tested in isolation. `t` is the next-intl
 * root translator (called with fully-qualified keys); dynamic names arrive via
 * `opts`.
 */

export interface Crumb {
  label: string;
  /** Link target. The last crumb is always rendered as plain text regardless. */
  href?: string;
  /** This crumb names a kid whose id can be swapped via the switcher dropdown. */
  isKidCrumb?: boolean;
}

export interface BuildCrumbsOptions {
  kidName?: string | null;
  personaName?: string | null;
  /** Live label for the final crumb when the URL can't express it (game title). */
  leafOverride?: string | null;
}

/** Reads the active kid id from the path when on a kid-scoped route. */
export function activeKidId(pathname: string): string | null {
  const m = pathname.match(/\/parent\/kids\/([^/]+)/);
  const id = m?.[1];
  return id && id !== "new" ? id : null;
}

export function buildCrumbs(
  pathname: string,
  t: (key: string) => string,
  opts: BuildCrumbsOptions = {},
): Crumb[] {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] !== "parent") return [];
  const seg = parts.slice(1);
  const section = seg[0];
  if (!section) return [];

  switch (section) {
    case "dashboard":
      return [{ label: t("nav.dashboard") }];

    case "kids": {
      const crumbs: Crumb[] = [{ label: t("nav.kids"), href: "/parent/kids" }];
      const id = seg[1];
      if (id === "new") {
        crumbs.push({ label: t("kids.addKid") });
      } else if (id) {
        crumbs.push({
          label: opts.kidName || "…",
          href: `/parent/kids/${id}`,
          isKidCrumb: true,
        });
        if (seg[2] === "memory") crumbs.push({ label: t("breadcrumbs.memory") });
      }
      return crumbs;
    }

    case "personas": {
      const crumbs: Crumb[] = [
        { label: t("nav.personas"), href: "/parent/personas" },
      ];
      const id = seg[1];
      if (id === "new") crumbs.push({ label: t("breadcrumbs.newPersona") });
      else if (id) crumbs.push({ label: opts.personaName || "…" });
      return crumbs;
    }

    case "game-studio": {
      const crumbs: Crumb[] = [
        { label: t("nav.gameStudio"), href: "/parent/game-studio" },
      ];
      const id = seg[1];
      if (id) {
        const fallback =
          id === "new" ? t("gameStudio.addGame") : t("gameStudio.editing");
        crumbs.push({ label: opts.leafOverride || fallback });
      }
      return crumbs;
    }

    case "settings": {
      const crumbs: Crumb[] = [
        { label: t("nav.settings"), href: "/parent/settings/general" },
      ];
      const subLabel: Record<string, string> = {
        general: t("settings.navGeneral"),
        security: t("settings.navSecurity"),
        "ai-providers": t("settings.navAiProviders"),
        devices: t("settings.navDevices"),
      };
      const sub = seg[1];
      if (sub && subLabel[sub]) crumbs.push({ label: subLabel[sub] });
      return crumbs;
    }

    case "system-logs":
      return [{ label: t("nav.systemLogs") }];

    default:
      return [];
  }
}
