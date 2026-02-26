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
- Configurable personality stored as editable markup text (per kid profile)
- Adapts language, tone, and complexity based on the kid's age (derived from birthdate)
- Kids can customize Dodi's appearance (colors, accessories, themes — e.g., superhero Dodi, pirate Dodi)

### Games (Exercises)
- AI-generated educational exercises tailored to each kid's profile
- Games are generated as executable code (HTML/CSS/JS) and run in a **sandboxed iframe**
- Dodi interactively guides kids through the game creation process
- Games have standardized metadata for categorization, filtering, and browsing
- Previously created games can be replayed and shared

### Profiles & Personalization
- Each parent account can have multiple kid profiles
- Each profile stores: birthdate, preferences, skill levels, learning goals
- A separate **memory** document (markup text) captures what Dodi has learned about the kid
- AI interactions progressively build this memory to improve personalization
- Parents can view and edit all stored profile data at any time

---

## User Roles & Flows

### Parent
- Registers via email/password or Google Auth
- Manages account settings, kid profiles, and API keys
- Switches between **Configuration View** (parent-facing) and **App View** (kid-facing)
- Creates and manages Dodi personalities (markup text documents)
- Assigns active personality per kid profile
- Configures AI providers, model selection, and voice settings
- Views and edits all stored kid data (memory, preferences, game history)

### Kid
- Interacts with Dodi via text or voice (switchable)
- Voice is the primary mode for younger kids (pre-readers)
- Browses and plays previously created games
- Creates new games with Dodi's guidance
- Manages a personal weekly schedule/timetable
- Can share games and add friends via name tags / QR codes

---

## Feature Requirements

### F1: Authentication & Account Management
- **F1.1**: Parent registration via email/password
- **F1.2**: Parent registration/login via Google OAuth
- **F1.3**: Session management with secure token handling
- **F1.4**: Password reset flow
- **F1.5**: Account deletion with full data removal

### F2: Profile Management
- **F2.1**: Create multiple kid profiles per account
- **F2.2**: Each profile has: display name, birthdate, avatar/theme, unique name tag
- **F2.3**: Profile-specific memory (markup text, editable by parents)
- **F2.4**: Profile-specific Dodi personality assignment
- **F2.5**: Profile switching from the parent configuration view

