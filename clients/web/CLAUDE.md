# clients/web

The Next.js client. The root CLAUDE.md applies; this adds the parity rules.

- Screens and browser adapters only. Store logic is `@dodi/client-state` (this
  app's instance: `src/lib/client-state.ts`; `src/stores/*` are bindings that keep
  the app-facing names), build logic is `@dodi/studio` (`src/lib/games/studio-ports.ts`).
  New logic goes into those packages so the mobile app gets it too.
- UI strings live in `core/intl/messages/{en,de}.json`; theme colors in
  `@dodi/design-tokens` (globals.css maps them into Tailwind).
- A new or changed page under `src/app/` updates `dodi-app/features.yaml` and
  passes `pnpm parity:check` (see the `/feature-parity` skill).
