import { useState } from "react";

/**
 * Dialog state that keeps its subject through the close animation, so the
 * content doesn't flip to its empty state while fading out (web: the lists'
 * useDialogTarget).
 */
export function useDialogTarget<T>(): {
  target: T | null;
  isOpen: boolean;
  show: (next: T) => void;
  hide: () => void;
} {
  const [target, setTarget] = useState<T | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  return {
    target,
    isOpen,
    show: (next: T) => {
      setTarget(next);
      setIsOpen(true);
    },
    hide: () => setIsOpen(false),
  };
}
