/**
 * Localized copy for transactional emails. The platform is otherwise
 * locale-blind, but `accounts.language` is plaintext and server-readable, so we
 * can render an email in the parent's own language. Add locales here as the app
 * grows; unknown/missing values fall back to English.
 */

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

const LAYOUT: Record<EmailLocale, LayoutCopy> = {
  en: {
    footerReason:
      "You're receiving this because email notifications are on for your dodi account.",
    footerManage: "Manage notifications",
    tagline: "dodi · do education differently",
  },
  de: {
    footerReason:
      "Du erhältst diese E-Mail, weil E-Mail-Benachrichtigungen für dein dodi-Konto aktiviert sind.",
    footerManage: "Benachrichtigungen verwalten",
    tagline: "dodi · do education differently",
  },
};

const FRIEND_APPROVAL: Record<EmailLocale, FriendApprovalCopy> = {
  en: {
    subject: "A friend request needs your approval",
    preview: "One of your kids has a friend request waiting for your approval.",
    heading: "A friend request needs your approval",
    body: "One of your kids accepted a friend request that needs a parent's final approval before they can connect.",
    privacyNote:
      "Due to our end-to-end encryption our servers don't know the involved names. Open dodi to see who it is and approve or decline.",
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

export function layoutCopy(locale: EmailLocale): LayoutCopy {
  return LAYOUT[locale];
}

export function friendApprovalCopy(locale: EmailLocale): FriendApprovalCopy {
  return FRIEND_APPROVAL[locale];
}
