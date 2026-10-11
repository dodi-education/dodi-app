import { generateDeviceKeyPairs, toBase64Url } from "@dodi/crypto";
import { describe, expect, it } from "vitest";

import {
  agentBuildProviders,
  openAgentProviderKeys,
  sealAgentProviderKeys,
  selectAgentProviderKeys,
} from "./agent-provider-keys";

describe("agent provider keys", () => {
  const config = {
    voiceProvider: "gemini" as const,
    gameProvider: "anthropic" as const,
    imageProvider: "gemini" as const,
    thinkingProvider: "anthropic" as const,
  };
  const keys = { anthropic: "sk-ant", gemini: "g-key", xai: "x-key" };

  it("hands out only the build providers' keys, never voice-only ones", () => {
    expect(agentBuildProviders(config).sort()).toEqual(["anthropic", "gemini"]);
    expect(selectAgentProviderKeys({ voiceProvider: "xai", gameProvider: "anthropic" } as never, keys).keys).toEqual({
      anthropic: "sk-ant",
    });
  });

  it("skips dodi AI and providers without a key", () => {
    expect(agentBuildProviders({ gameProvider: "dodi", imageProvider: "venice" } as never)).toEqual(["venice"]);
    expect(selectAgentProviderKeys({ imageProvider: "venice" } as never, keys).keys).toEqual({});
  });

  it("seals to the agent's key and only that key opens it", () => {
    const agent = generateDeviceKeyPairs();
    const other = generateDeviceKeyPairs();
    const bundle = selectAgentProviderKeys(config, keys);
    const sealed = sealAgentProviderKeys(toBase64Url(agent.kem.publicKey), bundle);
    expect(sealed).not.toContain("sk-ant");
    expect(openAgentProviderKeys(sealed, agent.kem.secretKey)).toEqual(bundle);
    expect(() => openAgentProviderKeys(sealed, other.kem.secretKey)).toThrow();
  });
});
