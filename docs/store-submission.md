# Store submission: Google Play and the App Store

What the store listings need, where each requirement lives in the code, and
what is still open. The legal texts live on the marketing site
(`dodi-com/landing/content/legal/*.md`, operator details in
`dodi-com/landing/src/lib/legal.ts`).

## URLs for the store consoles

| Field | URL |
|---|---|
| Privacy policy (both stores) | https://www.dodi.app/privacy (German: /de/datenschutz) |
| Terms of service / EULA (App Store "License Agreement", optional) | https://www.dodi.app/terms |
| Account deletion URL (Play Console, Data safety) | https://www.dodi.app/delete-account |
| Imprint / contact | https://www.dodi.app/imprint, team@dodi.app |
| Marketing / support URL | https://www.dodi.app |

## Requirements and where they are met

| Requirement | Store rule | Where |
|---|---|---|
| Privacy policy linked in the app | Apple 5.1.1(i), Play User Data | Settings > General > Legal; sign-in screens (footer); registration consent |
| Explicit permission before personal data goes to a third-party AI | Apple 5.1.2(i) | required checkbox in "Add provider" (`ai-sharing-consent.tsx`, web + mobile; also on "Turn on dodi AI" once dodi AI is offered) |
| Adult account holder, terms accepted | own terms, Gemini API terms | required checkbox on registration (`validateRegistration` → `termsRequired`) |
| In-app account deletion | Apple 5.1.1(v), Play account deletion | Settings > General > Delete account → `DELETE /api/account` (password re-check), then "Delete my profile" on the "no account" screen (or the profile page from the email at the foot of the menu) → `DELETE /api/me` |
| Web resource for deletion | Play account deletion | /delete-account (steps, email route, what is deleted and kept) |
| Report offensive AI content in the app | Play AI-generated content | "Give feedback" at the foot of the parent menu (category "Inappropriate content"), and "Report this game" on Discover games (opens the same dialog with that category and the game attached) → `POST /api/feedback`, stored in `feedback_messages`, emailed to `SYSTEM_NOTIFICATION_EMAIL` and handled in the ops console's Feedback inbox |
| Report and moderate user-generated content | Apple 1.2 | Discover games: AI security review before publishing, "Report this game", and the operator takes a live game down with `POST /api/internal/publications/{id}/reject` (ops console or curl with the platform `x-ops-secret`; it now also works on live games). Incoming friend requests need a parent's approval, and friends can be removed |
| Published contact information | Apple 1.2, Austrian ECG | /imprint |

## Before the first submission

1. **Operator details** in `dodi-com/landing/src/lib/legal.ts`: `city`
   (place of residence, required by MedienG § 25) and `hostingLocation` are
   filled in (2026-10-20). Unset, the imprint and privacy policy show
   "[to be added]" and the build prints a warning.
   `street`, `register` and `vatId` are left out while unset; they become
   mandatory once dodi is run commercially (ECG § 5: geographic address), and
   Google Play shows a physical address for monetized apps. If Hiveport GmbH is
   founded first, switch `name` too.
2. **Have a lawyer review** the terms and privacy policy, in particular the
   withdrawal-right wording for credits, the Gemini clause and, if you target
   the US, COPPA (verifiable parental consent).
3. **Data processing agreements** (Art. 28 GDPR), as the privacy policy says
   they exist: Hetzner, Vercel, Resend, Cloudflare, plus the provider behind
   the publication security agent.
4. **Production platform:** apply the migrations
   `20261008120000_snapshots_sender_kid_cascade.sql`,
   `20261008130000_content_reports.sql`,
   `20261016100000_feedback_messages.sql` (which carries the reports over) and
   `20261016110000_feedback_message_images.sql` (the optional image), then
   make sure `SYSTEM_NOTIFICATION_EMAIL` is set (feedback is emailed
   there) and that team@dodi.app receives mail (deletion requests go there).
5. **Deploy the landing site** so every URL above resolves.

## Reviewer account (both stores)

A companion that cannot talk gets rejected as broken, so the review account
needs working AI. The open beta has no dodi AI, so it runs on a key of ours:

1. Register in the production app with an address you control, confirm the
   emailed code, and store the account key (nsec) in the password manager.
2. Add a kid profile (for example "Mia", age 7).
3. Create a dedicated API key at xAI (voice + game creation in one key) with a
   low spending limit, and add it under Settings > AI providers (tick the
   consent). Don't use a Gemini key (see "Open decisions"). Revoke the key
   after review.
