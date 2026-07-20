"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { tokenizeDossier } from "@/lib/dossier-citations";

/** Decrypted transcript turn backing one dossier citation. */
export interface CitationEntry {
  role: "dodi" | "kid";
  text: string;
  occurredAt: string;
}

interface DossierViewProps {
  dossier: string;
  kidName: string;
  /** memory_source_id → cited entry; a missing id renders a fallback popover. */
  entriesBySourceId: Map<string, CitationEntry>;
}

/**
 * Read-only dossier renderer: `[source:<id>]` markers become numbered [1][2]
 * citation links (numbered in reading order, repeats reuse their number).
 * Hovering (pointer devices) or tapping a citation opens a popover with the
 * decrypted transcript turn the memory was observed in.
 */
export function DossierView({
  dossier,
  kidName,
  entriesBySourceId,
}: DossierViewProps) {
  const t = useTranslations("memory");
  const { formatDateTime } = useDateFormat();
  // Index of the OPEN citation token (occurrence, not source id — the same
  // source cited twice gets its own anchor per occurrence).
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openIndex]);

  // Hover-open only where hover exists; touch devices rely on the tap toggle
  // (a synthetic mouseenter before click would otherwise toggle twice).
  const hoverCapable =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(hover: hover)").matches ?? false);

  const tokens = tokenizeDossier(dossier);

  return (
    <div
      ref={containerRef}
      className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3.5 text-sm leading-relaxed text-ink-2"
    >
      {tokens.map((tok, i) => {
        if (tok.type === "text") {
          return <span key={i}>{tok.text}</span>;
        }
        const entry = entriesBySourceId.get(tok.sourceId);
        const isOpen = openIndex === i;
        return (
          <span
            key={i}
            className="relative inline-block"
            onMouseEnter={hoverCapable ? () => setOpenIndex(i) : undefined}
            onMouseLeave={
              hoverCapable
                ? () => setOpenIndex((cur) => (cur === i ? null : cur))
                : undefined
            }
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={t("citationLabel", { num: tok.num })}
              className="-my-1 mx-px cursor-pointer p-1 align-super text-[10px] font-semibold leading-none text-primary hover:underline"
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              [{tok.num}]
            </button>
            {isOpen && (
              <span
                role="tooltip"
                className="absolute left-1/2 top-full z-10 mt-1 block w-64 max-w-[80vw] -translate-x-1/2 whitespace-normal rounded-md border border-border bg-card p-3 text-xs shadow-lg"
              >
                {entry ? (
                  <>
                    <span className="block font-medium text-faint">
                      {entry.role === "kid" ? kidName : "dodi"} ·{" "}
                      {formatDateTime(entry.occurredAt)}
                    </span>
                    <span className="mt-1 block leading-relaxed text-ink-2">
                      {entry.text}
                    </span>
                  </>
                ) : (
                  <span className="block text-faint">
                    {t("citationMissing")}
                  </span>
                )}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
