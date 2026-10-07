import { vi } from "vitest";
import { describeImageOpsContract } from "@dodi/studio/ports.contract";

import { resetFileSystem } from "@/test-support/fake-expo-file-system";

import { nativeImageOps } from "./image-ops";

vi.mock("expo-file-system", () => import("@/test-support/fake-expo-file-system"));
vi.mock("expo-image-manipulator", () => import("@/test-support/fake-image-manipulator"));

// Runs on a geometry-only fake of the native manipulator (sizes from the image
// header, crop/resize in call order); the web runs the same contract on a fake canvas.
describeImageOpsContract("mobile (expo-image-manipulator)", {
  create: () => {
    resetFileSystem();
    return nativeImageOps;
  },
});