4. Parent PIN: leave it unset, or set it and put it in the review notes.
5. Review notes: email + password; "the app is used by a parent, who opens
   Kid View for the child; tap the companion and allow the microphone to talk";
   where Delete account and Give feedback are; that AI answers come from
   third-party providers; that the app sells nothing in-app. The App Store
   text is under "App Store listing text" below.

## Google Play Console

- **Target audience:** children use the companion, so declare the child age
  groups honestly; the Families policy then applies. It forbids APIs and SDKs
  that are not approved for child-directed services. Gemini's API terms
  exclude services likely used by under-18s (see "Open decisions").
- **Data safety:** declare email (account), audio (voice, sent to the chosen
  AI provider), app activity and app interactions (play records, usage),
  diagnostics (error reports), and user-generated content (games, reports).
  Encrypted in transit: yes. Deletion: yes, in app and at the URL above.
- **App access:** the reviewer account above.
- **Permissions:** microphone (voice companion), camera (friend QR codes,
  Game Studio photos). `SYSTEM_ALERT_WINDOW` and the install-referrer
  permission are blocked in `app.config.ts`. The merged manifest also contains
  `com.google.android.c2dm.permission.RECEIVE` (expo-notifications); remote
  push is not used, so consider blocking it after testing local notifications.
  No `AD_ID` permission is declared; keep it that way.
- **Ads:** none.

## App Store Connect

- **Category:** Education. Do not choose the Kids Category: it forbids sending
  personal information to third parties, and the companion sends a child's
  voice to the AI provider. Outside the Kids Category, guideline 2.3.8 does not
  allow "for kids" wording in the name, subtitle or screenshots, so present
  the listing to parents ("for families").
- **App Privacy:** same data types as the Play Data safety form; none used for
  tracking.
- **Age rating:** answer the questionnaire for user-generated content
  (Discover) and AI-generated content.
- **Export compliance:** the app uses non-exempt encryption (its E2EE, standard
  algorithms), but `ITSAppUsesNonExemptEncryption` is deliberately left out of
  `app.config.ts`: set to `true` without the `ITSEncryptionExportComplianceCode`
  that App Store Connect issues for approved encryption documentation, Apple
  drops the build during processing (ITMS-90592, build 2 on 2026-10-19). Each
  build therefore shows "Missing Compliance" in TestFlight; answer: uses
  encryption, standard algorithms, not available in France. To skip the
  per-build questions, file the encryption documentation in App Store Connect
  and put both keys in `ios.infoPlist`. The US annual self-classification
  report applies either way.
- **Payments:** the app sells nothing today. If credits become purchasable in
  the iOS app, that must use In-App Purchase (guideline 3.1.1).
- **EU trader status (DSA):** declared **not a trader** (2026-10-20): dodi runs
  as a hobby project with no paid plans, so the EU product page shows no
  address or phone number. Switch to trader (address, phone and email go on
  the EU product page) before anything is sold, whether paid plans, dodi AI
  credits or a company running the app.
- **Icon:** `assets/images/icon.png` is 512×512 and Expo scales it to the
  1024×1024 store icon. There is no larger source of the colored icon
  (`assets/reference/dodi_icon.svg` is the black line drawing); export a
  1024 version from the original artwork when it is redrawn.

### App Store listing text

Metadata outside the Kids Category must not say "for kids" or "for
children" (guideline 2.3.8), so the text speaks to parents. Field limits:
name and subtitle 30 characters, promotional text 170, keywords 100.

- **Name:** dodi: AI learning app
- **Subtitle:** Learning games for families
- **Promotional text:** Talk, play and build learning games together. You
  choose the AI provider, personal data is end-to-end encrypted, and there are
  no ads.
- **Keywords:** `education,game maker,tutor,homework,family,parents,voice,companion,math,reading,school,open source`
  (the words of the name are indexed already)
- **Support URL / marketing URL:** https://www.dodi.app
- **Privacy policy URL:** https://www.dodi.app/privacy
- **Copyright:** 2026 Alexander Birke

**Description:**

