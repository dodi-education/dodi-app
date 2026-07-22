/**
 * Localized copy for transactional emails. The platform is otherwise
 * locale-blind, but `accounts.language` is plaintext and server-readable, so we
 * can render an email in the parent's own language. Add locales here as the app
 * grows; unknown/missing values fall back to English.
 */
import type { RejectionCode } from "@dodi/protocol";

export type EmailLocale = "en" | "de";

/** Map a stored BCP-47 short code (e.g. "en", "de-DE") onto a supported locale. */
export function normalizeEmailLocale(input: string | null | undefined): EmailLocale {
  return (input ?? "").slice(0, 2).toLowerCase() === "de" ? "de" : "en";
}

/** Shared shell copy: the footer every email carries. */
interface LayoutCopy {
  footerReason: string;
  footerManage: string;
  tagline: string;
}

/** Friend-request parent-approval email copy. */
interface FriendApprovalCopy {
  subject: string;
  preview: string;
  heading: string;
  body: string;
  privacyNote: string;
  button: string;
}

/** Newsletter subscription welcome (single opt-in) email copy. */
interface NewsletterWelcomeCopy {
  subject: string;
  preview: string;
  heading: string;
  body: string;
  button: string;
  /** Footer override — these subscribers have no account/settings page. */
  footerReason: string;
}

/**
 * Publication-outcome email copy — sent to the game's publisher once the review
 * has decided. One template, three shapes: approved, soft-rejected (changes
 * requested, resubmit allowed) and hard-rejected (permanent, no details shared).
 * `reasonLabels` mirrors the parent-facing labels in the web i18n catalog
 * (`publishReason_<code>`); the `Record<RejectionCode, …>` type forces a label
 * whenever the protocol taxonomy grows, so the two surfaces can't fall out of
 * sync on which codes exist.
 */
interface PublicationOutcomeCopy {
  approvedSubject: string;
  approvedPreview: string;
  approvedHeading: string;
  approvedBody: string;
  approvedButton: string;
  softSubject: string;
  softPreview: string;
  softHeading: string;
  /** Introduces the reason list — ends on a colon. */
  softBody: string;
  /** The reassurance that a fixed game may be resubmitted. */
  softRetry: string;
  softButton: string;
  hardSubject: string;
  hardPreview: string;
  hardHeading: string;
  /** Deliberately detail-free: a hard rejection shares no specifics. */
  hardBody: string;
  reasonLabels: Record<RejectionCode, string>;
}

const LAYOUT: Record<EmailLocale, LayoutCopy> = {
  en: {
    footerReason:
      "You're receiving this because email notifications are on for your dodi account.",
    footerManage: "Manage notifications",
    tagline: "dodi · do things differently",
  },
  de: {
    footerReason:
      "Du erhältst diese E-Mail, weil E-Mail-Benachrichtigungen für dein dodi-Konto aktiviert sind.",
    footerManage: "Benachrichtigungen verwalten",
    tagline: "dodi · do things differently",
  },
};

const FRIEND_APPROVAL: Record<EmailLocale, FriendApprovalCopy> = {
  en: {
    subject: "A friend request needs your approval",
    preview: "One of your kids has a friend request waiting for your approval.",
    heading: "A friend request needs your approval",
    body: "One of your kids accepted a friend request that needs a parent's final approval before they can connect.",
    privacyNote:
      "Due to end-to-end encryption our servers don't know the involved names. Open dodi to see who it is and approve or decline.",
    button: "Review the request",
  },
  de: {
    subject: "Eine Freundschaftsanfrage braucht deine Zustimmung",
    preview: "Eines deiner Kinder hat eine Freundschaftsanfrage, die auf dein OK wartet.",
    heading: "Eine Freundschaftsanfrage braucht deine Zustimmung",
    body: "Eines deiner Kinder hat eine Freundschaftsanfrage angenommen, die noch die endgültige Zustimmung eines Elternteils braucht.",
    privacyNote:
      "Aufgrund der Ende-zu-Ende Verschlüsselung kennen unsere Server die involvierten Namen nicht. Öffne dodi, um zu sehen, wer es ist, und zu bestätigen oder abzulehnen.",
    button: "Anfrage ansehen",
  },
};

const NEWSLETTER_WELCOME: Record<EmailLocale, NewsletterWelcomeCopy> = {
  en: {
    subject: "Welcome to the dodi newsletter",
    preview: "Thanks for subscribing — updates on the Companion and new features are on the way.",
    heading: "You're subscribed",
    body: "Thanks for subscribing to the dodi newsletter. We'll send occasional updates about the Companion device and new app features. In the meantime, you can start with dodi today.",
    button: "Explore dodi",
    footerReason:
      "You're receiving this because you subscribed to the dodi newsletter.",
  },
  de: {
    subject: "Willkommen beim dodi-Newsletter",
    preview: "Danke fürs Abonnieren – Neuigkeiten zum Companion und zu neuen Funktionen folgen.",
    heading: "Du hast abonniert",
    body: "Danke, dass du den dodi-Newsletter abonniert hast. Wir schicken dir ab und zu Neuigkeiten zum Companion-Gerät und zu neuen App-Funktionen. In der Zwischenzeit kannst du dodi schon heute ausprobieren.",
    button: "dodi entdecken",
    footerReason:
      "Du erhältst diese E-Mail, weil du den dodi-Newsletter abonniert hast.",
  },
};

