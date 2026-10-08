"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { FieldRow, StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { flowErrorText } from "@dodi/client-state/flow-error";
import {
  PERSONA_NAME_MAX_LENGTH,
  createPersona,
  invalidPersonaFields,
  personaNameFromFileName,
} from "@dodi/client-state/personas";
import { parentFlowDeps } from "@/lib/parent-flow-deps";
import { cn } from "@/lib/utils";
import { sectionFormError, soulPreview, soulTextarea } from "@dodi/ui-recipes";

export default function NewPersonaPage() {
  const t = useTranslations("personas");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isImport = searchParams.get("import") === "true";

  const [name, setName] = useState("");
  const [soul, setSoul] = useState("");
  const [invalidName, setInvalidName] = useState(false);
  const [invalidSoul, setInvalidSoul] = useState(false);
  const [invalidFile, setInvalidFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setSoul(text);
    setInvalidFile(false);

    if (!name) setName(personaNameFromFileName(file.name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Import reads the file into `soul` (handleFileSelect), so both modes now
    // submit the same encrypted create — the soul never reaches the server raw.
    const nextInvalid = {
      ...invalidPersonaFields({ name, soul }),
      file: isImport && !fileInputRef.current?.files?.[0],
    };
    if (nextInvalid.name || nextInvalid.file || nextInvalid.soul) {
      setInvalidName(nextInvalid.name);
      setInvalidFile(nextInvalid.file);
      setInvalidSoul(nextInvalid.soul);
      return;
    }
    setLoading(true);
    try {
      // Seals `name` and `soul` under the account VMK before they leave the browser.
      await createPersona(parentFlowDeps(), { name, soul });
    } catch (err) {
      setError(
        flowErrorText(err, t("failedToCreate"), {
          tooLong: t("soulTooLong"),
          vaultLocked: t("failedToCreate"),
        }),
      );
      setLoading(false);
      return;
    }
    router.push("/parent/companions?tab=personas");
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <Section title={tc("details")}>
          <FieldRow label={t("nameLabel")} htmlFor="name" required>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (invalidName) setInvalidName(false);
              }}
              placeholder={t("namePlaceholder")}
              aria-invalid={invalidName || undefined}
              aria-required
              maxLength={PERSONA_NAME_MAX_LENGTH}
              className="sm:w-[260px]"
            />
          </FieldRow>
          {isImport ? (
            <FieldRow label={t("fileLabel")} htmlFor="file" required>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".md"
                onChange={handleFileSelect}
                aria-invalid={invalidFile || undefined}
                aria-required
                className="sm:w-[260px]"
              />
            </FieldRow>
          ) : null}
        </Section>

        <Section title={t("soulLabel")} desc={t("soulHint")} required={!isImport}>
          {isImport ? (
            soul ? (
              <StackField>
                <pre
                  className={cn(
                    soulPreview.web,
                    soulPreview.box,
                    soulPreview.short,
                    soulPreview.text,
                  )}
                >
                  {soul}
                </pre>
              </StackField>
            ) : null
          ) : (
            <StackField>
              <textarea
                id="soul"
                value={soul}
                onChange={(e) => {
                  setSoul(e.target.value);
                  if (invalidSoul) setInvalidSoul(false);
                }}
                placeholder={t("soulPlaceholder")}
                aria-invalid={invalidSoul || undefined}
                aria-required
                rows={20}
                className={cn(soulTextarea.web, soulTextarea.box, soulTextarea.text)}
              />
            </StackField>
          )}

          {error ? (
            <StackField>
              <p className={sectionFormError.text}>{error}</p>
            </StackField>
          ) : null}

          <SaveRow>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? tc("loading") : isImport ? t("import") : t("createPersona")}
            </Button>
          </SaveRow>
        </Section>
      </form>
    </div>
  );
}
