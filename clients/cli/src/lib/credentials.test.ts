import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateDeviceKeyPairs, randomBytes } from "@dodi/crypto";
import { formatAgentAccessKey } from "@dodi/protocol/agent-key";
import { describe, expect, it } from "vitest";

import { EXIT } from "./output";
import { loadStoredCredentials, resolveIdentity, saveStoredCredentials, toStored } from "./credentials";

describe("credentials", () => {
  it("stores the device keys owner-only and reads them back", async () => {
    const env = { DODI_CONFIG_DIR: await mkdtemp(path.join(tmpdir(), "dodi-cfg-")) };
    const keys = generateDeviceKeyPairs();
    await saveStoredCredentials(
      toStored({ apiUrl: "https://p", appUrl: "https://a", deviceId: "d1", name: "n", status: "active" }, keys),
      env,
    );
    const mode = (await stat(path.join(env.DODI_CONFIG_DIR, "credentials.json"))).mode & 0o777;
    expect(mode).toBe(0o600);
    const identity = await resolveIdentity(env);
    expect(identity.deviceId).toBe("d1");
    expect(identity.keys.kem.secretKey).toEqual(keys.kem.secretKey);
  });

  it("prefers DODI_TOKEN over the stored login", async () => {
    const env = {
      DODI_CONFIG_DIR: await mkdtemp(path.join(tmpdir(), "dodi-cfg-")),
      DODI_TOKEN: formatAgentAccessKey({ deviceId: "abcdef123456", seed: randomBytes(32) }),
      DODI_API_URL: "https://self-hosted.example/",
    };
    const identity = await resolveIdentity(env);
    expect(identity.source).toBe("access-key");
    expect(identity.apiUrl).toBe("https://self-hosted.example");
  });

  it("says what to do when not connected or still pending", async () => {
    const env = { DODI_CONFIG_DIR: await mkdtemp(path.join(tmpdir(), "dodi-cfg-")) };
    await expect(resolveIdentity(env)).rejects.toMatchObject({ exitCode: EXIT.unauthorized });
    await saveStoredCredentials(
      toStored({ apiUrl: "https://p", appUrl: "https://a", deviceId: "d", name: "n", status: "pending", pairingCode: "X" }, generateDeviceKeyPairs()),
      env,
    );
    await expect(resolveIdentity(env)).rejects.toMatchObject({ exitCode: EXIT.pending });
    expect((await loadStoredCredentials(env))?.pairingCode).toBe("X");
  });
});
