"use client";

import { useTranslations } from "next-intl";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
  type FeedbackCategory,
  type FeedbackDraft,
} from "@dodi/client-state/feedback";
import { dialogField, textarea } from "@dodi/ui-recipes";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The feedback dialog's form: the sender's name, the category and the
 * message, with the note that it reaches the team in readable form. Mobile:
 * components/parent/feedback-fields.
 */
export function FeedbackFields({
  draft,
  disabled,
  onChange,
}: {
  draft: FeedbackDraft;
  disabled: boolean;
  onChange: (patch: Partial<FeedbackDraft>) => void;
}) {
  const t = useTranslations("feedback");
  return (
    <>
      <div className={cn(dialogField.web, dialogField.box)}>
        <label htmlFor="feedback-name" className={dialogField.label}>
          {t("nameLabel")}
        </label>
        <Input
          id="feedback-name"
          value={draft.senderName}
          autoComplete="name"
          maxLength={FEEDBACK_SENDER_NAME_MAX_LENGTH}
          disabled={disabled}
          onChange={(e) => onChange({ senderName: e.target.value })}
        />
      </div>
      <div className={cn(dialogField.web, dialogField.box)}>
        <label htmlFor="feedback-category" className={dialogField.label}>
          {t("categoryLabel")}
        </label>
        <Select
          value={draft.category}
          disabled={disabled}
          onValueChange={(value) => onChange({ category: value as FeedbackCategory })}
        >
          <SelectTrigger id="feedback-category" className="w-full">
            <SelectValue placeholder={t("categoryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {t(`categories.${category}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.gameId ? <p className={dialogField.hint}>{t("gameAttached")}</p> : null}
      </div>
      <div className={cn(dialogField.web, dialogField.box)}>
        <label htmlFor="feedback-message" className={dialogField.label}>
          {t("messageLabel")}
        </label>
        <textarea
          id="feedback-message"
          value={draft.message}
          placeholder={t("messagePlaceholder")}
          maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
          rows={5}
          disabled={disabled}
          className={cn(textarea.box, textarea.text, textarea.web)}
          onChange={(e) => onChange({ message: e.target.value })}
        />
        <p className={dialogField.hint}>{t("privacyHint")}</p>
      </div>
    </>
  );
}
