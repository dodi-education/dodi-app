"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
  type FeedbackCategory,
  type FeedbackDraft,
} from "@dodi/client-state/feedback";
import { dialogField, dialogImage, textarea } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** The first image file among picked or pasted files. */
function firstImage(files: Iterable<File | null>): File | null {
  for (const file of files) if (file?.type.startsWith("image/")) return file;
  return null;
}

/**
 * The feedback dialog's form: the sender's name, the category, the message
 * and an optional image (picked, or pasted into the message), with the note
 * that it all reaches the team in readable form. Mobile:
 * components/parent/feedback-fields.
 */
export function FeedbackFields({
  draft,
  disabled,
  isPreparingImage,
  onChange,
  onAttachImage,
}: {
  draft: FeedbackDraft;
  disabled: boolean;
  isPreparingImage: boolean;
  onChange: (patch: Partial<FeedbackDraft>) => void;
  /** Prepares the file and puts it into the draft (feedback-dialog). */
  onAttachImage: (file: File) => void;
}) {
  const t = useTranslations("feedback");
  const fileInputRef = useRef<HTMLInputElement>(null);
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
          onPaste={(e) => {
            const file = firstImage(Array.from(e.clipboardData.items, (item) => item.getAsFile()));
            if (!file) return;
            e.preventDefault();
            onAttachImage(file);
          }}
        />
      </div>
      <div className={cn(dialogField.web, dialogField.box)}>
        <span className={dialogField.label}>{t("imageLabel")}</span>
        {draft.image ? (
          <div className={dialogImage.box}>
            {/* Raw <img>: the attachment is a data URL (next/image can't optimize it). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.image} alt={t("imageAlt")} className={cn(dialogImage.image, dialogImage.webImage)} />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ image: null })}
              aria-label={t("removeImage")}
              className={cn(dialogImage.remove, dialogImage.webRemove)}
            >
              <Icon name="close" size={12} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = firstImage(e.target.files ?? []);
                e.target.value = "";
                if (file) onAttachImage(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={disabled || isPreparingImage}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="photo" size={15} />
              {isPreparingImage ? t("imagePreparing") : t("attachImage")}
            </Button>
          </>
        )}
        <p className={dialogField.hint}>{t("imageHint")}</p>
      </div>
      <p className={dialogField.hint}>{t("privacyHint")}</p>
    </>
  );
}
