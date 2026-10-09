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
  /** Live label for the final crumb when the URL can't express it (game
   *  title, persona name) — pages publish it via the breadcrumb store. */
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
        if (seg[2] === "memory")
          crumbs.push({ label: t("breadcrumbs.memory") });
      }
      return crumbs;
    }

    // Personas are a tab of Companions (/parent/companions/personas/...);
    // the old /parent/personas paths only redirect there.
    case "companions":
    case "personas": {
      const crumbs: Crumb[] = [
        { label: t("nav.companions"), href: "/parent/companions" },
      ];
      const rest = section === "personas" ? ["personas", ...seg.slice(1)] : seg.slice(1);
      if (rest[0] === "personas") {
        crumbs.push({ label: t("nav.personas"), href: "/parent/companions?tab=personas" });
        if (rest[1] === "new") crumbs.push({ label: t("breadcrumbs.newPersona") });
        else if (rest[1]) crumbs.push({ label: opts.leafOverride || "…" });
        return crumbs;
      }
      if (rest[0] === "new") crumbs.push({ label: t("breadcrumbs.newCompanion") });
      else if (rest[0]) crumbs.push({ label: opts.leafOverride || "…" });
      return crumbs;
    }

    // The games list lives at /parent/games; creating or editing a game opens
    // the studio at /parent/game-studio/{id}, and previewing a published game
    // sits at /parent/games/{id}. All share the "Games" root crumb.
    case "games":
    case "game-studio": {
      const crumbs: Crumb[] = [
        { label: t("nav.gameStudio"), href: "/parent/games" },
      ];
      const id = seg[1];
      if (id) {
        const fallback =
          section === "games"
            ? t("gameStudio.preview")
            : id === "new"
              ? t("gameStudio.addGame")
              : t("gameStudio.editing");
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
        access: t("settings.navAccess"),
      };
      const sub = seg[1];
      if (sub && subLabel[sub]) crumbs.push({ label: subLabel[sub] });
      return crumbs;
    }

    // The approval page for a robot or agent sits outside settings but
    // belongs to Access.
    case "authorize":
      return [
        { label: t("nav.settings"), href: "/parent/settings/general" },
        { label: t("settings.navAccess"), href: "/parent/settings/access" },
        { label: t("access.authorizeTitle") },
      ];

    case "snapshots":
      return [{ label: t("nav.parentSnapshots") }];

    case "activities":
      return [{ label: t("nav.activities") }];

    case "event-logs":
      return [{ label: t("nav.activities") }];

    case "usage":
      return [{ label: t("nav.usage") }];

    case "report":
      return [{ label: t("nav.report") }];

    default:
      return [];
  }
}
