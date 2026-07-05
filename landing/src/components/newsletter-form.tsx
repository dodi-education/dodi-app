"use client";

import { useRef, useState } from "react";

import type { Locale } from "@/lib/site";

type Status = "idle" | "sending" | "done" | "invalid" | "rateLimited" | "error";

export interface NewsletterFormLabels {
  placeholder: string;
  notifyMe: string;
  sending: string;
  done: string;
  invalid: string;
  rateLimited: string;
  error: string;
}

/**
 * Email-capture form wired to the platform's public POST /api/newsletter (the
 * landing site is a static export with no backend of its own). Binds to a named
 * newsletter `list` (e.g. "newsletter"). Reuses the design's
 * `.newsletter-form` markup so the look is unchanged; adds a honeypot +
 * client-measured fill time for spam protection. Labels are passed as resolved
 * strings from the server component (next-intl's translator isn't serializable).
 */
export function NewsletterForm({
  locale,
  list,
  labels,
}: {
  locale: Locale;
  /** Which newsletter list this form binds to (must be in NEWSLETTER_LISTS). */
  list: string;
  labels: NewsletterFormLabels;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState("");
  const mountedAt = useRef(Date.now());
  const hpRef = useRef<HTMLInputElement>(null);

  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL ?? "https://api.dodi.app"
  ).replace(/\/+$/, "");
  const done = status === "done";
  const sending = status === "sending";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || done) return;
    if (!email.trim()) {
      setStatus("invalid");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch(`${apiUrl}/api/newsletter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          locale,
          list,
          hp: hpRef.current?.value ?? "",
          elapsedMs: Date.now() - mountedAt.current,
        }),
      });
      if (res.ok) setStatus("done");
      else if (res.status === 400) setStatus("invalid");
      else if (res.status === 429) setStatus("rateLimited");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  const message =
    status === "invalid"
      ? labels.invalid
      : status === "rateLimited"
        ? labels.rateLimited
        : status === "error"
          ? labels.error
          : null;

  return (
    <>
      <form className="newsletter-form" noValidate onSubmit={onSubmit}>
        <input
          type="email"
          placeholder={labels.placeholder}
          aria-label="Email address"
          required
          value={email}
          disabled={done || sending}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear a prior error once the user edits, so it doesn't linger.
            if (status !== "idle" && status !== "sending") setStatus("idle");
          }}
        />
        {/* Honeypot: off-screen and out of tab order; humans never fill it. */}
        <input
          ref={hpRef}
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            width: 1,
            height: 1,
            opacity: 0,
          }}
        />
        <button
          className="btn btn--coral"
          type="submit"
          disabled={done || sending}
          style={done ? { background: "var(--mint)" } : undefined}
        >
          {done ? labels.done : sending ? labels.sending : labels.notifyMe}
        </button>
      </form>
      {message ? (
        <p
          className="newsletter-error"
          role="alert"
          style={{ marginTop: 10, color: "var(--coral-700)", fontWeight: 600 }}
        >
          {message}
        </p>
      ) : null}
    </>
  );
}
