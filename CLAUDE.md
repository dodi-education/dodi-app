# dodi Web — Development Guidelines

## Project Overview

dodi is a personalized, AI-powered learning platform for kids. See `PROJECT.md` for full requirements.

**Stack**: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn/ui · Tabler Icons · Supabase · Vercel

---

## AI-Agentic First Design Philosophy

When AI is the primary consumer and producer of data, **design the format for AI comprehension first**, human readability second, machine queryability third. This principle guides all data architecture decisions in dodi where AI companions interact with stored content.

### Markup Over Schema

Prefer markdown/text documents over structured relational tables for AI-consumed data (memory, personas, context). AI models understand narrative documents natively — they don't need data serialized into rows and columns.

**Example — Memory system:**

| Traditional DB approach | AI-native markup approach |
|------------------------|--------------------------|
| `confidence: 0.85` (float column) | "observed across 4 sessions, most recently Feb 28" |
| `category: 'challenge'` (enum) | Lives under a `## Challenges` heading the AI reads naturally |
| `observed_by: uuid` (FK to personas) | "First noted by Explorer dodi, confirmed across 12+ sessions" |
| Requires ORM, serialization, rigid schema | AI reads it as a briefing doc and writes it like a journal |

The markup approach is richer, more contextual, and the AI reasons about it directly without a serialization layer.

### When Structured Data IS Appropriate

Structured relational schemas remain correct for **operational data** — accounts, profiles, games, schedules, friends — data that needs indexing, filtering, joins, and RLS policies. The AI-agentic principle applies specifically to **AI-facing content**: persona `soul` documents, profile `memory` dossiers, and `parent_notes`.

### Implications

- Persona definitions are markdown `soul` documents, not JSONB config objects
- Kid memory is a markdown dossier the AI reads/writes, not a table of memory entries
- Parent notes are freeform text, not structured form fields
- The AI can evolve document structure organically without schema migrations
- Parents can read and edit these documents directly as plain text

---

## Code Conventions

### Bugfixing & Debugging

- When I report a bug, don't start by trying to fix it. Instead, start by writing a test that reproduces the bug. Then, have subagents try to fix the bug and prove it with a passing test.
- NEVER GUESS a possible bugfix. If the solution is not clear, evaluate adding further debug / logging code to narrow down the problem.
- When presented with debug/console logs, determine if the presented logs are sufficient and if not, suggest add logs that could help narrow down the problem.
- Always ask before starting to debug with Chromium

### TypeScript
- **Strict mode** enabled (`"strict": true` in tsconfig)
- Prefer `interface` over `type` for object shapes that may be extended
- Use `type` for unions, intersections, and utility types
- No `any` — use `unknown` and narrow with type guards
- Explicit return types on exported functions and API route handlers

