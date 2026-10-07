import type { StudioPorts } from "@dodi/studio/ports";
import {
  describeCheckpointStoreContract,
  describeImageOpsContract,
} from "@dodi/studio/ports.contract";

import { installFakeCanvas } from "@/test-support/fake-canvas";
import { installFreshIndexedDb } from "@/test-support/fake-indexeddb";

// The ports exactly as the web build manager gets them (createWebStudioPorts):
// IndexedDB checkpoints (fake-indexeddb) and the canvas image helpers (on a
// geometry-only fake canvas: Node has no raster engine).
installFreshIndexedDb();
installFakeCanvas();
const { createWebStudioPorts } = await import("./studio-ports");

function ports(): StudioPorts {
  return createWebStudioPorts();
}

describeCheckpointStoreContract("web (IndexedDB)", {
  create: () => {
    installFreshIndexedDb();
    const store = ports().checkpoints;
    if (!store) throw new Error("no checkpoint store although IndexedDB exists");
    return store;
  },
  reopen: () => ports().checkpoints!,
});

describeImageOpsContract("web (canvas)", {
  create: () => ports().images,
});
