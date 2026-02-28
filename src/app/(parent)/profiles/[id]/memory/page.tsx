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
import { Label } from "@/components/ui/label";

import type { Profile } from "@/types/database";

export default function ProfileMemoryPage() {
  const t = useTranslations("memory");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memory, setMemory] = useState("");
  const [parentNotes, setParentNotes] = useState("");
  const [editingMemory, setEditingMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/profiles/${params.id}`);
      if (cancelled) return;
      if (!response.ok) {
        setError(t("profileNotFound"));
        setFetching(false);
        return;
      }
      const data: Profile = await response.json();
      if (cancelled) return;
      setProfile(data);
      setMemory(data.memory ?? "");
      setParentNotes(data.parent_notes ?? "");
      setFetching(false);
    }
    load();
    return () => { cancelled = true; };
  }, [params.id, t]);

  async function handleSave() {
    setError(null);
    setSaving(true);

    const updates: Record<string, string | null> = {
      parent_notes: parentNotes || null,
    };
    if (editingMemory) {
      updates.memory = memory || null;
    }

    const response = await fetch(`/api/profiles/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToSave"));
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditingMemory(false);
    router.refresh();
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("profileNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("title", { name: profile.display_name })}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("memoryTitle")}</CardTitle>
              <CardDescription>{t("memoryHint")}</CardDescription>
            </div>
            {!editingMemory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingMemory(true)}
              >
                {t("edit")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingMemory ? (
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              rows={16}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("memoryPlaceholder")}
            />
          ) : memory ? (
            <div className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm">
                {memory}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("emptyMemory")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("parentNotesTitle")}</CardTitle>
          <CardDescription>{t("parentNotesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="parent-notes" className="sr-only">
              {t("parentNotesTitle")}
            </Label>
            <textarea
              id="parent-notes"
              value={parentNotes}
              onChange={(e) => setParentNotes(e.target.value)}
              rows={8}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("parentNotesPlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? tc("loading") : tc("save")}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
