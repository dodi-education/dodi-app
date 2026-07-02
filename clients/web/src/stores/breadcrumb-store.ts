/**
 * Lets a page override the final breadcrumb crumb's label with live state that
 * the pathname alone can't express — e.g. the Game Studio's in-progress title,
 * which isn't in the URL. Pages set the leaf on mount/change and clear it on
 * unmount; `Breadcrumbs` prefers it for the last crumb when present.
 */
import { create } from "zustand";

interface BreadcrumbState {
  leaf: string | null;
  setLeaf: (leaf: string | null) => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>((set) => ({
  leaf: null,
  setLeaf: (leaf) => set({ leaf }),
}));
