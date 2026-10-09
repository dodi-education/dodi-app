"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { access } from "@dodi/ui-recipes";

interface ConnectCodeFormProps {
  /** Distinguishes the input ids of several forms on one page. */
  id: string;
  /** The field label, e.g. "Connect a robot". */
  label: string;
  /** Shown under the field (an error from a previous lookup). */
  error?: string | null;
}

/** The code a robot or agent shows: opens "Allow access" (/parent/authorize?code=…) for it. */
export function ConnectCodeForm({ id, label, error }: ConnectCodeFormProps) {
  const t = useTranslations("access");
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (trimmed) router.push(`/parent/authorize?code=${encodeURIComponent(trimmed)}`);
      }}
      className={cn("flex", access.block)}
    >
      <Label htmlFor={`${id}-code`}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={`${id}-code`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("pairingCodePlaceholder")}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <Button type="submit" disabled={!code.trim()} className="min-h-11 sm:shrink-0">
          {t("lookUp")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className={access.error}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
