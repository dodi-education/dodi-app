"use client";

import { useTranslations } from "next-intl";

import {
  ASSET_PUBLICATION_DESCRIPTION_MAX_LENGTH,
  ASSET_PUBLICATION_NAME_MAX_LENGTH,
} from "@dodi/client-state/character-asset-publication";
import {
  PUBLICATION_HANDLE_MAX_LENGTH,
  type PublicationHandleError,
} from "@dodi/protocol/publication-handle";
import { dialogField, textarea } from "@dodi/ui-recipes";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The share dialog's form: the name and description shown on Discover, and,
 * on a first publication, the account's public handle. Mobile:
 * components/parent/character-asset-share-fields.
 */
export function CharacterAssetShareFields({
  name,
  description,
  handle,
  isHandleNeeded,
  handleProblem,
  disabled,
  onNameChange,
  onDescriptionChange,
  onHandleChange,
}: {
  name: string;
  description: string;
  handle: string;
  isHandleNeeded: boolean;
  handleProblem: PublicationHandleError | null;
  disabled: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onHandleChange: (value: string) => void;
}) {
  const t = useTranslations("characterAssets");
  const tStudio = useTranslations("gameStudio");
  return (
    <>
      <div className={cn(dialogField.web, dialogField.box)}>
        <label htmlFor="asset-share-name" className={dialogField.label}>
          {t("shareNameLabel")}
        </label>
        <Input
          id="asset-share-name"
          value={name}
          maxLength={ASSET_PUBLICATION_NAME_MAX_LENGTH}
          disabled={disabled}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div className={cn(dialogField.web, dialogField.box)}>
        <label htmlFor="asset-share-description" className={dialogField.label}>
          {t("shareDescriptionLabel")}
        </label>
        <textarea
          id="asset-share-description"
          value={description}
          placeholder={t("shareDescriptionPlaceholder")}
          maxLength={ASSET_PUBLICATION_DESCRIPTION_MAX_LENGTH}
          disabled={disabled}
          className={cn(textarea.box, textarea.text, textarea.web)}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>
      {isHandleNeeded ? (
        <div className={cn(dialogField.web, dialogField.box)}>
          <label htmlFor="asset-share-handle" className={dialogField.label}>
            {tStudio("publishHandleLabel")}
          </label>
          <Input
            id="asset-share-handle"
            value={handle}
            placeholder={tStudio("publishHandlePlaceholder")}
            maxLength={PUBLICATION_HANDLE_MAX_LENGTH}
            disabled={disabled}
            aria-invalid={handleProblem !== null || undefined}
            onChange={(e) => onHandleChange(e.target.value)}
          />
          <p className={dialogField.hint}>
            {handleProblem === "reserved"
              ? tStudio("publishHandleReserved")
              : handleProblem === "format"
                ? tStudio("publishHandleFormat")
                : tStudio("publishHandleHint")}
          </p>
        </div>
      ) : null}
    </>
  );
}
