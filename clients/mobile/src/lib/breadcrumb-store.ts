/**
 * Lets a screen override the last breadcrumb with live state the route can't
 * express (a game title, a persona name). Same contract as the web's store.
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
