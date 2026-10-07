import { View } from "react-native";
import { sectionFormError } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { useAnnounceOnIos } from "@/lib/announce";

/** A form's error line inside a Section (web: px-5 py-3 text-sm text-danger). */
export function SectionFormError({ children }: { children: string }) {
  // Mounts with the error: news on arrival (TalkBack: the live region).
  useAnnounceOnIos(children, { isNewOnMount: true });
  return (
    <View className={sectionFormError.box} accessibilityLiveRegion="polite">
      <Text className={sectionFormError.text}>{children}</Text>
    </View>
  );
}
