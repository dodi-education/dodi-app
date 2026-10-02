/**
 * The device's Game Studio build (see `@dodi/studio` build-manager): owned by
 * this store rather than the studio screen, so a build keeps running while the
 * parent moves around the app or switches to another app (the OS keeps it
 * alive as a background task, see `background-build.tsx`).
 */
import { useStore } from "zustand";
import { createBuildManager, type StudioBuildState } from "@dodi/studio/build-manager";

import { createMobileStudioPorts } from "@/adapters/studio-ports";

export const studioBuildStore = createBuildManager(createMobileStudioPorts());

export function useStudioBuild<T>(selector: (state: StudioBuildState) => T): T {
  return useStore(studioBuildStore.store, selector);
}
