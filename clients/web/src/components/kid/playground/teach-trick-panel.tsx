"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  MAX_CUSTOM_TRICKS_PER_COMPANION,
  TRICK_DESCRIPTION_MAX_LENGTH,
  teachTrick,
  trickLanguageName,
  type TeachTrickResult,
} from "@dodi/client-state/custom-tricks";
import { playground as p } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { useActiveCompanion } from "@/hooks/use-active-companion";
import { teachTrickDeps } from "@/lib/companion-flow-deps";
import { cn } from "@/lib/utils";
import { useCompanionStageStore } from "@/stores/companion-stage-store";
import { useCustomTricksStore } from "@/stores/custom-tricks-store";
import { useDodiSessionStore } from "@/stores/dodi-session-store";

const SUGGESTIONS = ["spin", "jump", "bow", "dance", "flap"] as const;

type Learned = Extract<TeachTrickResult, { ok: true }>;

/** "Teach a trick": the kid says what to learn, the companion tries it, the kid keeps it. */
export function TeachTrickPanel() {
  const t = useTranslations("playground");
  const { kid, companion, look } = useActiveCompanion();
  const requestTrick = useCompanionStageStore((s) => s.requestTrick);
  const whileLearning = useCompanionStageStore((s) => s.whileLearning);
  const saveTrick = useCustomTricksStore((s) => s.save);
  const knownCount = useCustomTricksStore((s) => (companion ? (s.byCompanion[companion.id]?.length ?? 0) : 0));
  const beginAiActivity = useDodiSessionStore((s) => s.beginAiActivity);
  const endAiActivity = useDodiSessionStore((s) => s.endAiActivity);
  const [description, setDescription] = useState("");
  const [isTeaching, setIsTeaching] = useState(false);
  const [learned, setLearned] = useState<Learned | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isFull = knownCount >= MAX_CUSTOM_TRICKS_PER_COMPANION;

  async function teach(text: string) {
    if (!kid || !text.trim() || isTeaching) return;
    setIsTeaching(true);
    setMessage(null);
    setLearned(null);
    // The companion shows its thinking pose while the trick is written.
    beginAiActivity("thinking");
    let result: TeachTrickResult;
    try {
      result = await whileLearning(() =>
        teachTrick(teachTrickDeps(), {
          kidId: kid.id,
          model: look.model,
          description: text,
          languageName: trickLanguageName(kid.language),
        }),
      );
    } finally {
      endAiActivity("thinking");
      setIsTeaching(false);
    }
    if (!result.ok) {
      setMessage(result.reason === "no_thinking" ? t("teachNoThinking") : t("teachFailed"));
      return;
    }
    setLearned(result);
    void requestTrick({ id: "preview", name: result.record.name, script: result.script });
  }

  async function keep() {
    if (!learned || !companion) return;
    try {
      await saveTrick(companion.id, learned.record);
      setLearned(null);
      setDescription("");
      setMessage(t("saved"));
    } catch {
      setMessage(t("saveFailed"));
    }
  }

  if (isFull) return <p className={p.hint}>{t("teachLimit")}</p>;

  return (
    <>
      <form
        className={cn(p.section, p.webSection)}
        onSubmit={(e) => {
          e.preventDefault();
          void teach(description);
        }}
      >
        <label htmlFor="teach-trick" className={p.label}>
          {t("teachPrompt")}
        </label>
        <input
          id="teach-trick"
          className={cn(p.input, p.webInput)}
          value={description}
          placeholder={t("teachPlaceholder")}
          maxLength={TRICK_DESCRIPTION_MAX_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isTeaching}
        />
        <div className={cn(p.row, p.webRow)}>
          {SUGGESTIONS.map((key) => (
            <button
              key={key}
              type="button"
              className={cn(p.chip, p.webChip)}
              disabled={isTeaching}
              onClick={() => {
                const text = t(`suggestions.${key}`);
                setDescription(text);
                void teach(text);
              }}
            >
              <span className={p.chipText}>{t(`suggestions.${key}`)}</span>
            </button>
          ))}
        </div>
        <button type="submit" className={cn(p.chip, p.webChip, p.chipSelected)} disabled={isTeaching || !description.trim()}>
          <Icon name={isTeaching ? "loading" : "wand"} size={16} className={isTeaching ? "animate-spin" : undefined} />
          <span className={p.chipText}>{isTeaching ? t("teaching") : t("teachButton")}</span>
        </button>
      </form>

      {learned ? (
        <div className={cn(p.trick, p.webTrick)}>
          <span className={p.trickName}>{learned.record.name}</span>
          <button type="button" className={cn(p.chip, p.webChip)} onClick={() => void teach(description)}>
            <span className={p.chipText}>{t("tryAgain")}</span>
          </button>
          <button type="button" className={cn(p.chip, p.webChip, p.chipSelected)} onClick={() => void keep()}>
            <span className={p.chipText}>{t("keepIt")}</span>
          </button>
        </div>
      ) : null}
      {message ? (
        <p className={p.hint} role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
