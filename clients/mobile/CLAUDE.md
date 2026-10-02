# clients/mobile

The Expo / React Native client (Expo SDK 57, RN 0.86, New Architecture,
Expo Router, NativeWind 4). The root CLAUDE.md applies; this adds the app's
own rules. Feature parity with the web is tracked in `dodi-app/features.yaml`
(see the `/feature-parity` skill).

## The UI mirrors the web's phone layout
A mobile screen is a port of the web page **as it renders at phone width**
(the web's `compact` layout, < 768px / portrait): same structure, same
component names and props, same classes. Open the web page's source next to the
screen you're writing and port it element by element. Native-only UI is allowed
only for features `features.yaml` marks `mobile-only` (background-build
progress, notifications, share sheet) and for platform mechanics (safe areas,
keyboard avoidance, Android back).

- **No native navigation chrome.** No tab bars, no stack headers
  (`headerShown: false` everywhere). The parent area is `ParentShell`
  (top bar with menu button, breadcrumbs as the page title, Kid View; the menu
  is the left drawer); settings use `BackLink` + the tab strip; auth pages use
  `AuthLayout` + one `Card`.
- **Styles come from `@dodi/ui-recipes`** (shared with the web). A recipe's
  `box` goes on the view and its `text` on the `Text` inside (React Native
  doesn't inherit text styles). Never restyle a primitive locally; change the
  recipe so the web changes too (and keep `clients/web/src/components/ui/
  recipes-parity.test.ts` green).
- **Use the mirrored kit** (`@/components/ui`): `Button` (variant/size/icon),
  `Input`, `PasswordInput`, `Label`, `Card` + parts, `Switch` (the web's 36×20,
  never RN's), `Select` (field + bottom `Sheet`), `Sheet`, `Dialog` (not
  `Alert.alert`), `PinInput`, `Badge`, `Icon` (the web's semantic names),
  `Text` (always; it picks the Hanken Grotesk / Nunito face from the weight
  class). Parent blocks in `@/components/parent`: `Section`, `PageActions`,
  `Row`/`RowMain`/`RowTitle`/`RowMeta`/`DotSep`, `FieldRow`, `StackField`,
  `SaveRow`, `BackLink`.
- Shared data the web's pages use for structure (nav groups, settings tabs,
  breadcrumb trails) comes from `@dodi/client-state/parent-nav` and
  `/breadcrumbs`.

## Layout
- `src/app/` — Expo Router screens, mirroring the web routes
  (`(auth)/login.tsx` ↔ `clients/web/src/app/(auth)/login/page.tsx`).
- `src/adapters/` — the only place platform APIs live: SecureStore, SQLite
  key-value, native Argon2, the auth client, the platform ports
  (`platform.ts`) for `@dodi/client-state`.
- `src/lib/client-state.ts` — the app's shared stores, bound to React with the
  web's names (`useVaultStore`, `useKidStore`, …).
- `src/components/ui/` — the mirrored primitives; `src/components/shared/` —
  `ParentShell`, `AuthLayout`, `ShellContent`, `PageBackground`, `Breadcrumbs`.
- `index.ts` — the app entry (package.json `main`): imports `src/polyfills.ts`
  first, then `expo-router/entry`. The polyfills can't live in the root layout:
  Expo Router loads routes (and through them @noble, which captures
  `globalThis.crypto` at load) before `_layout`.

## Rules
- **Logic goes in `core/*`**, not here. Screens hold UI state only.
  `@dodi/client-state/<file>` subpaths are importable.
- **Strings** come from `core/intl/messages/{en,de}.json` via `useTranslations`
  from `use-intl` (same keys as the web). New keys go into both files. Copy avoids
  "—" and never starts a sentence with "dodi".
- **Colors** only through token classes or `Icon color="…"` token names; no hex
  in screens.
- **Icons**: the `Icon` wrapper; to add one, deep-import it in
  `components/ui/icons.ts` and name it in `components/ui/icon.tsx` (the web's name).
- **Accessibility**: an `accessibilityLabel` on every icon-only control,
  `accessibilityRole` on pressables, `hitSlop` where the web's control is
  smaller than 44 pt.
- **Network**: through `api` / `authClient` (`src/adapters`), never raw `fetch`.
- **Secrets**: `sealedSlot` (adapters/sealed-storage), never plain storage.
- Game code only ever runs in the sandboxed WebView with `buildSandboxSrcDoc`.

## Checks
- `pnpm --filter @dodi/mobile typecheck`
- `pnpm --filter @dodi/mobile bundle:check` (Metro bundles for Android + iOS;
  catches resolution errors without a native build)
- `pnpm parity:check` from `dodi-app/`
- `pnpm visual:parity` from `dodi-app/` (web vs app screenshots, see tools/visual-parity)
- Native builds: Android locally (`pnpm --filter @dodi/mobile build:android`;
  needs `ANDROID_HOME` and JDK 17), iOS on EAS (`eas build -p ios`).
- Native dependencies that need Gradle fixes are patched with `pnpm patch`
  (see `dodi-app/patches/`), never by editing node_modules. After patching a
  native package, prebuild with `--clean` (autolinking caches package paths).