const PUBLICATION_OUTCOME: Record<EmailLocale, PublicationOutcomeCopy> = {
  en: {
    approvedSubject: "Your game is now on dodi Discover",
    approvedPreview: "Your game passed review and is live on dodi Discover.",
    approvedHeading: "Your game is published",
    approvedBody:
      "It passed review and is now live on dodi Discover, where other families can find and play it. Thanks for sharing it with the community.",
    approvedButton: "See it on Discover",
    softSubject: "Your game needs a few changes before publishing",
    softPreview:
      "The review found a few things to fix before your game can go live.",
    softHeading: "A few changes needed",
    softBody:
      "Thanks for submitting your game to dodi Discover. The review found a few things to fix before it can go live:",
    softRetry:
      "Once you've resolved these, you can submit your game for review again.",
    softButton: "Open your game",
    hardSubject: "Your game can't be published on dodi Discover",
    hardPreview: "After review, your game can't be published on dodi Discover.",
    hardHeading: "Your game wasn't approved",
    hardBody:
      "Thanks for your submission. After review, this game can't be published on dodi Discover, and it can't be submitted again.",
    reasonLabels: {
      hard_security_violation: "Security violation",
      hard_forbidden_content: "Forbidden content",
      hard_child_safety: "Child-safety concern",
      hard_copyright_infringement: "Copyright or trademark infringement",
      soft_contains_personal_information: "Contains personal information",
      soft_bridge_protocol_mismatch: "Progress reporting isn't working",
      soft_age_appropriateness: "Doesn't fit the target age range",
      soft_misleading_metadata: "Title or description doesn't match the game",
      soft_quality_below_bar: "Game is broken or incomplete",
      soft_advertising_or_promotion: "Contains advertising or promotion",
    },
  },
  de: {
    approvedSubject: "Dein Spiel ist jetzt auf dodi Discover",
    approvedPreview:
      "Dein Spiel hat die Prüfung bestanden und ist auf dodi Discover veröffentlicht.",
    approvedHeading: "Dein Spiel ist veröffentlicht",
    approvedBody:
      "Es hat die Prüfung bestanden und ist jetzt auf dodi Discover live, wo andere Familien es finden und spielen können. Danke, dass du es mit der Community teilst.",
    approvedButton: "Auf Discover ansehen",
    softSubject: "Dein Spiel braucht noch ein paar Änderungen",
    softPreview:
      "Bei der Prüfung sind ein paar Punkte aufgefallen, die vor der Veröffentlichung zu beheben sind.",
    softHeading: "Ein paar Änderungen nötig",
    softBody:
      "Danke, dass du dein Spiel bei dodi Discover eingereicht hast. Bei der Prüfung sind ein paar Punkte aufgefallen, die vor der Veröffentlichung zu beheben sind:",
    softRetry:
      "Sobald du diese behoben hast, kannst du dein Spiel erneut zur Prüfung einreichen.",
    softButton: "Spiel öffnen",
    hardSubject: "Dein Spiel kann nicht auf dodi Discover veröffentlicht werden",
    hardPreview:
      "Nach der Prüfung kann dein Spiel nicht auf dodi Discover veröffentlicht werden.",
    hardHeading: "Dein Spiel wurde nicht freigegeben",
    hardBody:
      "Danke für deine Einreichung. Nach der Prüfung kann dieses Spiel nicht auf dodi Discover veröffentlicht werden und kann nicht erneut eingereicht werden.",
    reasonLabels: {
      hard_security_violation: "Sicherheitsverstoß",
      hard_forbidden_content: "Unzulässige Inhalte",
      hard_child_safety: "Kinderschutz-Bedenken",
      hard_copyright_infringement: "Urheberrechts- oder Markenverletzung",
      soft_contains_personal_information: "Enthält persönliche Daten",
      soft_bridge_protocol_mismatch: "Fortschrittsmeldung funktioniert nicht",
      soft_age_appropriateness: "Passt nicht zur Zielaltersgruppe",
      soft_misleading_metadata: "Titel oder Beschreibung passen nicht zum Spiel",
      soft_quality_below_bar: "Spiel ist kaputt oder unvollständig",
      soft_advertising_or_promotion: "Enthält Werbung",
    },
  },
};

export function layoutCopy(locale: EmailLocale): LayoutCopy {
  return LAYOUT[locale];
}

export function publicationOutcomeCopy(
  locale: EmailLocale,
): PublicationOutcomeCopy {
  return PUBLICATION_OUTCOME[locale];
}

export function friendApprovalCopy(locale: EmailLocale): FriendApprovalCopy {
  return FRIEND_APPROVAL[locale];
}

export function newsletterWelcomeCopy(locale: EmailLocale): NewsletterWelcomeCopy {
  return NEWSLETTER_WELCOME[locale];
}
