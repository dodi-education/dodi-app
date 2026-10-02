import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The snapshot shutter (web parity: snapshot-flash plays snapshot.mp3 on
 * mount). Best-effort: failures never reach the UI. It must not disturb a
 * running voice conversation's audio session: no session options, and no
 * deactivation while the companion still holds it.
 */
const lib = vi.hoisted(() => {
  const state = {
    sessionActivity: [] as boolean[],
    sessionOptionsCalls: 0,
    decodeError: null as Error | null,
    contexts: [] as {
      closed: boolean;
      sources: { starts: [number?, number?][]; onEnded: (() => void) | null; connectedTo: unknown }[];
    }[],
  };
  return state;
});

vi.mock("./shutter-sound-asset", () => ({ SHUTTER_SOUND_MODULE: 1 }));

vi.mock("expo-asset", () => ({
  Asset: {
    fromModule: () => ({ localUri: "file:///cache/snapshot.mp3", downloadAsync: async () => {} }),
  },
}));

vi.mock("expo-file-system", () => ({
  File: class {
    async arrayBuffer(): Promise<ArrayBuffer> {
      return new ArrayBuffer(16);
    }
  },
}));

vi.mock("react-native-audio-api", () => {
  // Mirrors react-native-audio-api 0.13.6's JS-side argument checks.
  class AudioBufferSourceNode {
    buffer: unknown = null;
    record: { starts: [number?, number?][]; onEnded: (() => void) | null; connectedTo: unknown } = {
      starts: [],
      onEnded: null,
      connectedTo: null,
    };
    set onEnded(callback: (() => void) | null) {
      this.record.onEnded = callback;
    }
    connect(node: unknown): void {
      this.record.connectedTo = node;
    }
    start(when: number = 0, offset: number = 0): void {
      if (when < 0) throw new RangeError(`when must be a finite non-negative number: ${when}`);
      if (offset < 0) throw new RangeError(`offset must be a finite non-negative number: ${offset}`);
      this.record.starts.push([when, offset]);
    }
  }
  class AudioBufferQueueSourceNode {
    onBufferEnded: unknown = null;
    connect(): void {}
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
    destination = { kind: "destination" };
    record = { closed: false, sources: [] as AudioBufferSourceNode["record"][] };
    constructor() {
      lib.contexts.push(this.record);
    }
    async decodeAudioData(): Promise<{ duration: number }> {
      if (lib.decodeError) throw lib.decodeError;
      return { duration: 0.3 };
    }
    createBufferSource(): AudioBufferSourceNode {
      const node = new AudioBufferSourceNode();
      this.record.sources.push(node.record);
      return node;
    }
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
    async close(): Promise<void> {
      this.record.closed = true;
    }
  }
  return {
    AudioContext,
    AudioRecorder: class {},
    AudioManager: {
      setAudioSessionOptions: () => {
        lib.sessionOptionsCalls += 1;
      },
      setAudioSessionActivity: async (enabled: boolean) => {
        lib.sessionActivity.push(enabled);
      },
      requestRecordingPermissions: async () => "Granted",
      checkRecordingPermissions: async () => "Granted",
    },
  };
});

beforeEach(() => {
  lib.sessionActivity = [];
  lib.sessionOptionsCalls = 0;
  lib.decodeError = null;
  lib.contexts = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("shutter sound", () => {
  it("plays the mp3 from the start and closes its context when it ends", async () => {
    const { playShutterSound } = await import("./shutter-sound");

    playShutterSound();

    await vi.waitFor(() => expect(lib.contexts[0]?.sources[0]?.starts).toEqual([[0, 0]]));
    const [context] = lib.contexts;
    expect(context.sources[0].connectedTo).toEqual({ kind: "destination" });
    expect(lib.sessionActivity).toEqual([true]);

    context.sources[0].onEnded?.();

    await vi.waitFor(() => expect(lib.sessionActivity).toEqual([true, false]));
    expect(context.closed).toBe(true);
    expect(lib.sessionOptionsCalls).toBe(0);
  });

  it("leaves a running voice session's audio session alone", async () => {
    const { nativeAudioPort } = await import("./audio-port");
    const { playShutterSound } = await import("./shutter-sound");
    const speaker = nativeAudioPort.createSpeaker();
    await speaker.tryResume();
    await vi.waitFor(() => expect(lib.sessionActivity).toEqual([true]));
    const optionsBefore = lib.sessionOptionsCalls;

    playShutterSound();
    await vi.waitFor(() => expect(lib.contexts[1]?.sources[0]?.starts).toEqual([[0, 0]]));
    lib.contexts[1].sources[0].onEnded?.();
    await vi.waitFor(() => expect(lib.contexts[1].closed).toBe(true));
    await Promise.resolve();

    // Still active for the conversation; the shot set no options of its own.
    expect(lib.sessionActivity).toEqual([true]);
    expect(lib.sessionOptionsCalls).toBe(optionsBefore);

    speaker.destroy();
    await vi.waitFor(() => expect(lib.sessionActivity).toEqual([true, false]));
  });

  it("never throws into the UI and gives the session back when playback fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    lib.decodeError = new Error("decode failed");
    const { playShutterSound } = await import("./shutter-sound");

    expect(() => playShutterSound()).not.toThrow();

    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("[shutter] sound failed:", lib.decodeError));
    await vi.waitFor(() => expect(lib.sessionActivity).toEqual([true, false]));
    expect(lib.contexts[0].closed).toBe(true);
  });

  it("closes the context even if the end event never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { playShutterSound } = await import("./shutter-sound");
      playShutterSound();
      await vi.waitFor(() => expect(lib.contexts[0]?.sources[0]?.starts).toEqual([[0, 0]]));

      await vi.advanceTimersByTimeAsync(300 + 1000);

      expect(lib.contexts[0].closed).toBe(true);
      expect(lib.sessionActivity).toEqual([true, false]);
    } finally {
      vi.useRealTimers();
    }
  });
});
