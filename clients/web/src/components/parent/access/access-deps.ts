import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import type { AccessDeps } from "@dodi/client-state/authorized-clients";
import { createIndexedDbDeviceKeystore } from "@dodi/vault";

/** Access needs the platform API plus the vault (to wrap its key to a robot or agent). */
export const accessDeps = (): AccessDeps => ({ api: dodi, vault: clientState.vault });

const deviceKeystore = createIndexedDbDeviceKeystore();

/** This browser's vault device id, so the Access list can mark it as "This device". */
export async function currentDeviceId(): Promise<string | null> {
  try {
    return (await deviceKeystore.load())?.deviceId ?? null;
  } catch {
    return null;
  }
}
