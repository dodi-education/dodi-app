import { View } from "react-native";
import { useTranslations } from "use-intl";
import { referenceSheet } from "@dodi/ui-recipes";

import { Sheet } from "@/components/ui";

import { ActionRow } from "./plan-chat-actions";

/** The sheet's fade-out, before another screen can be presented. */
const MODAL_CLOSE_MS = 350;

interface ReferenceImageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onUpload: () => void;
  /** Only the Plan step has a sketch surface to open. */
  onDraw?: () => void;
}

/**
 * The composer's image button: how a reference image gets into the
 * conversation. A photo from the camera, one from the device, or, while
 * planning, a sketch drawn on the spot.
 */
export function ReferenceImageSheet({ isOpen, onClose, onTakePhoto, onUpload, onDraw }: ReferenceImageSheetProps) {
  const t = useTranslations("gameStudio");
  // The camera and the photo picker present over the app: let the sheet's
  // modal finish closing first, or iOS refuses the second presentation.
  const pick = (action: () => void) => (): void => {
    onClose();
    setTimeout(action, MODAL_CLOSE_MS);
  };

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t("attachImage")}>
      <View className={referenceSheet.list}>
        <ActionRow icon="camera" label={t("planTakePhoto")} onPress={pick(onTakePhoto)} />
        <ActionRow icon="upload" label={t("attachUpload")} onPress={pick(onUpload)} />
        {onDraw ? <ActionRow icon="pencil" label={t("planDrawSketch")} onPress={pick(onDraw)} /> : null}
      </View>
    </Sheet>
  );
}
