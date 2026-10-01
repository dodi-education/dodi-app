/**
 * The device's Game Studio build (see `@dodi/studio` build-manager): owned by
 * this store rather than the studio screen, so a build keeps running while the
 * parent moves around the app, and a reload can resume it from its checkpoint.
 */

import { useStore } from "zustand";
import { createBuildManager, type StudioBuildState } from "@dodi/studio/build-manager";

import { createWebStudioPorts } from "@/lib/games/studio-ports";

export const studioBuildStore = createBuildManager(createWebStudioPorts());

export function useStudioBuild<T>(selector: (state: StudioBuildState) => T): T {
  return useStore(studioBuildStore.store, selector);
}
