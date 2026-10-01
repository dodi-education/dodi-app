# clients/mobile

The Expo / React Native client (Expo SDK 57, RN 0.86, New Architecture,
Expo Router, NativeWind 4). The root CLAUDE.md applies; this adds the app's
own rules. Feature parity with the web is tracked in `dodi-app/features.yaml`
(see the `/feature-parity` skill).

## Layout
- `src/app/` — Expo Router screens, mirroring the web routes
  (`(auth)/login.tsx` ↔ `clients/web/src/app/(auth)/login/page.tsx`).
- `src/adapters/` — the only place platform APIs live: SecureStore, SQLite
  key-value, native Argon2, the auth client, the platform ports
  (`platform.ts`) for `@dodi/client-state`.
- `src/lib/client-state.ts` — the app's shared stores, bound to React with the
  web's names (`useVaultStore`, `useKidStore`, …).
- `src/components/ui/` — primitives (`Button`, `TextField`, `Card`, `Notice`,
  `SwitchRow`, `Screen`, `Text`). Build screens from these.
- `src/polyfills.ts` — imported first by the root layout (`crypto.getRandomValues`,
  streaming `fetch`).

## Rules
- **Logic goes in `core/*`**, not here. If a screen needs fetching, caching,
  crypto or a multi-step flow, put it in `@dodi/client-state` (or the matching
  core package) with tests, and switch the web to it too. Screens hold UI state
  only. `@dodi/client-state/<file>` subpaths are importable.
- **Strings** come from `core/intl/messages/{en,de}.json` via
  `useTranslations` from `use-intl` (same keys as the web). New keys go into
  both files. Copy avoids "—" and never starts a sentence with "dodi".
- **Styling**: NativeWind classes with the shared token names (`bg-primary`,
  `text-ink`, `border-border-strong`). No hex colors in screens except where an
  API needs a raw color (icons, `Switch` track), and then use token values.
- **Icons**: import from `@/components/ui/icons` only; add a deep import there
  for a new icon (the package barrel would bundle every icon).
- **Accessibility**: touch targets ≥ 44 pt (`min-h-11`/`min-h-12`), an
  `accessibilityLabel` on every icon-only control, `accessibilityRole` on
  custom pressables.
- **Network**: requests go through `api` / `authClient` (`src/adapters`),
  which send no cookies (`cookielessFetch`). Never call `fetch` directly.
- **Secrets**: anything secret persists via `sealedSlot` (adapters/sealed-storage),
  never plain SQLite or AsyncStorage.
- Game code only ever runs in the sandboxed WebView with `buildSandboxSrcDoc`.

## Checks
- `pnpm --filter @dodi/mobile typecheck`
- `pnpm --filter @dodi/mobile bundle:check` (Metro bundles for Android + iOS;
  catches resolution errors without a native build)
- `pnpm parity:check` from `dodi-app/`
- Native builds: Android locally (`pnpm --filter @dodi/mobile build:android`;
  needs `ANDROID_HOME` and JDK 17), iOS on EAS (`eas build -p ios`).
- Native dependencies that need Gradle fixes are patched with `pnpm patch`
  (see `dodi-app/patches/`), never by editing node_modules. After patching a
  native package, prebuild with `--clean` (autolinking caches package paths).
