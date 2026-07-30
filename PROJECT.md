# Dodi – Social Learning Platform for Kids

## Vision

Dodi is a personalized, AI-powered learning platform that creates fun, targeted educational experiences for kids. At its heart is **Dodi**, a blue robot dodo bird mascot who guides kids through interactions, creates games tailored to their needs, and adapts to each child's age, skills, and preferences. Parents maintain full control through a dedicated configuration view while kids interact with a playful, minimal interface driven by the Dodi companion.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [User Roles & Flows](#user-roles--flows)
3. [Feature Requirements](#feature-requirements)
4. [Technical Architecture](#technical-architecture)
5. [Data Privacy & Security](#data-privacy--security)
6. [Internationalization](#internationalization)
7. [Monetization Strategy](#monetization-strategy)
8. [MVP Scope](#mvp-scope)
9. [Future Roadmap](#future-roadmap)

---

## Core Concepts

### Dodi Companion
- A **blue robot dodo bird** mascot visualized as an animated SVG/Lottie character
- Animated states: idle, talking, happy, thinking, celebrating, sad
- Central to the kid-facing UX — the interface should be as minimal as possible, with Dodi driving navigation and interaction
- Configurable personality (persona) stored as editable markdown `soul` document (per account, assignable per profile)
- Adapts language, tone, and complexity based on the kid's age (derived from birthdate)
- Kids can customize Dodi's appearance & behavior (colors, accessories, themes — e.g., superhero Dodi, pirate Dodi)
- Persona `soul` documents and profile `memory` dossiers follow the **AI-agentic first** design principle: stored as markdown text that AI reads/writes natively (see CLAUDE.md for rationale)

### Games (Exercises)
- AI-generated educational exercises tailored to each kid's profile
- Games are generated as executable code (HTML/CSS/JS) and run in a **sandboxed iframe**
- Dodi interactively guides kids through the game creation process
- Games have standardized metadata for categorization, filtering, and browsing
- Previously created games can be replayed and shared

### Profiles & Personalization
- Each parent account can have multiple kid profiles
- Each profile stores: birthdate, avatar config, language, UI preferences
- A separate **memory dossier** (markdown text) captures what the AI companion has learned about the kid — challenges, strengths, interests, learning style, and emotional patterns
- Memory is **profile-level** (shared across personas) — when a parent switches the kid's companion from playful Dodi to studious Dodi, all learned knowledge transfers. Persona attribution is embedded in the markup ("First noted by [persona_name@persona_id]") rather than in a separate table
- The companion progressively updates the memory dossier after meaningful interactions
- A separate **parent notes** field (markdown text) allows parents to provide context the AI reads but does not modify (e.g., "she's going through a tough time at school this week")
- AI interactions use both memory + parent notes as a briefing document before each session
- Parents can view and edit all stored profile data (including the AI memory) at any time

---

## User Roles & Flows

### Parent
- Registers via email/password
- Manages account settings, kid profiles, and API keys
- Switches between **Configuration View** (parent-facing) and **App View** (kid-facing)
- Configuration View can only be accessed with a defined PIN code
- Creates and manages Dodi personalities (markup text documents)
- Assigns active dodi persona per kid profile
- Configures AI providers, model selection, and voice settings
- Views and edits all stored kid data (memory, preferences, game history)

### Kid
- Interacts with Dodi via text or voice (switchable)
- Voice is the primary mode for younger kids (pre-readers)
- Browses and plays previously created games
- Creates new games with Dodi's guidance
- Can share games and add friends via name tags / QR codes

---

## Feature Requirements

### F1: Authentication & Account Management
- **F1.1**: Parent registration via email/password (email mandatory on hosted)
- **F1.2**: Session management with secure token handling
- **F1.3**: Password reset flow
- **F1.4**: Account deletion with full data removal
- **F1.5**: Portable vault root (`nsec`) + public account id (`npub`) — see [NOSTR_PROJECT.md](./NOSTR_PROJECT.md)
- **F1.6**: Encrypted account export/import for self-host — see [NOSTR_PROJECT.md](./NOSTR_PROJECT.md)

### F2: Profile Management
- **F2.1**: Create multiple kid profiles per account
- **F2.2**: Each profile has: display name, birthdate, avatar/theme, unique name tag
- **F2.3**: Profile-specific AI memory dossier (markdown, auto-maintained by companion, editable by parents)
- **F2.4**: Profile-specific Dodi persona assignment
- **F2.5**: Profile switching from the parent configuration view
- **F2.6**: Profile-specific parent notes (markdown, parent-authored context that AI reads but does not modify)

### F3: Dodi Companion
- **F3.1**: Animated SVG/Lottie mascot with multiple states (idle, talking, happy, thinking, celebrating)
- **F3.2**: Text-based chat interaction
- **F3.3**: Voice-based interaction using AI provider native voice/live APIs
- **F3.4**: Toggle between text and voice mode
- **F3.5**: Configurable persona as editable markup text
- **F3.6**: Multiple persona presets — parents can create, edit, and assign per profile
- **F3.7**: Persona markup includes instructions for information-gathering behavior
- **F3.8**: Initial onboarding conversation to understand the kid's needs and preferences
- **F3.9**: Age-adaptive tone and complexity (based on kid's birthdate)
- **F3.10**: Dodi appearance customization by kids (colors, accessories, themes)
- **F3.11**: Progressive memory building — companion updates the profile memory dossier after meaningful interactions
- **F3.12**: Memory-aware context — companion reads memory + parent notes as briefing before each session
- **F3.13**: Dodi connection states — four clear states with corresponding avatars:

  | State | Description | Avatar (full / head) |
  |---|---|---|
  | **Disconnected** (Sleep) | No WebSocket connection | `dodi-sleep.png` / `dodi-head-sleep.png` |
  | **Connecting** | WebSocket connecting (show sleep avatar) | `dodi-sleep.png` / `dodi-head-sleep.png` |
  | **Connected Active** | Full bidirectional voice — mic on, audio playing | `dodi-active.png` / `dodi-head-active.png` |
  | **Connected Deaf** | Connected but no voice I/O — mic off, audio muted | `dodi-deaf.png` / `dodi-head-deaf.png` |

  **Default page load**: Auto-connect → if AudioContext runs without gesture → Active; if gesture needed → Deaf (`gestureNeeded` flag). Any page click activates when `gestureNeeded` is true (without blocking navigation).

  **Avatar click**: Disconnected → reconnect; Connecting → no-op; Active → Deaf (mute); Deaf → Active (unmute).

  **Deaf mode rules**: No mic audio forwarded to AI. Incoming audio chunks dropped. Greeting deferred until first activation. Socket handling is per-provider (`voiceSocketStrategy`): Gemini keeps the WebSocket alive; xAI runs a two-socket pipeline (active/head + one warm, never-audio standby — xAI bills any socket that ever carried audio for its whole open lifetime, while silenced-from-birth sockets are free): deafening closes the tainted active socket and warms a replacement secondary, re-activation promotes the standby instantly with a conversation recap for continuity.

### F4: AI Provider Configuration
- **F4.1**: Parents enter API keys for supported providers
- **F4.2**: Supported providers: **Gemini, ChatGPT (OpenAI), Claude (Anthropic), Grok (xAI)**
- **F4.3**: Select which model powers Dodi (voice-capable models only)
- **F4.4**: Select which model is used for game generation
- **F4.5**: API key validation on entry
- **F4.6**: Secure storage of API keys (encrypted at rest)

### F5: Game System
- **F5.1**: AI-generated games as executable code (HTML/CSS/JS)
- **F5.2**: Sandboxed iframe execution with restricted permissions
- **F5.3**: Dodi-guided interactive game creation flow
- **F5.4**: Standardized game metadata:
  - Title, description
  - Subject/topic (math, language, science, creativity, etc.)
  - Difficulty level
  - Target age range
  - Estimated duration
  - Tags/categories
- **F5.5**: Game library with browsing, filtering, and search
- **F5.6**: Replay previously created games
- **F5.7**: Game sharing with friends (opt-in, per game)
- **F5.8**: Game favoriting/rating

### F6: Social Features
- **F6.1**: Unique name tag per profile (human-readable identifier)
- **F6.2**: QR code generation encoding the name tag
- **F6.3**: Add friends by scanning QR code or entering name tag
- **F6.4**: Default privacy: all content is private
- **F6.5**: Explicit opt-in sharing per game or content item
- **F6.6**: Friends list management (add, remove, block)

### F7: Schedule / Timetable
- **F7.1**: Weekly view showing all 7 days with hourly slots
- **F7.2**: Current day highlighted
- **F7.3**: Horizontal time indicator showing current time
- **F7.4**: Kids can assign activities per slot (text or emoji selection)
- **F7.5**: Activity emoji picker (running, reading, music, sports, sleep, etc.)
- **F7.6**: Persistent across sessions

### F8: Parent Configuration View
- **F8.1**: Toggle between config view and kid app view
- **F8.2**: Dashboard overview of all kid profiles
- **F8.3**: Edit kid memory dossier and parent notes
- **F8.4**: Manage Dodi personalities
- **F8.5**: AI provider and model configuration
- **F8.6**: View game history and activity per profile
- **F8.7**: Privacy and sharing controls
- **F8.8**: Account and billing management (future)

### F9: Progressive Web App
- **F9.1**: Installable on desktop and mobile (manifest + service worker)
- **F9.2**: Offline support for cached games and schedule
- **F9.3**: Push notifications (optional, for reminders/schedules)
- **F9.4**: Responsive design optimized for tablets (primary kid device)
- **F9.5**: Architecture portable to native iOS/Android (React Native / Capacitor in future)

---

## Design / UI Rules
- Page layouts should be optimized for Mobile (Tablet and Phone) and PC, depending on screen resolution.
- All buttons or links should have the cursor: pointer value.

## Technical Architecture

### Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 15 (App Router) + React 19 | SSR/SSG, excellent ecosystem, Vercel-native |
| **Styling** | Tailwind CSS + shadcn/ui | Rapid UI development, consistent design system |
| **State** | Zustand or Jotai | Lightweight, no boilerplate |
| **Animation** | Lottie (lottie-react) | Rich character animation, performant |
| **Backend** | Supabase | Auth, PostgreSQL, Realtime, Storage, Row-Level Security |
| **AI Integration** | Multi-provider SDK abstraction | Unified interface over Gemini, OpenAI, Anthropic, xAI APIs |
| **Voice** | AI provider native TTS/STT + Live APIs | Smooth conversational voice, provider-dependent |
| **Deployment** | Vercel | Native Next.js support, edge functions, CI/CD |
| **i18n** | next-intl or next-i18next | Type-safe translations, SSR-compatible |
| **Testing** | Vitest + Playwright | Unit + E2E coverage |

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Vercel Edge                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Next.js App (App Router)             │   │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────┐  │   │
│  │  │ Kid View   │  │Config View │  │ API Routes│  │   │
│  │  │ (Dodi UI)  │  │ (Parent)   │  │ (BFF)     │  │   │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │   │
│  │        │               │               │         │   │
│  │  ┌─────┴───────────────┴───────────────┴─────┐   │   │
│  │  │          Shared Services Layer             │   │   │
│  │  │  ┌─────────┐ ┌──────────┐ ┌───────────┐   │   │   │
│  │  │  │AI Router│ │Game Exec │ │Voice Mgr  │   │   │   │
│  │  │  └────┬────┘ └────┬─────┘ └─────┬─────┘   │   │   │
│  │  └───────┼───────────┼─────────────┼──────────┘   │   │
│  └──────────┼───────────┼─────────────┼──────────────┘   │
│             │           │             │                   │
└─────────────┼───────────┼─────────────┼───────────────────┘
              │           │             │
   ┌──────────┴──┐  ┌────┴────┐  ┌────┴─────────┐
   │ AI Providers│  │Sandboxed│  │AI Voice/Live │
   │ (Gemini,    │  │ iframe  │  │    APIs       │
   │  OpenAI,    │  │ (Games) │  │              │
   │  Claude,    │  └─────────┘  └──────────────┘
   │  Grok)      │
   └─────────────┘
              │
   ┌──────────┴──────────────────────┐
   │         Supabase                │
   │  ┌──────┐ ┌─────┐ ┌─────────┐  │
   │  │ Auth │ │ DB  │ │ Storage │  │
   │  │      │ │(PG) │ │ (Games) │  │
   │  └──────┘ └─────┘ └─────────┘  │
   │  Row-Level Security + Encryption│
   └─────────────────────────────────┘
```

### Database Schema (Conceptual)

Defined in platform/supabase/migrations/20260613120000_baseline.sql

### Memory Document Format

The profile `memory` field is a markdown dossier that the AI companion reads as a briefing document and updates as a journal. The recommended structure:

```markdown
## Challenges
- Struggles with fraction division — confuses numerator/denominator
  roles. Observed across 4 sessions, most recently [date].
- Gets frustrated with multi-step word problems (3+ steps).

## Strengths
- Excellent spatial reasoning — solves geometry puzzles quickly.
- Strong reading comprehension for age. (First noted by Explorer
  Dodi, confirmed across 12+ sessions)

## Interests
- Dinosaurs (deep, persistent interest — always engages)
- Space exploration (moderate, comes and goes)
- Minecraft (effective as a teaching metaphor)

## Learning Style
- Responds best to visual explanations and analogies
- Challenge-driven: "can you figure out..." works better than
  direct instruction
- Needs 2-3 warm-up exchanges before focusing

## Emotional Patterns
- Frustration trigger: being corrected 2+ times on the same
  concept. Recovery: switch topic briefly, return later.
- Gets excited discussing interests — good entry point for
  new topics.

## Recent Updates
- [date]: Showed improvement in multiplication tables (7s and 8s)
- [date]: New interest in volcanoes after science video
```

This structure is a guideline, not enforced — the AI adapts the format as needed. Key design properties:

- **Confidence** is expressed as frequency/recency ("observed across 4 sessions") — not numeric scores
- **Attribution** is inline ("First noted by Explorer Dodi") — not in a separate table
- **Temporality** is narrative ("most recently Feb 28", "comes and goes") — not timestamp columns
- **Actionable context** is embedded ("effective as a teaching metaphor") — not metadata flags
- **Changelog** is a rotating `## Recent Updates` section — not an audit table

The persona's `soul` document can include instructions on how the companion should observe and record to this dossier.

### Game Sandboxing

AI-generated games run in a strictly sandboxed iframe:

```html
<iframe
  sandbox="allow-scripts"
  referrerpolicy="no-referrer"
  csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
  srcdoc="<!-- AI-generated game HTML -->"
/>
```

- **No** `allow-same-origin` — prevents access to parent page storage/cookies
- **No** network access — `default-src 'none'` blocks all external requests
- Communication with parent via `postMessage` for score reporting and game completion
- Game code is validated/sanitized before injection
- A standardized game API is injected that handles:
  - Score reporting
  - Completion signals
  - Difficulty adjustment callbacks
  - Asset access (images, sounds from a pre-approved set)

---

## Data Privacy & Security

### Principles
1. **Privacy by default** — all content is private unless explicitly shared
2. **Parental control** — parents can see, edit, and delete all stored data
3. **Minimal data collection** — only store what's needed for personalization
4. **E2EE End-To-End Client-Side Encryption** — sensitive fields quantum secure, end-to-end encrypted (E2EE)
5. **COPPA/GDPR-K awareness** — designed with children's privacy regulations in mind

---

## Internationalization

### Languages
- **English** (default)
- **German**

### Approach
- Static UI elements (buttons, labels, navigation) use i18n framework (next-intl)
- Dodi's conversational language adapts based on the kid's profile language setting
- Game content is generated in the profile's language by the AI
- AI prompts include language instructions derived from profile settings
- Architecture supports adding new languages by adding translation files

---

## Monetization Strategy

### Architecture: Freemium SaaS Tiers

| Feature | Free Tier | Premium Tier |
|---------|-----------|-------------|
| Kid profiles | Up to 2 | Unlimited |
| Stored games | Up to 20 | Unlimited |
| Game sharing | Limited | Unlimited |
| Dodi personalities | 1 custom | Unlimited |
| Cloud backup | None | Included |
| Priority support | — | Included |

### Implementation Notes
- `subscription_tier` field on accounts from day one
- Feature gates checked via middleware/hooks
- Stripe integration for payment processing (future)
- Usage tracking for games created, storage used
- Architecture supports adding managed AI provider tier later (parents wouldn't need their own API keys)

---

## Scope

The MVP focuses on delivering a functional, delightful core experience:

### Phase 1: Foundation
- [x] Project setup (Next.js, Supabase, Tailwind, CI/CD)
- [x] Landing page
- [x] Authentication (email/password)
- [x] Account and profile management
- [x] Parent configuration view (basic)
- [x] Responsive layout with parent/kid view toggle

### Phase 2: Dodi Companion
- [x] AI provider configuration (API keys, model selection)
- [x] Multi-provider AI abstraction layer
- [x] Voice interaction (AI provider native TTS/STT)
- [x] Dodi persona system (create, edit, assign)
- [x] Profile memory system (auto-update from conversations).
- [x] Dodi connection states: Disconnected (Sleep), Connecting, Active, Deaf — with avatar images and click behaviors (see F3.13)

### Phase 3: Games
- [x] AI game generation pipeline
- [x] Sandboxed game execution
- [x] Game metadata and categorization
- [x] Built-in default game: Drawing
- [x] Game library (browse, filter, replay)

### Phase 4: Socialsharing
- [x] Unify date storage (UTC in db) and conversion to local time
- [x] Configure date time format
- [x] Name tags and QR code generation
- [x] Friend system (add, accept, manage)
- [x] Drawing game: Let the kid save drawings and share them with friends

### Phase 5: Polish & PWA
- [ ] PWA manifest + service worker
- [ ] Offline game caching
- [ ] Dodi appearance customization
- [ ] Onboarding tutorial
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Before initially deploying the DB to supabase, merge all migrations into a single schema to avoid unnecessary migration steps.

---

## Future Roadmap

- **Nostr foundation + account export**: `nsec` vault root, `npub` on accounts, encrypted export/import for self-host
- **Native apps**: Port to iOS/Android via React Native or Capacitor
- **Managed AI**: Offer built-in AI so parents don't need API keys
- **Game marketplace (dodi Discover)**: Kids share and discover games from the community (later: optional Nostr discovery bus)
- **Curriculum alignment**: Map games to educational standards
- **Institutional accounts**: Schools and tutoring centers
- **Advanced analytics**: Learning progress dashboards for parents
- **Multiplayer games**: Real-time collaborative or competitive games between friends
- **Parental insights**: AI-generated summaries of learning progress and recommendations
- **Kid schedule**: Manages a personal weekly schedule/timetable
- **Daily challenges**: E.g. Complete 2 math games, 1 reading games

## Progress & Success System

Games report a standardized progress/success signal so Dodi can tell when a child meets a
parent-defined goal — and, in future, generate challenges like "Solve 3 math games".

- **Game kinds** (`games.progress_kind`): `goal` (measurable objective) or `open` (free/creative play).
- **Parent input**: a plain-language **learning goal** + optional **success definition** (e.g. *"3
  calculations solved without asking Dodi, under 5 seconds each"*), entered in the parent Game Studio.
- **AI mapping**: the success definition is mapped onto a structured `success_criteria` object (jsonb)
  over a fixed **metric vocabulary** (`correct`, `incorrect`, `attempts`, `accuracy`, `streak`,
  `score`, `hintsUsed`, `itemsCompleted`, `itemsTotal`, `elapsedMs`, `maxTaskMs`, `avgTaskMs`).
  See `src/lib/games/success.ts`.
- **Game protocol**: goal games report `state.dodi = { progressKind, progress, metrics }` and emit a
  `game:progress` bridge message; the goal is delivered at `dodi:init` and the host sends `dodi:success`
  on completion (`src/lib/games/bridge-protocol.ts`).
- **Host-side evaluation**: the app merges game-reported metrics with the host-observed "asking Dodi"
  count (→ `hintsUsed`) and evaluates the stored criteria; "without asking Dodi" is a host signal.
- **Persistence**: each play is recorded in `game_plays` (subject denormalized, `succeeded`,
  `final_progress`, `metrics`). This is the substrate for challenges: *"Solve 3 math games today"* =
  `countSucceededPlays({ profileId, subject: 'math', sinceDays: 1 })` (`src/lib/services/game-plays.ts`).

## TODO

- Allow offline game play
- Translate landing routes (e.g. /ueber-uns, /kostenlose-lernspiele-fuer-kinder)
- SEO optimized game lists for landing sub-pages (static generation) with links to app
- Soft registration locks (Snapshot, Remix, etc.)

- Create public page for published games
 - Allow to embedd games.
 - Soft registration locks (Snapshot, Remix, etc.)
 - SEO optimized game lists for landing sub-pages (static generation) with links to app

- Optimize game-state update as every push costs 0.004 USD with grok voice

- Make game code creation progress more transparent (output rough agent loop actions in chat)
- Implement Venice.ai

- Account Export/import:parent can download their encrypted data and restore it on a
   self-hosted instance, continuing with the same vault via `nsec`. This also makes us automatically GDPR compliant in the EU.

- Game store for parents (dodi Discover)
 - [ ] Admin approval UI (`approved_by = 'admin'`)
 - [ ] Report inappropriate content system
 - [ ] Review the preview image too (vision pass) — v1 reviews text + code only

- Kid/Parent: Currently snapshots are loaded interactively. Create a new snapshot viewer which can be used in parent and kid view which opens the game in a modal window and locks interactions (no-auto save etc.). Add "Continue" button + voice commands in kid view.

- Restrict publication for paid subscribers (plan-driven `monthly_game_publication_limit`)

- Memory / transcripts (implemented foundation):
- Add 3 transcript logging tiers: basic, advanced, full and change pricing wording to:
  - Basic: 1 month
  - Advanced: 6 months
  - Full: Unlimited


- Credit balances

- Check: Prettier is currently broken repo-wide (.prettierrc wants prettier-plugin-tailwindcss, which isn't installed — pre-existing, I formatted my files with equivalent settings)



- Configure Voice (Provider/Style) per persona

 - Add new provider category for joke telling
  - if set and kid asks for a joke provider is called to fetch a joke which voice should read. (Google Voice is really bad at telling jokes, so we could ask ChatGPT who is quite good ad joking)
 
 - Add pricing
  - Add to landing page and onboarding flow
  - Track token usage
  - Add "Usage & cost" item under "Activity" in parent view where we want to display token usage over time and cost including summary per month etc. 

- Onboarding wizard (Password, Seed phrase, PIN (skipable))

- Daily challenges UI: let Dodi generate + track challenges on top of `game_plays` (foundation is in place).
- Allow games to connect with AI provider for in-game content generation (e.g. for texts, calculations, formulas etc.)

- Enhance usage reporting
 - For dodiAI only display numbers pulled from providers (derive voice usage by pulling costs and divide by unit costs)

- Investigate sessionResumption for google voice

- New system games:
  - Reading: Generate short stories, let kid read the text, then ask questions about the text.
  - Writing / Reading: Divide generated sentences into text blocks which are randomly laid out. Kid must put the blocks into correct order and read the sentence.
  - Math tower: Dodi must climb a tower, tower is sinking into water, kid must solve calculation to jump to upper floor, before water reaches the current floor. 10 calculations per level, each level creates harder calculations. At the top, dodi reaches a hot air ballon where she can jump in and fly away. E.g.:
    - Level 1: Addition, 2 numbers, range of numbers <= 10
    - Level 2: Subtraction, 2 numbers, range of numbers <= 10
    - Level 3: Addition, 2 numbers, range of numbers <= 20
    - Level 4: Subtraction, 2 numbers, range of numbers <= 20
    - Level 5: Addition, 3 numbers, range of numbers <= 20
    - Level 6: Subtraction, 3 numbers, range of numbers <= 20
    - Level 7: Mixed, 3 numbers, range of numbers <= 20


- Connect dodi-bot for
  - Enhanced transcript storage & learning capabilities (e.g. full transcript storage + periodic memory analysis / update)
  - Periodic (e.g. daily) challenge creation

Notifications:
- Game agent finished

Security:
- Add captchas to registration / login / pw-reset
- Check CSRF safety
- Check sql injection vector
- In production DB/system errors should never be displayed to the users. Only generic errors should be displayed in prodouction.
