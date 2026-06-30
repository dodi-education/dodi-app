"use client";

import { dodi } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { BackLink } from "@/components/parent/back-link";
import { StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { PageHead, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";

import type { Kid } from "@dodi/types/database";

const textareaClassName =
  "block w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none transition-[color,box-shadow,border-color] placeholder:text-faint hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2";

export default function KidMemoryPage() {
  const t = useTranslations("memory");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [kid, setKid] = useState<Kid | null>(null);
  const [memory, setMemory] = useState("");
  const [parentNotes, setParentNotes] = useState("");
  const [editingMemory, setEditingMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await useKidStore.getState().loadOne(params.id);
        if (cancelled) return;
        if (!data) {
          setError(t("kidNotFound"));
          setFetching(false);
          return;
        }
        setKid(data);
        setMemory(data.memory ?? "");
        setParentNotes(data.parent_notes ?? "");
        setFetching(false);
      } catch {
        if (!cancelled) {
          setError(t("kidNotFound"));
          setFetching(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.id, t]);

  async function handleSave() {
    setError(null);
    setSaving(true);

    const session = useVaultStore.getState().session;
    if (!session) {
      setError("Your secure vault is locked. Please reload and try again.");
      setSaving(false);
      return;
    }

    // parent_notes is encrypted; memory stays plaintext until the AI memory
    // update moves client-side (P2), otherwise the server would overwrite it.
    const updates: Record<string, string | null> = {
      parent_notes: parentNotes ? session.encryptField(parentNotes) : null,
    };
    if (editingMemory) {
      updates.memory = memory || null;
    }

    const response = await dodi.request(`/api/kids/${params.id}`, {
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

    useKidStore.getState().invalidate();
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

  if (!kid) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("kidNotFound")}</p>
      </div>
    );
  }

  return (
    <div>
      <BackLink href={`/parent/kids/${params.id}`}>
        {kid.display_name}
      </BackLink>
      <PageHead
        title={t("title", { name: kid.display_name })}
        sub={t("subtitle")}
      />

      <Section
        title={t("memoryTitle")}
        desc={t("memoryHint")}
        action={
          !editingMemory ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingMemory(true)}
            >
              {t("edit")}
            </Button>
          ) : undefined
        }
      >
        <StackField>
          {editingMemory ? (
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              rows={16}
              className={textareaClassName}
              placeholder={t("memoryPlaceholder")}
            />
          ) : memory ? (
            <div className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3.5 text-sm leading-relaxed text-ink-2">
              {memory}
            </div>
          ) : (
            <div className="whitespace-pre-wrap rounded-md bg-muted p-3.5 text-sm leading-relaxed text-faint">
              {t("emptyMemory")}
            </div>
          )}
        </StackField>
      </Section>

      <Section title={t("parentNotesTitle")} desc={t("parentNotesHint")}>
        <StackField>
          <Label htmlFor="parent-notes" className="sr-only">
            {t("parentNotesTitle")}
          </Label>
          <textarea
            id="parent-notes"
            value={parentNotes}
            onChange={(e) => setParentNotes(e.target.value)}
            rows={8}
            className={textareaClassName}
            placeholder={t("parentNotesPlaceholder")}
          />
        </StackField>
        {error && <div className="px-5 py-3 text-sm text-danger">{error}</div>}
        <SaveRow>
          <Button variant="outline" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? tc("loading") : tc("save")}
          </Button>
        </SaveRow>
      </Section>
    </div>
  );
}
