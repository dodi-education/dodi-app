# dodi mobile

The Expo / React Native client for iOS and Android. Shares its logic with the
web app through `core/*`; see `CLAUDE.md` for the conventions.

## Setup

```bash
pnpm install                      # from dodi-app/
cp clients/mobile/.env.local.example clients/mobile/.env.local   # fill in the URLs
```

The app uses native modules (SecureStore, SQLite, Argon2, WebView), so it runs
in a **development build**, not Expo Go.

## Develop

```bash
pnpm --filter @dodi/mobile start          # Metro for a dev build
pnpm --filter @dodi/mobile typecheck
pnpm --filter @dodi/mobile bundle:check   # full Android + iOS JS bundles, no SDK needed
```

`bundle:check` is the fastest proof that every import resolves in Metro (the
pnpm workspace, NativeWind, package exports) without building native code.

## Native builds

The `android/` and `ios/` folders are generated (`expo prebuild`) and not
committed (Continuous Native Generation): change native settings in
`app.config.ts`, never in the generated folders.

**Android (local, Linux):** needs JDK 17 and the Android SDK (`ANDROID_HOME`).

```bash
export ANDROID_HOME=$HOME/Android/Sdk          # SDK 36, build-tools 36.0.0, NDK 27.1.12297006
pnpm --filter @dodi/mobile build:android      # → android/app/build/outputs/apk/release/app-release.apk
pnpm --filter @dodi/mobile build:android:aab  # → .aab for the Play Store
```

Release signing (`plugins/with-android-signing.js`) reads the upload keystore
from `credentials.json` (gitignored, EAS local-credentials format; the keystore
path is relative to `clients/mobile`). Without that file, release builds are
signed with the debug key: fine for side-loading, rejected by the Play Store.

**iOS (EAS, no Mac needed):**

```bash
npx eas build -p ios --profile development   # dev client for a registered device
npx eas build -p ios --profile preview       # TestFlight internal
npx eas build -p ios --profile production && npx eas submit -p ios
```

Profiles live in `eas.json`. EAS builds contain the app code only; no user data
leaves the device.

## First run on a device

Dev builds check at startup that this device's Argon2 implementation derives
the same key as the web's (the vector in `core/crypto/src/argon2-compat.test.ts`).
A mismatch logs `[argon2] executor disagrees with the web's`; vaults would
then not open across devices, so treat it as a release blocker.
