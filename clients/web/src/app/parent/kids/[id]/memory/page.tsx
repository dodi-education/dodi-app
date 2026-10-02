"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { DossierView } from "@/components/parent/dossier-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import { parentFlowDeps } from "@/lib/parent-flow-deps";
import { cn } from "@/lib/utils";
import {
  memoryEmpty,
  memoryItem,
  memoryTextarea,
  pageMessage,
  sectionFormError,
} from "@dodi/ui-recipes";
import { flowErrorText } from "@dodi/client-state/flow-error";
import {
  citationEntriesOf,
  discardKidMemory,
  loadKidMemories,
  parseCitationIds,
  saveKidMemory,
  type MemoryRow,
} from "@dodi/client-state/kid-memory";

import type { Kid } from "@dodi/types/database";

const textareaClassName = cn(
  memoryTextarea.web,
  memoryTextarea.box,
  memoryTextarea.text,
);

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
    const lists = await loadKidMemories(parentFlowDeps(), kidId);
    if (!lists) return;
    setActiveMemories(lists.active);
    setDiscardedMemories(lists.discarded);
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

    // Notes always; the dossier only when the parent edited it. Both sealed.
    try {
      await saveKidMemory(parentFlowDeps(), params.id, {
        parentNotes,
        ...(editingMemory ? { memory } : {}),
      });
    } catch (err) {
      setError(flowErrorText(err, t("failedToSave"), { vaultLocked: t("vaultLocked") }));
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditingMemory(false);
    router.refresh();
  }

  // Every citation's decrypted transcript turn, keyed by memory_source_id —
  // feeds the [n] popovers in the dossier view. Sources of discarded memories
  // stay resolvable so citations in an older dossier don't go dark.
  const citationEntries = useMemo(
    () =>
      citationEntriesOf(
        [...activeMemories, ...discardedMemories],
        useVaultStore.getState().session,
      ),
    [activeMemories, discardedMemories],
  );

  async function handleParentDiscard(memoryId: string) {
    setDiscardingId(memoryId);
    setError(null);
    try {
      // The memory's citations (and lines they solely supported) leave the
      // dossier at once; mid-edit, only the textarea updates and the parent's
      // eventual Save persists the combined result.
      const result = await discardKidMemory(parentFlowDeps(), {
        kidId: params.id,
        memoryId,
        activeMemories,
        memory,
        isEditingMemory: editingMemory,
      });
      if (result.memory !== memory) setMemory(result.memory);
      if (result.isDossierSaveFailed) setError(t("failedToSave"));
      await loadStructured(params.id);
    } catch {
      setError(t("failedToDiscard"));
    } finally {
      setDiscardingId(null);
    }
  }

  if (fetching) {
    return (
      <div className={cn(pageMessage.web, pageMessage.box)}>
        <p className={pageMessage.text}>{tc("loading")}</p>
      </div>
    );
  }

  if (!kid) {
    return (
      <div className={cn(pageMessage.web, pageMessage.box)}>
        <p className={pageMessage.text}>{t("kidNotFound")}</p>
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
            <div
              className={cn(memoryEmpty.web, memoryEmpty.box, memoryEmpty.text)}
            >
              {t("emptyMemory")}
            </div>
          )}
        </StackField>
      </Section>

      {error && (
        <div className={cn(sectionFormError.box, sectionFormError.text)}>
          {error}
        </div>
      )}
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
          <div className={cn(memoryItem.empty, memoryItem.emptyText)}>
            {t("noStructured")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activeMemories.map((m) => (
              <li
                key={m.id}
                className={cn(
                  memoryItem.webWithAction,
                  memoryItem.withAction,
                  memoryItem.box,
                )}
              >
                <div className={memoryItem.main}>
                  <p className={memoryItem.content}>{m.content}</p>
                  <p className={memoryItem.meta}>
                    {m.category ? (
                      <span className={memoryItem.category}>{m.category}</span>
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
              <li key={m.id} className={memoryItem.box}>
                <p className={memoryItem.discardedContent}>{m.content}</p>
                <p
                  className={cn(
                    memoryItem.webDiscardedMeta,
                    memoryItem.discardedMeta,
                    memoryItem.meta,
                  )}
                >
                  <Badge variant="gray">
                    {m.discarded_by === "parent"
                      ? t("discardedByParent")
                      : t("discardedBySystem")}
                  </Badge>
                  {m.discarded_at ? formatDateTime(m.discarded_at) : null}
                  {m.discard_memory_source_id ? (
                    <span className={memoryItem.source}>
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
