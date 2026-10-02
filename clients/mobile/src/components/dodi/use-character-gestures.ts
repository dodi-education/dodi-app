import { useState } from "react";
import type { GestureResponderHandlers } from "react-native";
import { CharacterGestureRecognizer } from "@dodi/character/character-gestures";

/**
 * Touches on the 3D character (web: lib/character/character-gestures.ts, the
 * same recognizer): a drag that starts on the character turns it, a still
 * press is a tap. Pinch zoom is off for now: expo-gl fixes the drawing
 * buffer's size, so the surface cannot grow with the zoom as the web's does.
 */
export interface CharacterGestureTarget {
  /** The point, in the host view's coordinates, lies on the character. */
  hitsCharacter(x: number, y: number): boolean;
  orbitBy(dx: number, dy: number): void;
  onTap?: () => void;
}

function characterResponder(target: () => CharacterGestureTarget | null): GestureResponderHandlers {
  // The hit test runs when the responder is asked (it knows the touch's local
  // point); the recognizer then hears the press as one on the character.
  let isPressOnCharacter = false;
  // One finger turns the character; further fingers are ignored.
  let grantedId: number | null = null;
  const recognizer = new CharacterGestureRecognizer({
    hitsCharacter: () => isPressOnCharacter,
    orbitBy: (dx, dy) => target()?.orbitBy(dx, dy),
    zoomBy: () => {},
  });

  // The responder ends when the last finger lifts (or the system cancels).
  function end(isCancelled: boolean): void {
    if (grantedId === null) return;
    const gesture = recognizer.pointerUp(grantedId);
    grantedId = null;
    const isTap = recognizer.takeTap();
    if (gesture && !gesture.wasDrag && isTap && !isCancelled) target()?.onTap?.();
  }

  return {
    onStartShouldSetResponder: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      isPressOnCharacter = target()?.hitsCharacter(locationX, locationY) ?? false;
      return isPressOnCharacter;
    },
    onResponderGrant: (event) => {
      const { identifier, pageX, pageY } = event.nativeEvent;
      grantedId = Number(identifier);
      recognizer.pointerDown(grantedId, pageX, pageY);
    },
    onResponderMove: (event) => {
      const touch = event.nativeEvent.touches.find((t) => Number(t.identifier) === grantedId);
      if (touch && grantedId !== null) recognizer.pointerMove(grantedId, touch.pageX, touch.pageY);
    },
    onResponderRelease: () => end(false),
    onResponderTerminate: () => end(true),
    // A turn in progress keeps its touch; a scroll view must not take it over.
    onResponderTerminationRequest: () => false,
  };
}

/** Responder handlers for the character's host view; `target` is read when a touch comes. */
export function useCharacterGestures(target: () => CharacterGestureTarget | null): GestureResponderHandlers {
  const [handlers] = useState(() => characterResponder(target));
  return handlers;
}
