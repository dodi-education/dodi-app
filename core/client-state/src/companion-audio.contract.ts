/**
 * Behavioural contract for the companion's audio port (`companion-audio.ts`),
 * run by both clients against their own adapter: the web's Web Audio speaker
 * and the app's react-native-audio-api speaker. The cases are what the
 * companion session relies on (gapless queue, backlog, "played out" exactly
 * once, stop/destroy never reporting an end, the volume clamp, the mic
 * permission error and an early stop), not how a platform plays audio.
 *
 * Neither audio stack runs under Node, so both clients drive their adapter on
 * the same fake audio engine exported here: a virtual clock plus the parts of
 * Web Audio (`createBufferSource`) and react-native-audio-api
 * (`createBufferQueueSource`) the adapters use. The fake is deliberately
 * strict where the platforms are: a stopped Web Audio source fires `ended`
 * (asynchronously), and cleared queue buffers report `onBufferEnded`.
 */

import { describe, expect, it } from "vitest";
import { float32ToPcm16Base64 } from "@dodi/ai/voice/pcm";

import {
  type AudioSpeaker,
  isMicrophoneError,
  type MicRecorder,
  SPEAKER_SAMPLE_RATE,
} from "./companion-audio";

// ---------------------------------------------------------------------------
// Fake audio engine (virtual time)
// ---------------------------------------------------------------------------

interface ScheduledEvent {
  at: number;
  seq: number;
  fire(): void;
}

export interface FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
  copyToChannel(source: Float32Array, channel: number): void;
}

export interface FakeGainNode {
  gain: { value: number; setTargetAtTime(target: number, startTime: number, timeConstant: number): void };
  connect(destination: unknown): void;
}

export interface FakeAudioEngine {
  /** Constructor for `globalThis.AudioContext` (web) or react-native-audio-api's `AudioContext`. */
  AudioContext: new (options?: { sampleRate?: number }) => unknown;
  /** Seconds of virtual time since the last reset. */
  readonly time: number;
  /** Let `seconds` of audio play: fires every end that falls inside, in order. */
  advance(seconds: number): Promise<void>;
  /** The master gain value of the newest output, or null while none exists. */
  outputGain(): number | null;
  /** State new contexts start in (a browser without a gesture starts "suspended"). */
  initialState: "running" | "suspended";
  reset(): void;
}

