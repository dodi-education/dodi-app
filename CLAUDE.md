# Dodi Web — Development Guidelines

## Project Overview

Dodi is a personalized, AI-powered learning platform for kids. See `PROJECT.md` for full requirements.

**Stack**: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn/ui · Tabler Icons · Supabase · Vercel

---

## AI-Agentic First Design Philosophy

When AI is the primary consumer and producer of data, **design the format for AI comprehension first**, human readability second, machine queryability third. This principle guides all data architecture decisions in Dodi where AI companions interact with stored content.

### Markup Over Schema

Prefer markdown/text documents over structured relational tables for AI-consumed data (memory, personas, context). AI models understand narrative documents natively — they don't need data serialized into rows and columns.

**Example — Memory system:**

| Traditional DB approach | AI-native markup approach |
|------------------------|--------------------------|
| `confidence: 0.85` (float column) | "observed across 4 sessions, most recently Feb 28" |
| `category: 'challenge'` (enum) | Lives under a `## Challenges` heading the AI reads naturally |
| `observed_by: uuid` (FK to personas) | "First noted by Explorer Dodi, confirmed across 12+ sessions" |
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

## Directory Structure

```
dodi-web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth routes (login, register, reset)
│   │   ├── (parent)/           # Parent config view routes
│   │   │   ├── dashboard/
│   │   │   ├── profiles/
│   │   │   ├── personalities/
│   │   │   ├── ai-config/
│   │   │   └── settings/
│   │   ├── (kid)/              # Kid-facing app routes
│   │   │   ├── home/           # Dodi main interaction
│   │   │   ├── games/          # Game library & play
│   │   │   ├── schedule/       # Weekly timetable
│   │   │   └── friends/        # Social features
│   │   ├── api/                # API routes (BFF for AI calls)
│   │   │   ├── ai/             # AI provider proxy routes
│   │   │   ├── games/          # Game CRUD
│   │   │   └── profiles/       # Profile operations
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives (Button, Input, etc.)
│   │   ├── dodi/               # Dodi mascot components
│   │   │   ├── dodi-avatar.tsx       # Lottie animation wrapper
│   │   │   ├── dodi-chat.tsx         # Chat interface
│   │   │   └── dodi-voice.tsx        # Voice interaction
│   │   ├── games/              # Game-related components
│   │   │   ├── game-sandbox.tsx      # Sandboxed iframe
│   │   │   ├── game-card.tsx
│   │   │   └── game-library.tsx
│   │   ├── schedule/           # Timetable components
│   │   ├── parent/             # Parent config components
│   │   └── shared/             # Cross-cutting components (nav, layout, etc.)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       # Browser Supabase client
│   │   │   ├── server.ts       # Server Supabase client
│   │   │   ├── middleware.ts   # Auth middleware helper
│   │   │   └── types.ts        # Generated DB types
│   │   ├── ai/
│   │   │   ├── provider.ts     # Abstract AI provider interface
│   │   │   ├── gemini.ts       # Google Gemini adapter
│   │   │   ├── openai.ts       # OpenAI/ChatGPT adapter
│   │   │   ├── anthropic.ts    # Claude adapter
│   │   │   ├── xai.ts          # Grok adapter
│   │   │   └── router.ts       # Provider selection & routing
│   │   ├── encryption.ts       # Server-side encryption utilities
│   │   ├── game-sanitizer.ts   # Game code validation & sanitization
│   │   └── utils.ts            # General utilities
│   ├── hooks/                  # Custom React hooks
│   ├── stores/                 # Zustand stores
│   ├── types/                  # Shared TypeScript types
│   ├── i18n/
│   │   ├── en.json
│   │   ├── de.json
│   │   └── config.ts
│   └── styles/
│       └── globals.css
├── public/
│   ├── animations/             # Lottie JSON files for Dodi
│   ├── icons/                  # PWA icons
│   └── manifest.json           # PWA manifest
├── supabase/
│   ├── migrations/             # SQL migration files
│   ├── seed.sql                # Development seed data
│   └── config.toml             # Supabase local config
├── tests/
│   ├── unit/                   # Vitest unit tests
│   ├── e2e/                    # Playwright E2E tests
│   └── fixtures/               # Test fixtures
├── .env.local.example          # Environment variable template
├── .eslintrc.json
├── .prettierrc
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── PROJECT.md
├── CLAUDE.md
└── package.json
```

---

## Code Conventions

### TypeScript
- **Strict mode** enabled (`"strict": true` in tsconfig)
- Prefer `interface` over `type` for object shapes that may be extended
- Use `type` for unions, intersections, and utility types
- No `any` — use `unknown` and narrow with type guards
- Explicit return types on exported functions and API route handlers

### Naming
- **Files**: kebab-case (`game-sandbox.tsx`, `ai-provider.ts`)
- **Components**: PascalCase (`GameSandbox`, `DodiAvatar`)
- **Hooks**: camelCase with `use` prefix (`useProfile`, `useDodiChat`)
- **Stores**: camelCase with `Store` suffix (`profileStore`, `gameStore`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_GAMES_FREE_TIER`)
- **Database tables/columns**: snake_case (`kid_profiles`, `created_at`)
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
- All AI calls go through API routes — never call AI providers from client-side code

### API Key Handling
- Keys are decrypted server-side only in API route handlers
- Keys are passed to provider adapters in-memory, never logged or serialized
- Provider adapters do not store keys between requests

---

## Security Guidelines

### API Keys
- Store encrypted in Supabase using AES-256-GCM
- Encryption key stored in environment variables (never in code or DB)
- Decrypt only in server-side API routes, only when needed
- Never include in client bundles, logs, or error messages

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
  - Dodi chat interaction
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
feat: add Dodi voice interaction mode
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
- Use React `Suspense` boundaries with meaningful loading states (Dodi thinking animation)
- Cache AI responses where appropriate (e.g., game metadata, personality prompts)
- Use Supabase realtime only where needed (friend requests, shared games)

---

## Accessibility

- WCAG 2.1 AA compliance as baseline
- All interactive elements keyboard-navigable
- ARIA labels on icon-only buttons and Dodi states
- High contrast mode support
- Minimum touch targets: 44x44px (critical for kid use on tablets)
- Screen reader support for Dodi chat messages
- Reduce motion support for Dodi animations (`prefers-reduced-motion`)

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anonymous key (safe for client)
SUPABASE_SERVICE_ROLE_KEY=        # Supabase service role key (server only)
ENCRYPTION_SECRET=                # AES-256 key for encrypting sensitive data
NEXT_PUBLIC_APP_URL=              # App URL (for OAuth redirects, QR codes)
```

- `NEXT_PUBLIC_` prefix = exposed to client (only non-sensitive values)
- All other env vars are server-only
- Never commit `.env.local` — use `.env.local.example` as template
- Vercel environment variables configured per environment (preview, production)

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
