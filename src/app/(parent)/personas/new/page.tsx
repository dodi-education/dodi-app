"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="mx-auto max-w-2xl flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {isImport ? t("importTitle") : t("createTitle")}
          </CardTitle>
          <CardDescription>
            {isImport ? t("importDescription") : t("createDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                required
                maxLength={100}
              />
            </div>

            {isImport ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="file">{t("fileLabel")}</Label>
                <Input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept=".md"
                  onChange={handleFileSelect}
                  required
                />
                {soul && (
                  <div className="mt-2 max-h-64 overflow-auto rounded-md border bg-muted/50 p-3">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {soul}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="soul">{t("soulLabel")}</Label>
                <textarea
                  id="soul"
                  value={soul}
                  onChange={(e) => setSoul(e.target.value)}
                  placeholder={t("soulPlaceholder")}
                  required
                  rows={20}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  {t("soulHint")}
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? tc("loading") : isImport ? t("import") : t("createPersona")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
