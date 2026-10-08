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
| In-app account deletion | Apple 5.1.1(v), Play account deletion | Settings > General > Delete account → `DELETE /api/account` (password re-check) |
| Web resource for deletion | Play account deletion | /delete-account (steps, email route, what is deleted and kept) |
| Report offensive AI content in the app | Play AI-generated content | "Report a problem" in the parent menu, "Report this game" on Discover games → `POST /api/reports`, emailed to `SYSTEM_NOTIFICATION_EMAIL` |
| Report and moderate user-generated content | Apple 1.2 | Discover games: AI security review before publishing, "Report this game", and the operator takes a live game down with `POST /api/internal/publications/{id}/reject` (ops console or curl with the platform `x-ops-secret`; it now also works on live games). Incoming friend requests need a parent's approval, and friends can be removed |
| Published contact information | Apple 1.2, Austrian ECG | /imprint |

## Before the first submission

1. **Fill in the operator details** in `dodi-com/landing/src/lib/legal.ts`:
   `city` (place of residence, required by MedienG § 25) and
   `hostingLocation` (the Hetzner server location). Until then the imprint and
   privacy policy show "[to be added]" and the build prints a warning.
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
   `20261008120000_snapshots_sender_kid_cascade.sql` and
   `20261008130000_content_reports.sql`, then make sure
   `SYSTEM_NOTIFICATION_EMAIL` is set (reports are emailed there) and that
   team@dodi.app receives mail (deletion requests go there).
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
6. Review notes: email + password; "the app is used by a parent, who opens
   Kid view for the child; tap the companion and allow the microphone to talk";
   where Delete account and Report a problem are; that AI answers come from
   third-party providers; that the app sells nothing in-app.

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
- **Export compliance:** `ios.config.usesNonExemptEncryption` is `true`
  (custom E2EE), so App Store Connect asks the export questions on upload, and
  the US annual self-classification report applies.
- **Payments:** the app sells nothing today. If credits become purchasable in
  the iOS app, that must use In-App Purchase (guideline 3.1.1).

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
