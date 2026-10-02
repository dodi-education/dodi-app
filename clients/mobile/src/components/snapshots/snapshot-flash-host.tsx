import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { snapshotFlash as f } from "@dodi/ui-recipes";

import { clearSnapshotFlash, useSnapshotFlashStore } from "@/lib/snapshot-flash-store";

import { SnapshotFlash } from "./snapshot-flash";

/**
 * The full-window layer the snapshot flash renders in (the web's fixed,
 * full-viewport overlay): the kid chrome's last child, above the page (and the
 * game WebView in it) and the bottom nav, never clipped by the game view.
 * Touches pass through. The elevation keeps it above the nav on Android, where
 * a sibling's elevation outranks zIndex and render order.
 */
export function SnapshotFlashHost() {
  const flash = useSnapshotFlashStore((s) => s.flash);
  const hostRef = useRef<View | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  // The host's window position, so the flash's window rects convert to it.
  const measureOrigin = useCallback(() => {
    hostRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
  }, []);

  return (
    <View
      ref={hostRef}
      collapsable={false}
      onLayout={measureOrigin}
      pointerEvents="none"
      className={f.overlay}
      style={{ elevation: f.shadow.elevation }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {flash && origin ? (
        <SnapshotFlash
          key={flash.id}
          image={flash.image}
          startRect={flash.startRect}
          target={flash.target}
          origin={origin}
          isReducedMotion={flash.isReducedMotion}
          onDone={() => clearSnapshotFlash(flash.id)}
        />
      ) : null}
    </View>
  );
}
