import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui";

/** Copies `text` to the clipboard and flips to "Copied" for a moment (web: access/copy-button). */
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

  async function copy(): Promise<void> {
    try {
      await Clipboard.setStringAsync(text);
      setIsCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setIsCopied(false), 1600);
    } catch {
      /* clipboard unavailable: no-op */
    }
  }

  return (
    <Button variant="outline" icon={isCopied ? "check" : "copy"} accessibilityLabel={label} onPress={() => void copy()}>
      {isCopied ? t("copied") : t("copy")}
    </Button>
  );
}
