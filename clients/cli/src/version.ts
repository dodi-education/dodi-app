/** The package version, injected by scripts/build.mjs; "dev" when run from source. */
declare const __DODI_CLI_VERSION__: string | undefined;

export const CLI_VERSION: string =
  typeof __DODI_CLI_VERSION__ === "string" ? __DODI_CLI_VERSION__ : "dev";
