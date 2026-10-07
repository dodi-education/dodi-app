import { vi } from "vitest";
import { describeCheckpointStoreContract } from "@dodi/studio/ports.contract";

import { resetFileSystem } from "@/test-support/fake-expo-file-system";

import { fileCheckpointStore } from "./checkpoint-store";

vi.mock("expo-file-system", () => import("@/test-support/fake-expo-file-system"));

// The store is stateless over the file system: a "restart" is the same object
// over files that are still there.
describeCheckpointStoreContract("mobile (expo-file-system)", {
  create: () => {
    resetFileSystem();
    return fileCheckpointStore;
  },
  reopen: () => fileCheckpointStore,
});
