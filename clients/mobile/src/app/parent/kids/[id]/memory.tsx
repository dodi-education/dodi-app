import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { flowErrorText } from "@dodi/client-state/flow-error";
import { settleAll } from "@dodi/client-state/pull-refresh";
import {
  type MemoryRow,
  citationEntriesOf,
  discardKidMemory,
  loadKidMemories,
  parseCitationIds,
  saveKidMemory,
} from "@dodi/client-state/kid-memory";
import type { Kid } from "@dodi/types/database";
import { memoryEmpty, memoryItem } from "@dodi/ui-recipes";

import { DossierView } from "@/components/kids/dossier-view";
import { SectionFormError } from "@/components/parent/form-error";
import { MemoryTextarea } from "@/components/kids/memory-textarea";
import { PageMessage } from "@/components/parent/page-message";
import { StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Badge, Button, Text } from "@/components/ui";
import { useKidStore, useVaultStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";
import { parentFlowDeps } from "@/lib/parent-flow-deps";

/**
 * A kid's memory (web: parent/kids/[id]/memory/page): parent notes, the
 * briefing dossier with its citations, and the structured memories behind it
 * (discard to drop one; its citations leave the dossier at once). Everything
 * is opened and sealed on the device.
 */
export default function KidMemoryScreen() {
  const t = useTranslations("memory");
  const tc = useTranslations("common");
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { formatDateTime } = useAccountDateFormat();
  const [kid, setKid] = useState<Kid | null>(null);
  const [memory, setMemory] = useState("");
  const [parentNotes, setParentNotes] = useState("");
  const [isEditingMemory, setIsEditingMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [activeMemories, setActiveMemories] = useState<MemoryRow[]>([]);
  const [discardedMemories, setDiscardedMemories] = useState<MemoryRow[]>([]);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  const loadStructured = useCallback(async (kidId: string) => {
    const lists = await loadKidMemories(parentFlowDeps(), kidId);
    if (!lists) return;
    setActiveMemories(lists.active);
    setDiscardedMemories(lists.discarded);
  }, []);

  const applyKid = useCallback((data: Kid) => {
    setKid(data);
    setMemory(data.memory ?? "");
    setParentNotes(data.parent_notes ?? "");
  }, []);

  useEffect(() => {
    let isCancelled = false;
    async function load(): Promise<void> {
      try {
        const data = await useKidStore.getState().loadOne(id);
        if (isCancelled) return;
        if (!data) {
          setError(t("kidNotFound"));
          setIsFetching(false);
          return;
        }
        applyKid(data);
        await loadStructured(id);
        setIsFetching(false);
      } catch {
        if (!isCancelled) {
          setError(t("kidNotFound"));
          setIsFetching(false);
        }
      }
    }
    void load();
    return () => {
      isCancelled = true;
    };
  }, [id, t, applyKid, loadStructured]);

  // Pull to refresh: the dossier and notes past the cache (re-seeded as a
  // browser reload would: an open edit closes, unsaved text goes) and the
  // structured memories behind them.
  const refresh = (): Promise<void> =>
    settleAll([
      async () => {
        const data = await useKidStore.getState().loadOne(id, true);
        if (!data) return;
        applyKid(data);
        setIsEditingMemory(false);
        setError(null);
        setIsFetching(false);
      },
      () => loadStructured(id),
    ]);

  async function handleSave(): Promise<void> {
    setError(null);
    setIsSaving(true);
    try {
      await saveKidMemory(parentFlowDeps(), id, {
        parentNotes,
        ...(isEditingMemory ? { memory } : {}),
      });
    } catch (err) {
      setError(flowErrorText(err, t("failedToSave"), { vaultLocked: t("vaultLocked") }));
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    setIsEditingMemory(false);
  }

  // Every citation's decrypted transcript turn, keyed by memory_source_id.
  const citationEntries = useMemo(
    () => citationEntriesOf([...activeMemories, ...discardedMemories], useVaultStore.getState().session),
    [activeMemories, discardedMemories],
  );

  async function handleParentDiscard(memoryId: string): Promise<void> {
    setDiscardingId(memoryId);
    setError(null);
    try {
      const result = await discardKidMemory(parentFlowDeps(), {
        kidId: id,
        memoryId,
        activeMemories,
        memory,
        isEditingMemory,
      });
      if (result.memory !== memory) setMemory(result.memory);
      if (result.isDossierSaveFailed) setError(t("failedToSave"));
      await loadStructured(id);
    } catch {
      setError(t("failedToDiscard"));
    } finally {
      setDiscardingId(null);
    }
  }

  if (isFetching) {
    return (
      <ShellContent onRefresh={refresh}>
        <PageMessage>{tc("loading")}</PageMessage>
      </ShellContent>
    );
  }

  if (!kid) {
    return (
      <ShellContent onRefresh={refresh}>
        <PageMessage>{t("kidNotFound")}</PageMessage>
      </ShellContent>
    );
  }

  const citationCount = parseCitationIds(memory).length;

  return (
    <ShellContent onRefresh={refresh}>
      <Section title={t("parentNotesTitle")} desc={t("parentNotesHint")}>
        <StackField>
          <MemoryTextarea
            value={parentNotes}
            onChangeText={setParentNotes}
            rows={4}
            placeholder={t("parentNotesPlaceholder")}
            accessibilityLabel={t("parentNotesTitle")}
          />
        </StackField>
      </Section>

      <Section
        title={t("memoryTitle")}
        desc={citationCount > 0 ? t("memoryHintCited", { count: citationCount }) : t("memoryHint")}
        action={
          !isEditingMemory ? (
            <Button variant="outline" size="sm" onPress={() => setIsEditingMemory(true)}>
              {t("edit")}
            </Button>
          ) : undefined
        }
      >
        <StackField>
          {isEditingMemory ? (
            <MemoryTextarea
              value={memory}
              onChangeText={setMemory}
              rows={16}
              placeholder={t("memoryPlaceholder")}
              accessibilityLabel={t("memoryTitle")}
            />
          ) : memory ? (
            <DossierView dossier={memory} kidName={kid.display_name ?? ""} entriesBySourceId={citationEntries} />
          ) : (
            <View className={memoryEmpty.box}>
              <Text className={memoryEmpty.text}>{t("emptyMemory")}</Text>
            </View>
          )}
        </StackField>
      </Section>

      {error ? <SectionFormError>{error}</SectionFormError> : null}
      <SaveRow>
        <Button variant="outline" onPress={() => router.back()}>
          {tc("cancel")}
        </Button>
        <Button disabled={isSaving} onPress={() => void handleSave()}>
          {isSaving ? tc("loading") : tc("save")}
        </Button>
      </SaveRow>

      <Section title={t("structuredTitle")} desc={t("structuredHint")}>
        {activeMemories.length === 0 ? (
          <View className={memoryItem.empty}>
            <Text className={memoryItem.emptyText}>{t("noStructured")}</Text>
          </View>
        ) : (
          activeMemories.map((m) => (
            <View key={m.id} className={cn(memoryItem.withAction, memoryItem.box)}>
              <View className={memoryItem.main}>
                <Text className={memoryItem.content}>{m.content}</Text>
                <Text className={memoryItem.meta}>
                  {m.category ? <Text className={memoryItem.category}>{`${m.category}  `}</Text> : null}
                  {formatDateTime(m.created_at)}
                  {m.sources.length > 0 ? ` · ${t("sourceCount", { count: m.sources.length })}` : null}
                </Text>
              </View>
              <Button
                variant="outline"
                size="sm"
                disabled={discardingId === m.id}
                onPress={() => void handleParentDiscard(m.id)}
              >
                {discardingId === m.id ? "…" : t("discard")}
              </Button>
            </View>
          ))
        )}
      </Section>

      {discardedMemories.length > 0 ? (
        <Section title={t("discardedTitle")} desc={t("discardedHint")}>
          {discardedMemories.map((m) => (
            <View key={m.id} className={memoryItem.box}>
              <Text className={memoryItem.discardedContent}>{m.content}</Text>
              <View className={memoryItem.discardedMeta}>
                <Badge variant="gray">
                  {m.discarded_by === "parent" ? t("discardedByParent") : t("discardedBySystem")}
                </Badge>
                {m.discarded_at ? <Text className={memoryItem.metaText}>{formatDateTime(m.discarded_at)}</Text> : null}
                {m.discard_memory_source_id ? (
                  <Text className={cn(memoryItem.metaText, memoryItem.source)}>
                    {t("discardSource")}: {m.discard_memory_source_id.slice(0, 8)}…
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </Section>
      ) : null}
    </ShellContent>
  );
}