### Naming
- **Brand Name** dodi should always be written in all small letters in the frontend UI (marketing landing etc.). Avoid starting sentences with "dodi".
- **Files**: kebab-case (`game-sandbox.tsx`, `ai-provider.ts`)
- **File & variable names**: Avoid using "dodi" in file, varialbe, class, etc. names.
- **Components**: PascalCase (`GameSandbox`, `DodiAvatar`)
- **Hooks**: camelCase with `use` prefix (`useProfile`, `useDodiChat`)
- **Stores**: camelCase with `Store` suffix (`profileStore`, `gameStore`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_GAMES_FREE_TIER`)
- **Database tables/columns**: snake_case (`kid_profiles`, `created_at`)
- **Booleans** (columns, fields, props): name so the value reads as a yes/no predicate. **Prefer an `is_`/`has_`/`can_` prefix** (`is_active`, `has_avatar`, `can_add_friends`); Avoid noun-like boolean names (`first_interaction` → `has_met_dodi`) or one word names (`accepted`, `succeeded`).
- **API routes**: kebab-case paths (`/api/ai/generate-game`)

### Components
- Default to **Server Components**. Only add `"use client"` when the component needs browser APIs, event handlers, hooks, or state.
- Co-locate component-specific types in the same file
- One component per file. Exception: small tightly-coupled helper components.
- Prefer composition over prop drilling — use React context or Zustand for shared state
- Keep components focused — split when a component exceeds ~150 lines

### Imports
- Use `@/` path alias (maps to `src/`)
- Group imports: React/Next → external libs → internal modules → types → styles
- Prefer named exports over default exports (except for Next.js pages/layouts)

### API Design — "data travels with the row that owns it"
When adding entities or API endpoints: if a much **bigger** entity (e.g. kid)
references a much **smaller** one (e.g. persona), embed a slim projection of
the small entity in the big entity's read shape — joined server-side via the
FK (PostgREST embed) — instead of returning the raw id and making clients
fetch the referenced table to join client-side (N fetches, one per consumer).
- Embed only what display needs (id + label fields); **exclude heavy fields**
  (e.g. persona `soul` docs) — flows that need them fetch the full entity on
  demand.
- Write shapes still take the plain FK id (`active_persona_id`); only read
  shapes carry the embedded object (`active_persona`).
- E2EE is unaffected: embeds carry the same ciphertext the referenced table
  stores; decryption stays client-side (e.g. `decryptKid`).
- Cache coherence: mutating the small entity must invalidate/patch the big
  entity's client cache (e.g. persona rename → `kidStore.invalidate()`).
- Client caches are single-flight Zustand stores (`kid-store`, `account-store`)
  — never fetch-on-mount hooks with per-component state; new shared data joins
  an existing store or follows that pattern.

---

## Supabase Patterns

### Row-Level Security (RLS)
- **Every table** must have RLS enabled
- Policies must ensure users can only access their own data
- Pattern: `auth.uid() = account_id` for account-owned tables
- Profile-level access: join through profiles to verify account ownership
- Test RLS policies in the Supabase dashboard before deploying

### Migrations
- Store all schema changes in `supabase/migrations/`
- Name format: `YYYYMMDDHHMMSS_description.sql`
- Each migration should be reversible — include `-- reverse:` comments
- Never modify existing migrations — create new ones
- Run `supabase db diff` to generate migration files

### Typed Client
- Generate types with `supabase gen types typescript`
- Store generated types in `src/lib/supabase/types.ts`
- Regenerate after every migration
- Use the generated types in all Supabase queries:
  ```typescript
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .returns<Profile[]>()
  ```

### Client Usage
- **Server components / API routes**: Use `createServerClient` from `src/lib/supabase/server.ts`
- **Client components**: Use `createBrowserClient` from `src/lib/supabase/client.ts`
- **Middleware**: Use `createMiddlewareClient` for auth session refresh
- Never import the service role key in client-side code

---

## AI Provider Abstraction

AI providers should always be abstract. The user should be able to switch AI providers for each category (e.g. Voice, Image generation, Thinking, etc.). At some point it should also be possible to provide open models, running on local user hardware.

### Interface
All AI providers implement a common interface:

```typescript
interface AIProvider {
  id: string
  name: string
  chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>
  streamChat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk>
  supportsVoice(): boolean
  voiceChat?(audioStream: ReadableStream, options: VoiceOptions): Promise<VoiceResponse>
  getAvailableModels(): Model[]
}
```

### Routing
- `src/lib/ai/router.ts` selects the correct provider based on the parent's configuration
- Dodi chat uses the voice-capable model configured for the profile
- Game generation uses the game model configured for the account
- Anthropic models can be directly called client-side.

### API Key Handling
- Keys, like other encrypted data, should always be decrypted client-side
- Keys are passed to provider adapters in-memory, never logged or serialized
- Provider adapters do not store keys between requests

---

## Security Guidelines

We want to ensure server blindness via end-to-end encryption and running AI calls client side.
At a a later stage, we also want to provide the possibility to choose between two setups:
1. BYOK: Bring your own key, for tech/ai savy people (free/cheap). In the BYOK (default) scenario we MUST ensure provider blindness as this is a key promise for the user. This means, no client secrets are transferred to our server (not even transitory)
2. Hosted: We (dodi company) provides temporary, isolated keys (monthly subscription or pay for token usage)

### API Keys
- End-to-end encrypted: keys are sealed **client-side** under the account vault key and stored in Supabase as a single opaque blob (`accounts.encrypted_api_keys`). The server stores/returns it verbatim and can never decrypt it.
- The provider key is decrypted only in the unlocked browser vault. 
- Never include in client bundles, logs, or error messages

### Games are E2EE
A `games` row is plaintext **iff** `is_system = true` OR `publication_requested_at IS NOT NULL`;
every other row's `title`, `description`, `code_bundle`, `markdown`, `learning_goal`,
`success_definition`, `success_criteria` and `preview_image` are `enc:v1:` records
sealed client-side, as is `game_versions.code_bundle`. Consequences:
- **Never read those fields server-side** — no search, no ordering, no logging, no
  interpolating a title into `activities.message`. Reference the game by id and let
  the client resolve the name from the decrypted cache.
- The **client** sanitizes bundles (`@dodi/games/sanitizer`) before sealing; the server
  can only sanitize on the publication path, where the copy is plaintext.
- Reads go through `useGameStore` (`stores/game-store.ts`) — the single decrypt point.
  Writes seal via `sealGameFields`/`sealGameCreateFields`; responses open via
  `decryptGameResponse`.
- Publishing **forks**: it inserts a second, plaintext `games` row
  (`source_game_id` → the original) so the parent's game and its version history stay
  sealed. Publication rows are written only via `serviceClient()` — RLS forbids users
  writing them. See `services/game-publications.ts`.
- **Discover is play-in-place**: other families never copy a published game to play
  it — they point `game_sharings` rows (their own `account_id`) at the single
  published row, so plays aggregate on it. RLS stays closed for non-owners; every
  cross-account read goes through `services/discover.ts` (serviceClient + explicit
  projection — publisher `account_id`/`kid_id`/`published_by_account_id` never
  leak; the byline is `publication_handle` only). Copying happens only via Remix
  (re-sealed under the remixing family's vault, `source_game_id` = the published row).

### Game Sandboxing
- All AI-generated game code runs in a sandboxed iframe:
  ```html
  <iframe sandbox="allow-scripts" referrerpolicy="no-referrer" />
  ```
- Never use `allow-same-origin` with `allow-scripts`
- Use `srcdoc` attribute — never load from a URL
- Communication via `postMessage` only, with origin validation
- Sanitize game code before injection (strip `<script src>` external loads, `fetch()`, `XMLHttpRequest`, `import()`)
- Implement a game API via postMessage protocol for score/completion reporting

### Input Validation
- Validate all user input on the server (API routes)
- Use Zod schemas for request body validation
- Sanitize markup text fields (personality, memory) before passing to AI
- Rate-limit AI API calls per account

### Authentication
- Use Supabase Auth with RLS — never roll custom auth
- Verify session in middleware for all protected routes
- Parent/kid view access controlled by active profile state
- No sensitive operations without re-authentication

---

## Testing

### Unit Tests (Vitest)
- Test files co-located next to source: `component.test.tsx`, `utils.test.ts`
- Focus on: AI provider adapters, encryption utilities, game sanitizer, Zustand stores, data transformations
- Mock Supabase client in unit tests
- Aim for high coverage on `src/lib/` utilities

### E2E Tests (Playwright)
- Located in `tests/e2e/`
- Cover critical user flows:
  - Parent registration and login
  - Profile creation
  - dodi chat interaction
  - Game creation and play
  - Schedule management
- Run against a local Supabase instance with seed data

### Running Tests
```bash
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright E2E tests
npm run test:coverage # Coverage report
```

---

## Git Workflow

### Branch Naming
- `feature/<description>` — new features
- `fix/<description>` — bug fixes
- `chore/<description>` — tooling, config, deps

### Commit Messages
Follow Conventional Commits:
```
feat: add dodi voice interaction mode
fix: correct game sandbox CSP policy
chore: update Supabase types after migration
docs: add API provider configuration guide
```

### Pre-commit
- ESLint + Prettier run on staged files (via lint-staged + husky)
- Type checking via `tsc --noEmit`

---

## Performance

- Use Next.js Image component for all images
- Lazy-load Lottie animations and game sandbox
- Prefetch routes for kid navigation (games, schedule, home)
- Keep client bundles small — audit with `@next/bundle-analyzer`
- Use React `Suspense` boundaries with meaningful loading states (dodi thinking animation)
- Cache AI responses where appropriate (e.g., game metadata, personality prompts)
- Use Supabase realtime only where needed (friend requests, shared games)

---

## Accessibility

- WCAG 2.1 AA compliance as baseline
- All interactive elements keyboard-navigable
- ARIA labels on icon-only buttons and dodi states
- High contrast mode support
- Minimum touch targets: 44x44px (critical for kid use on tablets)
- Screen reader support for dodi chat messages
- Reduce motion support for dodi animations (`prefers-reduced-motion`)

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=             # Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= # Supabase publishable key sb_publishable_… (safe for client)
SUPABASE_SECRET_KEY=                  # Supabase secret key sb_secret_… (server only, bypasses RLS)
NEXT_PUBLIC_APP_URL=                  # App URL (for OAuth redirects, QR codes)

# Platform (api.dodi.app) — registration gate & auth hook. See docs/auth-setup.md
REGISTRATION_MODE=                    # open | invite | closed (unset ⇒ open); server-only
ERROR_LOGS=                      # Error telemetry persisted to error_logs: all | client | server | none, or comma list (unset ⇒ all); server-only
BEFORE_USER_CREATED_HOOK_SECRET=      # Supabase auth-hook secret "v1,whsec_…" (server only)
OPS_SECRET=                           # ops↔platform m2m secret, sent as x-ops-secret; gates all server-to-server ops endpoints (today: publication queue/stamp/process; later the dodi-com/ops console). Server only; unset ⇒ they refuse
CRON_SECRET=                          # Vercel Cron auth ("Authorization: Bearer …") for GET /api/internal/publications/process — the review-worker trigger (server only)
SYSTEM_NOTIFICATION_EMAIL=            # Operator inbox for publication notifications (request created / rejected); unset ⇒ skipped with a warning
# The security agent itself (provider/model/key) is configured in the
# platform_config table (service-role only), NOT env: the three KV rows
# security_agent_provider|model|key are seeded blank (= disabled) by migration
# 20260722140000 — set their jsonb string values in the dashboard to enable.
RESEND_API_KEY=                       # Resend key: Supabase SMTP + app-level email via the SDK (server only)
EMAIL_FROM=                           # App-level email sender on a Resend-verified domain (server only; prod verifies mail.dodi.app, dev dev-mail.dodi.app; default "dodi <team@mail.dodi.app>")
```

- `NEXT_PUBLIC_` prefix = exposed to client (only non-sensitive values)
- All other env vars are server-only
- Never commit `.env.local` — use `.env.local.example` as template
- Vercel environment variables configured per environment (preview, production)
- Registration modes + invite codes + Resend/email + the before_user_created hook
  are documented end-to-end in `docs/auth-setup.md`

---

## Commands Reference

```bash
npm run dev           # Start development server
npm run build         # Production build
npm run start         # Start production server
npm run lint          # Run ESLint
npm run format        # Run Prettier
npm run test          # Run unit tests
npm run test:e2e      # Run E2E tests
npm run test:coverage # Test coverage report
npm run db:migrate    # Run Supabase migrations
npm run db:types      # Regenerate Supabase types
npm run db:seed       # Seed development data
npm run db:reset      # Reset local Supabase DB
```
