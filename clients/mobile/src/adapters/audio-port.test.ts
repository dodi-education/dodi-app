import { describe, expect, it, vi } from "vitest";

/**
 * react-native-audio-api 0.13.6's AudioBufferQueueSourceNode.start() defaults
 * `offset` to -1 and then rejects it with its own check (src/core/
 * AudioBufferQueueSourceNode.ts), so `queue.start()` with no arguments always
 * throws "offset must be a finite non-negative number: -1". On a Pixel 10 this
 * broke the speaker's graph setup and the voice companion never got past
 * "connecting". The mock mirrors that JS-side validation verbatim.
 */
vi.mock("react-native-audio-api", () => {
  class AudioBufferQueueSourceNode {
    onBufferEnded: unknown = null;
    connect(): void {}
    enqueueBuffer(): string {
      return "1";
    }
    clearBuffers(): void {}
    stop(): void {}
    start(when: number = 0, offset: number = -1): void {
      if (when < 0) throw new RangeError(`when must be a finite non-negative number: ${when}`);
      if (offset && offset < 0) throw new RangeError(`offset must be a finite non-negative number: ${offset}`);
    }
  }
  class AudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    createGain() {
      return { gain: { value: 1, setTargetAtTime: () => {} }, connect: () => {} };
    }
    createAnalyser() {
      return { fftSize: 512, connect: () => {}, getFloatTimeDomainData: () => {} };
    }
    createBufferQueueSource() {
      return new AudioBufferQueueSourceNode();
    }
    async resume(): Promise<void> {}
    async close(): Promise<void> {}
  }
  return {
    AudioContext,
    AudioRecorder: class {},
    AudioManager: {
      setAudioSessionOptions: () => {},
      setAudioSessionActivity: async () => {},
      requestRecordingPermissions: async () => "Granted",
      checkRecordingPermissions: async () => "Granted",
    },
  };
});

describe("native speaker", () => {
  it("starts its playback queue (tryResume) despite the library's start() default", async () => {
    const { nativeAudioPort } = await import("./audio-port");
    const speaker = nativeAudioPort.createSpeaker();
    await expect(speaker.tryResume()).resolves.toBe(true);
    speaker.destroy();
  });
});
