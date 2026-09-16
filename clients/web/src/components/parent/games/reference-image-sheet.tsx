"use client";

import type { useTranslations } from "next-intl";

import { ActionRow } from "@/components/parent/games/plan-chat-actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

interface ReferenceImageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The composer the sheet belongs to: it opens over it, edge to edge. */
  anchorRef: React.RefObject<HTMLElement | null>;
  onTakePhoto: () => void;
  onUpload: () => void;
  /** Only the Plan step has a sketch surface to open. */
  onDraw?: () => void;
  t: ReturnType<typeof useTranslations>;
}

/**
 * The composer's image button: how a reference image gets into the
 * conversation. A photo from the camera, a file from the device, or, while
 * planning, a sketch drawn on the spot.
 */
export function ReferenceImageSheet({
  open,
  onOpenChange,
  anchorRef,
  onTakePhoto,
  onUpload,
  onDraw,
  t,
}: ReferenceImageSheetProps) {
  const pick = (action: () => void) => (): void => {
    onOpenChange(false);
    action();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent anchorRef={anchorRef}>
        <SheetTitle>{t("attachImage")}</SheetTitle>
        <div className="flex flex-col gap-2">
          <ActionRow icon="camera" label={t("planTakePhoto")} onClick={pick(onTakePhoto)} />
          <ActionRow icon="upload" label={t("attachUpload")} onClick={pick(onUpload)} />
          {onDraw && (
            <ActionRow icon="pencil" label={t("planDrawSketch")} onClick={pick(onDraw)} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