```text
Meet dodi, an AI learning companion your family talks and plays with. It gets to know each child and helps you invent learning games made just for them.

TALK AND PLAY
Your child simply talks, and dodi listens, chats back and turns curiosity into play. No keyboard, no menus full of buttons. A friendly 3D companion greets your child on the home screen.

LEARNS ALONG THE WAY
After every chat, dodi updates what it knows and gently adapts to your child's pace and language. Everything it remembers is written in plain language, so parents can read, edit or erase it at any time.

BUILD YOUR OWN LEARNING GAMES
In Game Studio, describe a game idea or photograph a worksheet, and dodi builds a playable learning game. Find more games in Discover, where every published game passes a safety review first, and share snapshots of game moments with friends.

PARENTS STAY IN CHARGE
Parents create the profiles, approve friend requests, see activities and usage, and choose the AI provider. The parent area can be locked with a PIN.

PRIVACY BY DESIGN
• Profiles, memories and your family's games are end-to-end encrypted on your device before they are stored
• Bring your own AI: conversations go from the device straight to the provider you chose, never through our servers
• No ads, no tracking, nothing for sale
• Open source: anyone can read and audit the code

To get started, add an API key from a supported AI provider under Settings > AI providers. The provider bills its usage directly.

Privacy policy: https://www.dodi.app/privacy
Terms of use: https://www.dodi.app/terms
```

**App Review notes** (fill in the reviewer account from "Reviewer account"
above):

```text
Sign-in: <email> / <password>
The account has a kid profile ("Mia") and an AI provider key set up.

The app is used by a parent, who manages the family. To see what the child sees, tap "Kid View" in the top bar. On the home screen, tap the companion and allow the microphone to talk with it. Game Studio (menu > Games) builds a learning game from a short description.

Delete account: menu > Settings > General > Delete account. Then "Delete my profile" on the screen that follows removes the sign-in too (also available by tapping the email address at the bottom of the menu).
Report content: "Give feedback" at the bottom of the menu (category "Inappropriate content"); games in Discover also have "Report this game".
Privacy policy and terms: menu > Settings > General > Legal.

AI answers come from the third-party AI provider whose API key the parent adds; the parent gives consent before a key is added. The app sells nothing and shows no ads.
```

### Screenshots

Required: iPhone and iPad 13" (2064×2752), 1 to 10 each,
portrait. The iPhone slot is "iPhone with Dynamic Island (medium display)"
(2026): it accepted 1206×2622 and rejected 1242×2688 from a model without
a Dynamic Island. Take them in the Simulator from a `simulator` profile build (release
config against production, `eas build -p ios --profile simulator`), signed in
with the reviewer account so the screens show content. On the Mac:

```bash
bash clients/mobile/scripts/store-screenshots.sh [build .tar.gz URL or path]
```

It installs the build into an iPhone Pro Max and an iPad Pro 13-inch
Simulator, sets a 9:41 status bar, and walks through the set: Kid View home
with the companion, a game being played, Game Studio, the memory page,
Discover, and Settings > AI providers. You sign in once per device and set
each screen up; it opens the screen by deep link where one exists, captures
it and checks the size. Output: `~/dodi-screenshots/{iphone,ipad}`. Without
an argument it uses the `simulator` build from 2026-10-20; for a newer one,
pass its download URL from the build page on expo.dev. Captions, if any, follow the
2.3.8 rule above.

## Open decisions and follow-ups

- **Gemini.** The terms only allow Gemini for creating games in Game Studio.
  In the code, Gemini cannot run the Game Studio builder (`supportsAgentic:
  false`); it is offered for voice, thinking and images, and all three also
  run while kids play (voice companion, in-game texts and drawings). So a
  parent who follows the terms can at most use Gemini for Game Studio images,
  which today share the image setting with in-game drawings. Options: hide
  Gemini in the store builds, remove it from the voice picker, or split the
  image setting into Game Studio vs. in-game.
- **Newsletter unsubscribe:** there is no unsubscribe link or endpoint, while
  the site promises "Unsubscribe anytime". The privacy policy points to email
  for now.
- **Marketing copy** on the landing site says "not even we can read" and "we
  never see your data"; true for our servers, but the privacy policy now says
  plainly that AI providers receive the content. Keep the two consistent.
- **Retention jobs:** sessions, rate-limit windows and error logs are never
  pruned; the privacy policy therefore says "until you delete your account".
- **AI consent is not stored:** it is asked at the moment a key is added or
  dodi AI is turned on. Accounts that set up AI before this change never saw
  it.
- **dodi AI keys of deleted accounts** are not locked on the ai side (the
  platform never calls ai). The client drops its key and the daily rotation
  replaces the secret; a lock-on-delete call would close that gap.
- **Kids cannot report themselves;** reports come from the parent area.