export function createFakeAudioEngine(): FakeAudioEngine {
  let time = 0;
  let seq = 0;
  let events: ScheduledEvent[] = [];
  let gains: FakeGainNode[] = [];

  function schedule(at: number, fire: () => void): ScheduledEvent {
    const event = { at, seq: seq++, fire };
    events.push(event);
    return event;
  }
  function cancel(event: ScheduledEvent | null): void {
    events = events.filter((e) => e !== event);
  }
  const later = (fire: () => void): void => queueMicrotask(fire);

  class Buffer implements FakeAudioBuffer {
    readonly numberOfChannels: number;
    readonly length: number;
    readonly sampleRate: number;
    private readonly channels: Float32Array[];
    constructor(channels: number, length: number, sampleRate: number) {
      this.numberOfChannels = channels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.channels = Array.from({ length: channels }, () => new Float32Array(length));
    }
    get duration(): number {
      return this.length / this.sampleRate;
    }
    getChannelData(channel: number): Float32Array {
      return this.channels[channel];
    }
    copyToChannel(source: Float32Array, channel: number): void {
      this.channels[channel].set(source.subarray(0, this.length));
    }
  }

  /** Web Audio's one-shot source. */
  class BufferSource {
    buffer: Buffer | null = null;
    onended: (() => void) | null = null;
    private ended = false;
    private started = false;
    private end: ScheduledEvent | null = null;
    connect(): void {}
    start(when = 0): void {
      if (this.started) throw new Error("InvalidStateError: start() called twice");
      this.started = true;
      const startAt = Math.max(when, time);
      this.end = schedule(startAt + (this.buffer?.duration ?? 0), () => {
        if (this.ended) return;
        this.ended = true;
        this.onended?.();
      });
    }
    stop(): void {
      if (!this.started) throw new Error("InvalidStateError: stop() before start()");
      if (this.ended) return;
      this.ended = true;
      cancel(this.end);
      // Web Audio dispatches `ended` for a stopped source too, as a later task.
      later(() => this.onended?.());
    }
  }

  /** react-native-audio-api's gapless queue source. */
  class QueueSource {
    onBufferEnded: ((event: { bufferId: string; isLastBufferInQueue: boolean }) => void) | null = null;
    private started = false;
    private nextId = 0;
    private tail = 0;
    private queued: Array<{ id: string; buffer: Buffer; end: ScheduledEvent | null }> = [];
    connect(): void {}
    private play(item: { id: string; buffer: Buffer; end: ScheduledEvent | null }): void {
      const startAt = Math.max(time, this.tail);
      this.tail = startAt + item.buffer.duration;
      item.end = schedule(this.tail, () => {
        this.queued = this.queued.filter((q) => q !== item);
        this.onBufferEnded?.({ bufferId: item.id, isLastBufferInQueue: this.queued.length === 0 });
      });
    }
    enqueueBuffer(buffer: Buffer): string {
      const item = { id: String(++this.nextId), buffer, end: null };
      this.queued.push(item);
      if (this.started) this.play(item);
      return item.id;
    }
    start(when = 0, offset = -1): void {
      // react-native-audio-api 0.13.6 validates its own -1 default (see audio-port.test.ts).
      if (when < 0) throw new RangeError(`when must be a finite non-negative number: ${when}`);
      if (offset && offset < 0) throw new RangeError(`offset must be a finite non-negative number: ${offset}`);
      this.started = true;
      this.tail = time;
      for (const item of this.queued) this.play(item);
    }
    clearBuffers(): void {
      const cleared = this.queued;
      this.queued = [];
      this.tail = time;
      for (const item of cleared) {
        cancel(item.end);
        // Strict: cleared buffers still report their end, asynchronously.
        later(() => this.onBufferEnded?.({ bufferId: item.id, isLastBufferInQueue: true }));
      }
    }
    stop(): void {
      this.clearBuffers();
      this.started = false;
    }
  }

  class Context {
    state: "running" | "suspended" | "closed" = engine.initialState;
    readonly sampleRate: number;
    readonly destination = {};
    constructor(options?: { sampleRate?: number }) {
      this.sampleRate = options?.sampleRate ?? 48000;
    }
    get currentTime(): number {
      return time;
    }
    createGain(): FakeGainNode {
      const node: FakeGainNode = {
        gain: {
          value: 1,
          setTargetAtTime(target) {
            node.gain.value = target;
          },
        },
        connect() {},
      };
      gains.push(node);
      return node;
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        connect() {},
        getFloatTimeDomainData(target: Float32Array) {
          target.fill(0);
        },
      };
    }
    createBuffer(channels: number, length: number, sampleRate: number): Buffer {
      // Web Audio (and the native port) refuse an empty buffer.
      if (length < 1) throw new DOMException(`The number of frames provided (${length}) is invalid`, "NotSupportedError");
      return new Buffer(channels, length, sampleRate);
    }
    createBufferSource(): BufferSource {
      return new BufferSource();
    }
    createBufferQueueSource(): QueueSource {
      return new QueueSource();
    }
    async resume(): Promise<void> {
      if (this.state !== "closed") this.state = "running";
    }
    async suspend(): Promise<void> {
      if (this.state !== "closed") this.state = "suspended";
    }
    async close(): Promise<void> {
      this.state = "closed";
    }
  }

  const engine: FakeAudioEngine = {
    AudioContext: Context,
    get time() {
      return time;
    },
    initialState: "running",
    async advance(seconds) {
      const target = time + seconds;
      for (;;) {
        await Promise.resolve();
        const next = events
          .filter((e) => e.at <= target + 1e-9)
          .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!next) break;
        cancel(next);
        time = Math.max(time, next.at);
        next.fire();
      }
      time = target;
      await Promise.resolve();
    },
    outputGain() {
      return gains.length > 0 ? gains[gains.length - 1].gain.value : null;
    },
    reset() {
      time = 0;
      events = [];
      gains = [];
      engine.initialState = "running";
    },
  };
  return engine;
}

// ---------------------------------------------------------------------------
// Speaker contract
// ---------------------------------------------------------------------------

