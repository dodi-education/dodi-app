/**
 * Voice-client factory. Picks the realtime voice implementation for the
 * configured provider and returns it behind the provider-neutral
 * {@link VoiceClient} interface, so the session store never branches on provider.
 */

import { GeminiLiveClient } from "./gemini-live-client";
import { XaiVoiceClient } from "./xai-voice-client";
import type { VoiceClient, VoiceClientConfig, VoiceEvent } from "./voice-client";

export function createVoiceClient(
  config: VoiceClientConfig,
  onEvent: (event: VoiceEvent) => void,
): VoiceClient {
  switch (config.provider) {
    case "gemini":
      return new GeminiLiveClient(config, onEvent);
    case "xai":
      return new XaiVoiceClient(config, onEvent);
    default:
      throw new Error(
        `Provider "${config.provider}" does not support voice sessions`,
      );
  }
}
