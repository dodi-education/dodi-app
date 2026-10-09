"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";

/** Copies `text` to the clipboard and flips to "Copied" for a moment. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations("access");
  const [isCopied, setIsCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setIsCopied(false), 1600);
    } catch {
      /* clipboard unavailable: no-op */
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void copy()}
      aria-label={label}
      className="min-h-11 sm:shrink-0"
    >
      <Icon name={isCopied ? "check" : "copy"} size={16} />
      <span aria-live="polite">{isCopied ? t("copied") : t("copy")}</span>
    </Button>
  );
}
