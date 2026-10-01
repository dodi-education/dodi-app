import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ dodi: { request: vi.fn() } }));

import type { Account } from "@dodi/types/database";

import {
  interfacePreferencesOf,
  patchInterfacePreferences,
  useAccountStore,
} from "./account-store";

/** The selector `useIs3dEnabled` runs, evaluated against the current store. */
function is3dEnabled(): boolean {
  return interfacePreferencesOf(useAccountStore.getState().account).is_3d_enabled !== false;
}

describe("interface preferences", () => {
  beforeEach(() => {
    useAccountStore.getState().reset();
  });

  it("reads as empty for an unloaded account or a malformed column", () => {
    expect(interfacePreferencesOf(null)).toEqual({});
    expect(
      interfacePreferencesOf({ interface_preferences: [] } as unknown as Account),
    ).toEqual({});
  });

  it("defaults the 3D character to on until it is turned off", () => {
    expect(is3dEnabled()).toBe(true);

    useAccountStore.setState({
      account: { interface_preferences: {} } as unknown as Account,
      loaded: true,
    });
    expect(is3dEnabled()).toBe(true);

    patchInterfacePreferences({ is_3d_enabled: false });
    expect(is3dEnabled()).toBe(false);

    patchInterfacePreferences({ is_3d_enabled: true });
    expect(is3dEnabled()).toBe(true);
  });
});
