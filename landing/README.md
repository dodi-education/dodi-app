# @dodi/landing

The Dodi marketing site (apex `dodi.app` / `www`). Intentionally **decoupled** from
the web app (`@dodi/web`): it has no Supabase, vault, AI, or platform-API
dependencies and makes no network requests. It exists to be fast, cacheable, and
SEO-friendly.

## Characteristics

- **Fully static** — `output: "export"` produces plain HTML/CSS/JS in `out/` with
  no server or edge runtime (no middleware). Deploy as a static site.
- **Bilingual** — English at `/`, German at `/de`, each prerendered with the
  correct `<html lang>` and `hreflang` alternates. Translations are resolved at
  build time via `next-intl`'s `createTranslator` (no routing runtime).
- **Self-contained UI** — its own `Button`/`Icon`/`LanguageSwitcher` and a trimmed
  copy of the brand Tailwind tokens. Nothing is imported from `@dodi/*`.

## Develop

```bash
pnpm --filter @dodi/landing dev      # http://localhost:3002
pnpm --filter @dodi/landing build    # -> landing/out
pnpm --filter @dodi/landing preview   # serve the built output
```

App links (login / register) point at `NEXT_PUBLIC_APP_URL` — see `.env.example`.
