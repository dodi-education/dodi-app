/**
 * The web ↔ mobile parity rules over features.yaml: pure, so the CLI and the
 * tests share them. See features.yaml for the manifest format.
 */

export const STATUSES = ["done", "planned", "n/a"] as const;
export const MOBILE_STATUSES = [...STATUSES, "mobile-only"] as const;

export interface Feature {
  id: string;
  area: string;
  title: string;
  web: string;
  mobile: string;
  phase?: number;
  core?: string[];
  web_paths?: string[];
  mobile_paths?: string[];
  notes?: string;
}

export interface Manifest {
  features: Feature[];
}

export interface RepoView {
  /** Paths (relative to dodi-app/) of the web route files: app/**\/page.tsx. */
  webRoutes: string[];
  /** Paths of the mobile screen files (Expo Router), empty before the app exists. */
  mobileScreens: string[];
  /** Workspace package directory names under core/. */
  corePackages: string[];
  exists(path: string): boolean;
}

export interface ParityReport {
  errors: string[];
  warnings: string[];
}

export function checkParity(manifest: Manifest, repo: RepoView): ParityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const webListed = new Set<string>();
  const mobileListed = new Set<string>();

  if (!Array.isArray(manifest?.features)) {
    return { errors: ["features.yaml: top-level `features` list is missing"], warnings };
  }

  for (const f of manifest.features) {
    const at = `feature "${f.id ?? "?"}"`;
    for (const field of ["id", "area", "title", "web", "mobile"] as const) {
      if (typeof f[field] !== "string" || !f[field]) errors.push(`${at}: missing \`${field}\``);
    }
    if (seen.has(f.id)) errors.push(`${at}: duplicate id`);
    seen.add(f.id);

    if (!(STATUSES as readonly string[]).includes(f.web)) {
      errors.push(`${at}: web status "${f.web}" is not one of ${STATUSES.join(", ")}`);
    }
    if (!(MOBILE_STATUSES as readonly string[]).includes(f.mobile)) {
      errors.push(`${at}: mobile status "${f.mobile}" is not one of ${MOBILE_STATUSES.join(", ")}`);
    }

    // A conscious decision for every gap: when it lands, or why it never will.
    for (const [client, status] of [
      ["web", f.web],
      ["mobile", f.mobile],
    ] as const) {
      if (status === "planned" && f.phase === undefined && !f.notes) {
        errors.push(`${at}: ${client} is planned but has no \`phase\` or \`notes\``);
      }
      if (status === "n/a" && !f.notes) {
        errors.push(`${at}: ${client} is n/a but has no \`notes\` saying why`);
      }
    }

    for (const [client, status, paths, listed] of [
      ["web", f.web, f.web_paths, webListed],
      ["mobile", f.mobile, f.mobile_paths, mobileListed],
    ] as const) {
      for (const path of paths ?? []) {
        listed.add(path);
        if (!repo.exists(path)) {
          if (status === "done" || status === "mobile-only") {
            errors.push(`${at}: ${client} is ${status} but ${path} does not exist`);
          } else {
            warnings.push(`${at}: ${path} does not exist yet`);
          }
        }
      }
      if (status === "done" && !(paths ?? []).length) {
        errors.push(`${at}: ${client} is done but lists no ${client}_paths`);
      }
    }

    for (const pkg of f.core ?? []) {
      if (!repo.corePackages.includes(pkg)) errors.push(`${at}: unknown core package "${pkg}"`);
    }
  }

  for (const route of repo.webRoutes) {
    if (!webListed.has(route)) {
      errors.push(`web route ${route} belongs to no feature (add it to features.yaml)`);
    }
  }
  for (const screen of repo.mobileScreens) {
    if (!mobileListed.has(screen)) {
      errors.push(`mobile screen ${screen} belongs to no feature (add it to features.yaml)`);
    }
  }

  return { errors, warnings };
}