### F3: Dodi Companion
- **F3.1**: Animated SVG/Lottie mascot with multiple states (idle, talking, happy, thinking, celebrating)
- **F3.2**: Text-based chat interaction
- **F3.3**: Voice-based interaction using AI provider native voice/live APIs
- **F3.4**: Toggle between text and voice mode
- **F3.5**: Configurable personality as editable markup text
- **F3.6**: Multiple personality presets — parents can create, edit, and assign per profile
- **F3.7**: Personality markup includes instructions for information-gathering behavior
- **F3.8**: Initial onboarding conversation to understand the kid's needs and preferences
- **F3.9**: Age-adaptive tone and complexity (based on kid's birthdate)
- **F3.10**: Dodi appearance customization by kids (colors, accessories, themes)

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
- **F8.3**: Edit kid memory documents
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

```
accounts
├── id (uuid, PK)
├── email
├── encrypted_api_keys (jsonb, encrypted)
├── model_config (jsonb) — voice model, game model per provider
├── subscription_tier (enum: free, premium, ...)
├── created_at, updated_at

profiles (kid profiles)
├── id (uuid, PK)
├── account_id (FK → accounts)
├── display_name
├── name_tag (unique, human-readable)
├── birthdate (encrypted)
├── avatar_config (jsonb) — Dodi customization
├── active_personality_id (FK → personalities)
├── memory (text, encrypted) — markup doc of what Dodi knows
├── preferences (jsonb)
├── created_at, updated_at

personalities (Dodi personality presets)
├── id (uuid, PK)
├── account_id (FK → accounts)
├── name
├── content (text) — markup personality definition
├── created_at, updated_at

games
├── id (uuid, PK)
├── profile_id (FK → profiles) — creator
├── title, description
├── subject, difficulty, target_age_range
├── tags (text[])
├── estimated_duration
├── code_bundle (text or storage ref) — the generated game code
├── metadata (jsonb)
├── is_shared (boolean, default false)
├── created_at, updated_at

friends
├── profile_id (FK → profiles)
├── friend_profile_id (FK → profiles)
├── status (enum: pending, accepted, blocked)
├── created_at

shared_games
├── game_id (FK → games)
├── shared_with_profile_id (FK → profiles)
├── shared_at

schedules
├── id (uuid, PK)
├── profile_id (FK → profiles)
├── day_of_week (int, 0-6)
├── hour (int, 0-23)
├── activity_label (text)
├── activity_emoji (text)
├── updated_at

conversations (chat history with Dodi)
├── id (uuid, PK)
├── profile_id (FK → profiles)
├── messages (jsonb[]) — role, content, timestamp
├── context (text) — summarized context for AI
├── created_at, updated_at
```

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
4. **Encryption at rest** — sensitive fields encrypted server-side
5. **COPPA/GDPR-K awareness** — designed with children's privacy regulations in mind

### MVP Approach: Server-Side Encryption
- Sensitive profile data (birthdate, memory, preferences) encrypted at rest in Supabase
- Supabase Row-Level Security (RLS) ensures accounts can only access their own data
- API keys encrypted with a per-account key before storage
- AI memory data is only decrypted and sent to AI providers when needed (game creation, Dodi interaction)
- All API calls to AI providers go through server-side API routes (never expose keys to client)

### Future Enhancement: Local-First Option
- Opt-in feature: store kid memory/profile data locally (IndexedDB) with client-side encryption
- Encrypted blobs can be backed up to server for cross-device sync
- Parents hold the encryption passphrase
- Trade-off: data loss risk if browser cleared without backup

### API Key Security
- API keys are never exposed to the client browser
- All AI API calls are proxied through Next.js API routes / server actions
- Keys are encrypted at rest in the database
- Keys are decrypted in memory only during API calls on the server

---

## Internationalization

### MVP Languages
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

## MVP Scope

The MVP focuses on delivering a functional, delightful core experience:

### Phase 1: Foundation
- [x] Project setup (Next.js, Supabase, Tailwind, CI/CD)
- [ ] Authentication (email/password + Google OAuth)
- [ ] Account and profile management
- [ ] Parent configuration view (basic)
- [ ] Responsive layout with parent/kid view toggle

### Phase 2: Dodi Companion
- [ ] Animated Dodi mascot (Lottie, core states)
- [ ] Text-based chat with Dodi
- [ ] AI provider configuration (API keys, model selection)
- [ ] Multi-provider AI abstraction layer
- [ ] Dodi personality system (create, edit, assign)
- [ ] Profile memory system (auto-update from conversations)
- [ ] Onboarding conversation flow

### Phase 3: Voice & Games
- [ ] Voice interaction (AI provider native TTS/STT)
- [ ] Voice/text mode toggle
- [ ] AI game generation pipeline
- [ ] Sandboxed game execution
- [ ] Game metadata and categorization
- [ ] Game library (browse, filter, replay)

### Phase 4: Social & Schedule
- [ ] Name tags and QR code generation
- [ ] Friend system (add, accept, manage)
- [ ] Game sharing
- [ ] Weekly schedule/timetable view
- [ ] Activity emoji picker

### Phase 5: Polish & PWA
- [ ] PWA manifest + service worker
- [ ] Offline game caching
- [ ] Dodi appearance customization
- [ ] Onboarding tutorial
- [ ] Performance optimization
- [ ] Accessibility audit

---

## Future Roadmap

- **Native apps**: Port to iOS/Android via React Native or Capacitor
- **Local-first storage**: Opt-in encrypted local storage with cloud backup
- **Managed AI**: Offer built-in AI so parents don't need API keys
- **Game marketplace**: Kids share and discover games from the community
- **Curriculum alignment**: Map games to educational standards
- **Institutional accounts**: Schools and tutoring centers
- **Advanced analytics**: Learning progress dashboards for parents
- **Multiplayer games**: Real-time collaborative or competitive games between friends
- **Parental insights**: AI-generated summaries of learning progress and recommendations
