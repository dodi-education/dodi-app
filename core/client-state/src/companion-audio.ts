/**
 * The audio port the companion session drives. Each client implements it with
 * its platform's audio stack (web: AudioWorklet mic + Web Audio playback;
 * mobile: native audio). The session only ever deals in base64 PCM16 LE mono
 * chunks, exactly what the voice providers send and expect:
 *
 *   - microphone: 16 kHz chunks out ({@link MIC_SAMPLE_RATE})
 *   - speaker:    24 kHz chunks in  ({@link SPEAKER_SAMPLE_RATE})
 *
 * `@dodi/ai/voice/pcm` has Hermes-safe base64/PCM helpers for implementations.
 */
export { MIC_SAMPLE_RATE, SPEAKER_SAMPLE_RATE } from "@dodi/ai/voice/pcm";

/** Microphone capture for one listening stretch. Created per activation. */
export interface MicRecorder {
  /**
   * Ask for the microphone (permission prompt where needed) and start emitting
   * base64 PCM16 16 kHz mono chunks to `onChunk` until `stop()`. Rejects with a
   * {@link MicrophoneError} when permission is denied or capture is unsupported
   * here; any other rejection is shown as its message. Echo cancellation and
   * noise suppression should be on (the speaker plays while the mic listens).
   */
  start(onChunk: (base64Pcm16k: string) => void): Promise<void>;
  /** Stop capture and release the device. Idempotent; safe before start settles. */
  stop(): void;
}

/** Voice output: a gapless queue of 24 kHz PCM16 chunks with a master volume. */
export interface AudioSpeaker {
  /** Queue one base64 PCM16 24 kHz mono chunk right after what is already queued. */
  enqueue(base64Pcm24k: string): void;
  /**
   * Cut playback now and drop the queue (barge-in, deaf, mute). Does NOT fire
   * the playback-end callback.
   */
  stop(): void;
  /** Release the output for good (stop + close). The session never reuses it. */
  destroy(): void;
  /** Master volume 0..1; remembered before output exists, ramped while playing. */
  setVolume(volume: number): void;
  /** Seconds of queued audio not yet played (0 when idle). */
  backlogSeconds(): number;
  /**
   * Called when everything queued has played out naturally (never on stop /
   * destroy). One callback per speaker; a later call replaces the earlier one.
   */
  onPlaybackEnd(callback: () => void): void;
  /**
   * Unlock output from inside a user gesture (web autoplay policy). Must stay
   * synchronous; a no-op where the platform needs no unlock.
   */
  primeFromGesture(): void;
  /** Try to make output ready without a gesture. true = audio can play now. */
  tryResume(): Promise<boolean>;
  /** Loudness of what is playing right now, 0..1 (drives the character's jaw). */
  outputLevel(): number;
}

export interface AudioPort {
  createRecorder(): MicRecorder;
  /** A fresh speaker. Cheap: platform output may be created lazily on first use. */
  createSpeaker(): AudioSpeaker;
}

/** Why the microphone could not start (permission denied vs unsupported here). */
export type MicrophoneErrorReason = "permission-denied" | "unsupported";

export class MicrophoneError extends Error {
  readonly reason: MicrophoneErrorReason;

  constructor(reason: MicrophoneErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "MicrophoneError";
    this.reason = reason;
  }
}

/** Structural check (robust across duplicated module instances in bundles). */
export function isMicrophoneError(err: unknown): err is MicrophoneError {
  return (
    err instanceof Error &&
    err.name === "MicrophoneError" &&
    "reason" in err &&
    (err.reason === "permission-denied" || err.reason === "unsupported")
  );
}
