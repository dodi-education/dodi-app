import type { AccessDeps } from "@dodi/client-state/authorized-clients";

import { api, mobilePlatform } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

/** Access needs the platform API plus the vault (to wrap its key to a robot or agent). */
export const accessDeps = (): AccessDeps => ({ api, vault: clientState.vault });

/** This app's vault device id, so the Access list can mark it as "This device". */
export async function currentDeviceId(): Promise<string | null> {
  try {
    return (await mobilePlatform.deviceKeystore.load())?.deviceId ?? null;
  } catch {
    return null;
  }
}
