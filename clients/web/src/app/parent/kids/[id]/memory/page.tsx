"use client";

import { dodi } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { DossierView, type CitationEntry } from "@/components/parent/dossier-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import { removeDossierCitations } from "@dodi/ai/memory-prompt";
import { decryptContent, encryptKidFields } from "@dodi/vault";

import type { Kid, Memory, MemorySourceWithEntry } from "@dodi/types/database";

const textareaClassName =
  "block w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none transition-[color,box-shadow,border-color] placeholder:text-faint hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2";

interface MemoryRow extends Memory {
  sources: MemorySourceWithEntry[];
  content: string;
}

function parseCitationIds(dossier: string): string[] {
  const ids: string[] = [];
  const re = /\[source:([0-9a-f-]{36})\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dossier)) !== null) {
    ids.push(m[1]);
  }
  return [...new Set(ids)];
}

export default function KidMemoryPage() {
  const t = useTranslations("memory");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { formatDateTime } = useDateFormat();
  const [kid, setKid] = useState<Kid | null>(null);
  const [memory, setMemory] = useState("");
  const [parentNotes, setParentNotes] = useState("");
  const [editingMemory, setEditingMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [activeMemories, setActiveMemories] = useState<MemoryRow[]>([]);
  const [discardedMemories, setDiscardedMemories] = useState<MemoryRow[]>([]);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  const loadStructured = useCallback(async (kidId: string) => {
    const session = useVaultStore.getState().session;
    if (!session) return;

    const [activeRes, discardedRes] = await Promise.all([
      dodi.request(`/api/kids/${kidId}/memories?status=active&includeSources=1`),
      dodi.request(
        `/api/kids/${kidId}/memories?status=discarded&includeSources=1`,
      ),
    ]);

    const mapRows = async (res: Response): Promise<MemoryRow[]> => {
      if (!res.ok) return [];
      const data = (await res.json()) as Array<
        Memory & { sources?: MemorySourceWithEntry[] }
      >;
      return data.map((m) => ({
        ...m,
        sources: m.sources ?? [],
        content: decryptContent(session, m.content_enc),
      }));
    };

    setActiveMemories(await mapRows(activeRes));
    setDiscardedMemories(await mapRows(discardedRes));
  }, []);

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
        await loadStructured(params.id);
        setFetching(false);
      } catch {
        if (!cancelled) {
          setError(t("kidNotFound"));
          setFetching(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id, t, loadStructured]);

  async function handleSave() {
    setError(null);
    setSaving(true);

    const session = useVaultStore.getState().session;
    if (!session) {
      setError(t("vaultLocked"));
      setSaving(false);
      return;
    }

    const plain: { parent_notes: string | null; memory?: string | null } = {
      parent_notes: parentNotes || null,
    };
    if (editingMemory) {
      plain.memory = memory || null;
    }
    const enc = encryptKidFields(session, plain);

    const response = await dodi.request(`/api/kids/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enc),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error || t("failedToSave"));
      setSaving(false);
      return;
    }

    useKidStore.getState().invalidate();
    setSaving(false);
    setEditingMemory(false);
    router.refresh();
  }

  // Every citation's decrypted transcript turn, keyed by memory_source_id —
  // feeds the [n] popovers in the dossier view. Sources of discarded memories
  // stay resolvable so citations in an older dossier don't go dark.
  const citationEntries = useMemo(() => {
    const map = new Map<string, CitationEntry>();
    const session = useVaultStore.getState().session;
    if (!session) return map;
    for (const m of [...activeMemories, ...discardedMemories]) {
      for (const s of m.sources) {
        if (s.entry && !map.has(s.id)) {
          map.set(s.id, {
            role: s.entry.role,
            text: decryptContent(session, s.entry.content_enc),
            occurredAt: s.entry.occurred_at,
          });
        }
      }
    }
    return map;
  }, [activeMemories, discardedMemories]);

  async function handleParentDiscard(memoryId: string) {
    setDiscardingId(memoryId);
    setError(null);
    try {
      // Capture the memory's citation ids BEFORE the lists reload.
      const target = activeMemories.find((m) => m.id === memoryId);

      const res = await dodi.request(`/api/kids/${params.id}/memories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId, by: "parent" }),
      });
      if (!res.ok) {
        setError(t("failedToDiscard"));
        return;
      }

      // A discarded memory's support disappears from the dossier immediately:
      // strip its citations (and lines they solely supported) — deterministic,
      // no model call; the next memory update smooths the narrative.
      const sourceIds = target?.sources.map((s) => s.id) ?? [];
      const updated = removeDossierCitations(memory, sourceIds);
      if (updated !== memory) {
        setMemory(updated);
        const session = useVaultStore.getState().session;
        // While the parent is mid-edit, only the textarea updates — their
        // eventual Save persists the combined result instead of a partial one.
        if (session && !editingMemory) {
          const enc = encryptKidFields(session, { memory: updated || null });
          const dossierRes = await dodi.request(`/api/kids/${params.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memory: enc.memory }),
          });
          if (dossierRes.ok) {
            useKidStore.getState().invalidate();
          } else {
            setError(t("failedToSave"));
          }
        }
      }

      await loadStructured(params.id);
    } catch {
      setError(t("failedToDiscard"));
    } finally {
      setDiscardingId(null);
    }
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

  const citationCount = parseCitationIds(memory).length;

  return (
    <div>
      <Section title={t("parentNotesTitle")} desc={t("parentNotesHint")}>
        <StackField>
          <Label htmlFor="parent-notes" className="sr-only">
            {t("parentNotesTitle")}
          </Label>
          <textarea
            id="parent-notes"
            value={parentNotes}
            onChange={(e) => setParentNotes(e.target.value)}
            rows={4}
            className={textareaClassName}
            placeholder={t("parentNotesPlaceholder")}
          />
        </StackField>
      </Section>

      <Section
        title={t("memoryTitle")}
        desc={
          citationCount > 0
            ? t("memoryHintCited", { count: citationCount })
            : t("memoryHint")
        }
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
            <DossierView
              dossier={memory}
              kidName={kid.display_name ?? ""}
              entriesBySourceId={citationEntries}
            />
          ) : (
            <div className="whitespace-pre-wrap rounded-md bg-muted p-3.5 text-sm leading-relaxed text-faint">
              {t("emptyMemory")}
            </div>
          )}
        </StackField>
      </Section>

      {error && <div className="px-5 py-3 text-sm text-danger">{error}</div>}
      <SaveRow>
        <Button variant="outline" onClick={() => router.back()}>
          {tc("cancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? tc("loading") : tc("save")}
        </Button>
      </SaveRow>

      <Section title={t("structuredTitle")} desc={t("structuredHint")}>
        {activeMemories.length === 0 ? (
          <div className="px-5 py-4 text-sm text-faint">{t("noStructured")}</div>
        ) : (
          <ul className="divide-y divide-border">
            {activeMemories.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-2">{m.content}</p>
                  <p className="mt-1 text-xs text-faint">
                    {m.category ? (
                      <span className="mr-2 font-medium">{m.category}</span>
                    ) : null}
                    {formatDateTime(m.created_at)}
                    {m.sources.length > 0
                      ? ` · ${t("sourceCount", { count: m.sources.length })}`
                      : null}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={discardingId === m.id}
                  onClick={() => void handleParentDiscard(m.id)}
                >
                  {discardingId === m.id ? "…" : t("discard")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {discardedMemories.length > 0 && (
        <Section title={t("discardedTitle")} desc={t("discardedHint")}>
          <ul className="divide-y divide-border">
            {discardedMemories.map((m) => (
              <li key={m.id} className="px-5 py-3">
                <p className="text-sm text-muted-foreground line-through">
                  {m.content}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint">
                  <Badge variant="gray">
                    {m.discarded_by === "parent"
                      ? t("discardedByParent")
                      : t("discardedBySystem")}
                  </Badge>
                  {m.discarded_at ? formatDateTime(m.discarded_at) : null}
                  {m.discard_memory_source_id ? (
                    <span className="font-mono text-[10px]">
                      {t("discardSource")}: {m.discard_memory_source_id.slice(0, 8)}…
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