export interface SpeakerHarness {
  /** A fresh speaker from the adapter under test, over a reset fake engine. */
  createSpeaker(): AudioSpeaker;
  engine: FakeAudioEngine;
  /**
   * Titles of cases this adapter is known to fail; they run as `it.fails`.
   * Every entry needs a TODO naming the bug where the harness is defined.
   */
  knownFailures?: readonly string[];
}

/**
 * Voice providers forward each audio delta as it comes (`voice-client`), and
 * the session enqueues it unchecked from the socket handler.
 */
export const SPEAKER_IGNORES_EMPTY_CHUNK = "ignores an empty chunk (no throw, nothing queued)";

/** A base64 PCM16 24 kHz chunk of `seconds` of a quiet tone. */
export function speakerChunk(seconds: number): string {
  const samples = new Float32Array(Math.round(seconds * SPEAKER_SAMPLE_RATE));
  for (let i = 0; i < samples.length; i++) samples[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / SPEAKER_SAMPLE_RATE);
  return float32ToPcm16Base64(samples);
}

export function describeAudioSpeakerContract(name: string, harness: SpeakerHarness): void {
  const test = (title: string, body: () => Promise<void> | void): void =>
    (harness.knownFailures?.includes(title) ? it.fails : it)(title, body);

  describe(`AudioSpeaker contract: ${name}`, () => {
    function speakerWithEnds(): { speaker: AudioSpeaker; ends: () => number } {
      const speaker = harness.createSpeaker();
      let count = 0;
      speaker.onPlaybackEnd(() => {
        count += 1;
      });
      return { speaker, ends: () => count };
    }

    it("is idle before anything was queued (no backlog, no level)", () => {
      const speaker = harness.createSpeaker();
      expect(speaker.backlogSeconds()).toBe(0);
      expect(speaker.outputLevel()).toBe(0);
    });

    it("queues chunks back to back: the backlog is their total length", () => {
      const speaker = harness.createSpeaker();
      for (let i = 0; i < 3; i++) speaker.enqueue(speakerChunk(0.1));
      expect(speaker.backlogSeconds()).toBeCloseTo(0.3, 3);
    });

    test(SPEAKER_IGNORES_EMPTY_CHUNK, async () => {
      const { speaker, ends } = speakerWithEnds();
      expect(() => speaker.enqueue("")).not.toThrow();
      expect(speaker.backlogSeconds()).toBe(0);
      speaker.enqueue(speakerChunk(0.1));
      expect(() => speaker.enqueue("")).not.toThrow();
      expect(speaker.backlogSeconds()).toBeCloseTo(0.1, 3);
      await harness.engine.advance(0.2);
      expect(ends()).toBe(1);
    });

    it("drains the backlog as the audio plays", async () => {
      const speaker = harness.createSpeaker();
      for (let i = 0; i < 3; i++) speaker.enqueue(speakerChunk(0.1));
      await harness.engine.advance(0.12);
      expect(speaker.backlogSeconds()).toBeCloseTo(0.18, 3);
    });

    it("reports the playback end once, only after the last queued chunk played out", async () => {
      const { speaker, ends } = speakerWithEnds();
      for (let i = 0; i < 3; i++) speaker.enqueue(speakerChunk(0.1));
      await harness.engine.advance(0.25);
      expect(ends()).toBe(0);
      await harness.engine.advance(0.1);
      expect(ends()).toBe(1);
      expect(speaker.backlogSeconds()).toBe(0);
      await harness.engine.advance(1);
      expect(ends()).toBe(1);
    });

    it("plays a chunk that arrives after the queue ran dry from now (no catch-up)", async () => {
      const { speaker, ends } = speakerWithEnds();
      speaker.enqueue(speakerChunk(0.1));
      await harness.engine.advance(1);
      expect(ends()).toBe(1);
      speaker.enqueue(speakerChunk(0.1));
      expect(speaker.backlogSeconds()).toBeCloseTo(0.1, 3);
      await harness.engine.advance(0.2);
      expect(ends()).toBe(2);
    });

    it("stop() drops the queue and never reports a playback end", async () => {
      const { speaker, ends } = speakerWithEnds();
      for (let i = 0; i < 3; i++) speaker.enqueue(speakerChunk(0.1));
      await harness.engine.advance(0.05);
      speaker.stop();
      expect(speaker.backlogSeconds()).toBe(0);
      await harness.engine.advance(1);
      expect(ends()).toBe(0);
    });

    it("plays again after stop() and reports that end", async () => {
      const { speaker, ends } = speakerWithEnds();
      speaker.enqueue(speakerChunk(0.1));
      speaker.stop();
      speaker.enqueue(speakerChunk(0.1));
      expect(speaker.backlogSeconds()).toBeCloseTo(0.1, 3);
      await harness.engine.advance(0.2);
      expect(ends()).toBe(1);
    });

    it("destroy() never reports a playback end, and later calls are harmless", async () => {
      const { speaker, ends } = speakerWithEnds();
      speaker.enqueue(speakerChunk(0.1));
      speaker.destroy();
      await harness.engine.advance(1);
      expect(ends()).toBe(0);
      expect(() => {
        speaker.destroy();
        speaker.stop();
        speaker.setVolume(0.5);
      }).not.toThrow();
      expect(speaker.backlogSeconds()).toBe(0);
      expect(speaker.outputLevel()).toBe(0);
    });

    it("a later onPlaybackEnd replaces the earlier callback", async () => {
      const speaker = harness.createSpeaker();
      const calls: string[] = [];
      speaker.onPlaybackEnd(() => calls.push("first"));
      speaker.onPlaybackEnd(() => calls.push("second"));
      speaker.enqueue(speakerChunk(0.1));
      await harness.engine.advance(0.2);
      expect(calls).toEqual(["second"]);
    });

    it("remembers the volume set before any output exists", () => {
      const speaker = harness.createSpeaker();
      speaker.setVolume(0.3);
      speaker.enqueue(speakerChunk(0.05));
      expect(harness.engine.outputGain()).toBeCloseTo(0.3, 5);
    });

    it("clamps the volume to 0..1, before and while playing", () => {
      const speaker = harness.createSpeaker();
      speaker.setVolume(2);
      speaker.enqueue(speakerChunk(0.05));
      expect(harness.engine.outputGain()).toBe(1);
      speaker.setVolume(-0.5);
      expect(harness.engine.outputGain()).toBe(0);
      speaker.setVolume(0.4);
      expect(harness.engine.outputGain()).toBeCloseTo(0.4, 5);
    });

    it("tryResume() resolves true when the output can play", async () => {
      const speaker = harness.createSpeaker();
      await expect(speaker.tryResume()).resolves.toBe(true);
    });

    it("primeFromGesture() stays synchronous", () => {
      const speaker = harness.createSpeaker();
      expect(speaker.primeFromGesture()).toBeUndefined();
    });

    it("outputLevel() stays within 0..1 while playing", () => {
      const speaker = harness.createSpeaker();
      speaker.enqueue(speakerChunk(0.1));
      const level = speaker.outputLevel();
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    });
  });
}

