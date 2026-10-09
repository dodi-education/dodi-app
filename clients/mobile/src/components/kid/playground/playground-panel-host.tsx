import { usePathname } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCompanionStageStore } from "@/lib/client-state";
import { usePlaygroundFrameStore } from "@/lib/playground-frame-store";

import { PlaygroundPanel } from "./playground";

// The panel's side and bottom margins (the recipe's inset-x-2 / 8px above the edge).
const MARGIN = 8;

/**
 * The kid chrome's layer for the Playground panel: drawn after the bottom nav
 * so the panel covers it, from the line the kid home's stage measured down to
 * just above the screen's edge.
 */
export function PlaygroundPanelHost() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isOpen = useCompanionStageStore((s) => s.isPlaygroundOpen);
  const panelTop = usePlaygroundFrameStore((s) => s.panelTop);
  const ref = useRef<View>(null);
  const [hostTop, setHostTop] = useState(0);

  if (!isOpen || panelTop === null || !pathname.startsWith("/home")) return null;
  return (
    <View
      ref={ref}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={() => ref.current?.measureInWindow((_x, y) => setHostTop(y))}
    >
      <PlaygroundPanel
        style={{ top: panelTop - hostTop, bottom: insets.bottom + MARGIN, left: MARGIN, right: MARGIN }}
      />
    </View>
  );
}
