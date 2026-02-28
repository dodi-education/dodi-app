"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import type { Persona } from "@/types/database";

export default function PersonaDetailPage() {
  const t = useTranslations("personas");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState("");
  const [soul, setSoul] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [showClone, setShowClone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/personas/${params.id}`);
      if (cancelled) return;
      if (!response.ok) {
        setError(t("notFound"));
        setFetching(false);
        return;
      }
      const data: Persona = await response.json();
      if (cancelled) return;
      setPersona(data);
      setName(data.name);
      setSoul(data.soul);
      setFetching(false);
    }
    load();
    return () => { cancelled = true; };
  }, [params.id, t]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch(`/api/personas/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, soul }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToUpdate"));
      setLoading(false);
      return;
    }

    router.push("/personas");
    router.refresh();
  }

  async function handleClone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch(`/api/personas/${params.id}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cloneName }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToClone"));
      setLoading(false);
      return;
    }

    router.push("/personas");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;

    const response = await fetch(`/api/personas/${params.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError(t("failedToDelete"));
      return;
    }

    router.push("/personas");
    router.refresh();
  }

  function handleExport() {
    window.open(`/api/personas/${params.id}/export`, "_blank");
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  if (persona.is_system_default) {
    return (
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{persona.name}</CardTitle>
                <CardDescription>{t("defaultHint")}</CardDescription>
              </div>
              <Badge variant="secondary">{t("default")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm">
                {persona.soul}
              </pre>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleExport}>
                {t("export")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCloneName(`${persona.name} (Copy)`);
                  setShowClone(true);
                }}
              >
                {t("clone")}
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                {tc("cancel")}
              </Button>
            </div>

            {showClone && (
              <form onSubmit={handleClone} className="flex items-end gap-3 rounded-md border p-4">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="clone-name">{t("cloneNameLabel")}</Label>
                  <Input
                    id="clone-name"
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    required
                    maxLength={100}
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? tc("loading") : t("clone")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
          <CardDescription>
            {t("editDescription", { name: persona.name })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="soul">{t("soulLabel")}</Label>
              <textarea
                id="soul"
                value={soul}
                onChange={(e) => setSoul(e.target.value)}
                required
                rows={20}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                {t("soulHint")}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? t("saving") : tc("save")}
              </Button>
              <Button type="button" variant="outline" onClick={handleExport}>
                {t("export")}
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

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">{t("dangerZone")}</CardTitle>
          <CardDescription>{t("dangerZoneDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <Button variant="destructive" onClick={handleDelete}>
            {t("deletePersona")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