// ---------------------------------------------------------------------------
// Microphone contract
// ---------------------------------------------------------------------------

export interface MicHarness {
  /** A fresh recorder from the adapter under test; the platform grants the mic unless denied. */
  createRecorder(): MicRecorder;
  /** Make the platform refuse microphone permission from now on. */
  denyPermission(): void;
  /** Whether the platform's capture device is open right now. */
  isMicOpen(): boolean;
}

export function describeMicRecorderContract(name: string, harness: MicHarness): void {
  describe(`MicRecorder contract: ${name}`, () => {
    it("rejects with a permission-denied MicrophoneError when the mic is refused", async () => {
      harness.denyPermission();
      const recorder = harness.createRecorder();
      const error: unknown = await recorder.start(() => {}).then(
        () => null,
        (err: unknown) => err,
      );
      expect(isMicrophoneError(error)).toBe(true);
      expect((error as { reason: string }).reason).toBe("permission-denied");
      expect(harness.isMicOpen()).toBe(false);
    });

    it("stop() before start() settles leaves the mic closed and emits nothing", async () => {
      const recorder = harness.createRecorder();
      const chunks: string[] = [];
      const started = recorder.start((chunk) => chunks.push(chunk));
      recorder.stop();
      await expect(started).resolves.toBeUndefined();
      expect(harness.isMicOpen()).toBe(false);
      expect(chunks).toEqual([]);
    });

    it("stop() is idempotent and safe without a start", () => {
      const recorder = harness.createRecorder();
      expect(() => {
        recorder.stop();
        recorder.stop();
      }).not.toThrow();
      expect(harness.isMicOpen()).toBe(false);
    });
  });
}
