"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { BackLink } from "@/components/parent/back-link";
import { FieldRow, StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { PageHead, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewPersonaPage() {
  const t = useTranslations("personas");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isImport = searchParams.get("import") === "true";

  const [name, setName] = useState("");
  const [soul, setSoul] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setSoul(text);

    if (!name) {
      const baseName = file.name.replace(/\.soul\.md$|\.md$/, "");
      setName(baseName.charAt(0).toUpperCase() + baseName.slice(1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let response: Response;

      if (isImport && fileInputRef.current?.files?.[0]) {
        const formData = new FormData();
        formData.append("file", fileInputRef.current.files[0]);
        formData.append("name", name);
        response = await fetch("/api/personas/import", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, soul }),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || t("failedToCreate"));
        setLoading(false);
        return;
      }

      router.push("/personas");
      router.refresh();
    } catch {
      setError(t("failedToCreate"));
      setLoading(false);
    }
  }

  return (
    <div>
      <BackLink href="/personas">{t("title")}</BackLink>
      <PageHead
        title={isImport ? t("importTitle") : t("createTitle")}
        sub={isImport ? t("importDescription") : t("createDescription")}
      />

      <form onSubmit={handleSubmit}>
        <Section>
          <FieldRow label={t("nameLabel")} htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              required
              maxLength={100}
              className="sm:w-[260px]"
            />
          </FieldRow>
          {isImport ? (
            <FieldRow label={t("fileLabel")} htmlFor="file">
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".md"
                onChange={handleFileSelect}
                required
                className="sm:w-[260px]"
              />
            </FieldRow>
          ) : null}
        </Section>

        <Section title={t("soulLabel")} desc={t("soulHint")}>
          {isImport ? (
            soul ? (
              <StackField>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3.5 font-mono text-xs leading-relaxed text-ink-2">
                  {soul}
                </pre>
              </StackField>
            ) : null
          ) : (
            <StackField>
              <textarea
                id="soul"
                value={soul}
                onChange={(e) => setSoul(e.target.value)}
                placeholder={t("soulPlaceholder")}
                required
                rows={20}
                className="min-h-[320px] w-full resize-y rounded-md border border-border-strong bg-card px-3 py-2.5 font-mono text-xs leading-relaxed transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2"
              />
            </StackField>
          )}

          {error ? (
            <StackField>
              <p className="text-sm text-danger">{error}</p>
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
