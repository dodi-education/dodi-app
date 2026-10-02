/**
 * The app's audio port for the companion session (`@dodi/client-state`
 * companion-audio), on react-native-audio-api:
 *
 *   - microphone: the native recorder (16 kHz mono requested; resampled here if
 *     the device delivers another rate) → base64 PCM16 chunks of ~100 ms.
 *   - speaker: an AudioContext at 24 kHz with one buffer-queue source (gapless
 *     streaming) → analyser (the jaw's level) → master gain → output.
 *
 * The conversation is full duplex like the web's: the mic stays open while
 * dodi speaks, so the platform echo canceller must be on. iOS: the
 * playAndRecord / voiceChat session (speaker by default, Bluetooth headsets
 * allowed). Android: the recorder opens its stream with the VoiceCommunication
 * input preset (patches/react-native-audio-api@0.13.6.patch).
 *
 * Audio only runs in the foreground: the app config turns off the library's
 * background-audio mode and foreground service, and the session ends when the
 * app leaves the foreground (lib/companion-session).
 */
import {
  type AnalyserNode,
  type AudioBufferQueueSourceNode,
  AudioContext,
  AudioManager,
  AudioRecorder,
  type GainNode,
} from "react-native-audio-api";
import {
  float32ToPcm16Base64,
  MIC_SAMPLE_RATE,
  pcm16Base64ToFloat32,
  resampleLinear,
  SPEAKER_SAMPLE_RATE,
} from "@dodi/ai/voice/pcm";
import {
  type AudioPort,
  type AudioSpeaker,
  type MicRecorder,
  MicrophoneError,
} from "@dodi/client-state/companion-audio";

/** Mic chunk length: 100 ms at 16 kHz (what the voice providers handle well). */
const MIC_CHUNK_FRAMES = MIC_SAMPLE_RATE / 10;
/** Analyser window for the output level (~21 ms at 24 kHz). */
const LEVEL_FFT_SIZE = 512;
/** Volume ramp time constant: slider drags don't click. */
const VOLUME_RAMP_SECONDS = 0.02;

// ---------------------------------------------------------------------------
// Audio session (iOS category/mode; Android audio focus)
// ---------------------------------------------------------------------------

let isSessionConfigured = false;
let sessionUsers = 0;

function configureSession(): void {
  if (isSessionConfigured) return;
  isSessionConfigured = true;
  // voiceChat: the system's voice processing (echo cancellation, gain control)
  // for a full-duplex conversation; defaultToSpeaker keeps dodi on the loud
  // speaker instead of the earpiece. No-op on Android.
  AudioManager.setAudioSessionOptions({
    iosCategory: "playAndRecord",
    iosMode: "voiceChat",
    iosOptions: ["defaultToSpeaker", "allowBluetoothHFP"],
  });
}

/** One user (a recorder or a speaker) needs the session active. */
async function acquireSession(): Promise<void> {
  configureSession();
  await addSessionUser();
}

/** Counts a user in; the first one activates the session. */
async function addSessionUser(): Promise<void> {
  sessionUsers += 1;
  if (sessionUsers === 1) {
    await AudioManager.setAudioSessionActivity(true).catch((err: unknown) => {
      console.warn("[audio] session activation failed:", err);
    });
  }
}

/**
 * A short playback outside the companion session (the snapshot shutter, see
 * adapters/shutter-sound) holds the session like a speaker does, so it never
 * deactivates it under a running conversation, and gives it back (other apps'
 * audio resumes on iOS) when nobody else needs it. It leaves the session
 * options alone: the companion's voiceChat setup is applied when the
 * companion starts and stays in force. Pair with `releasePlaybackSession`.
 */
export function acquirePlaybackSession(): Promise<void> {
  return addSessionUser();
}

/** Ends a hold taken with `acquirePlaybackSession`. */
export function releasePlaybackSession(): void {
  releaseSession();
}

/** The user is done; the last one gives the session (and other apps' audio) back. */
function releaseSession(): void {
  if (sessionUsers === 0) return;
  sessionUsers -= 1;
  if (sessionUsers === 0) {
    void AudioManager.setAudioSessionActivity(false).catch(() => {
      // Deactivating while another app holds audio fails harmlessly.
    });
  }
}

// ---------------------------------------------------------------------------
// Microphone
// ---------------------------------------------------------------------------

async function ensureMicPermission(): Promise<void> {
  let status = await AudioManager.checkRecordingPermissions();
  if (status !== "Granted") status = await AudioManager.requestRecordingPermissions();
  if (status !== "Granted") throw new MicrophoneError("permission-denied");
}

// The native recorder is one device stream shared by every MicRecorder: the
// latest started one owns its audio callback, and only the owner may stop it
// (an older recorder stopping late never cuts a newer one off). Starts and
// stops are serialized so a stop still settling never races the next start.
let nativeRecorder: AudioRecorder | null = null;
let recorderOwner: object | null = null;
let isNativeRecording = false;
let recorderChain: Promise<void> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = recorderChain.then(task, task);
  recorderChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Release the device stream if `owner` still holds it. */
function stopNativeFor(owner: object): Promise<void> {
  return serialized(async () => {
    if (recorderOwner !== owner) return;
    recorderOwner = null;
    const rec = nativeRecorder;
    rec?.clearOnAudioReady();
    rec?.clearOnError();
    if (!isNativeRecording) return;
    isNativeRecording = false;
    await rec?.stop().catch(() => undefined);
    releaseSession();
  });
}

function createNativeRecorder(): MicRecorder {
  const token = {};
  let isStopped = false;

  return {
    async start(onChunk) {
      await ensureMicPermission();
      // Stopped while the permission prompt was open: never open the mic.
      if (isStopped) return;

      await serialized(async () => {
        if (isStopped) return;
        // The record-capable category must be in place before the native audio
        // engine exists: the patched engine enables voice processing (echo
        // cancellation) at creation, which needs it.
        configureSession();
        const rec = (nativeRecorder ??= new AudioRecorder());
        const ready = rec.onAudioReady(
          { sampleRate: MIC_SAMPLE_RATE, bufferLength: MIC_CHUNK_FRAMES, channelCount: 1 },
          ({ buffer, numFrames }) => {
            if (isStopped) return;
            const channel = buffer.getChannelData(0);
            const frames = numFrames > 0 && numFrames < channel.length ? channel.subarray(0, numFrames) : channel;
            const samples = resampleLinear(frames, buffer.sampleRate, MIC_SAMPLE_RATE);
            onChunk(float32ToPcm16Base64(samples));
          },
        );
        // Not MicrophoneError("unsupported"): that maps to the web's HTTPS hint.
        if (ready.status === "error") throw new Error(ready.message);
        recorderOwner = token;
        rec.onError((event) => {
          console.warn("[audio] recorder error:", event.message);
        });
        if (isNativeRecording) return;

        await acquireSession();
        const started = await rec.start();
        if (started.status === "error") {
          releaseSession();
          if (recorderOwner === token) {
            recorderOwner = null;
            rec.clearOnAudioReady();
            rec.clearOnError();
          }
          throw new Error(started.message);
        }
        isNativeRecording = true;
      });

      // Stopped while the stream was opening: release it now.
      if (isStopped) void stopNativeFor(token);
    },

    stop() {
      if (isStopped) return;
      isStopped = true;
      void stopNativeFor(token);
    },
  };
}

// ---------------------------------------------------------------------------
// Speaker
// ---------------------------------------------------------------------------

interface SpeakerGraph {
  context: AudioContext;
  queue: AudioBufferQueueSourceNode;
  analyser: AnalyserNode;
  gain: GainNode;
}

function createNativeSpeaker(): AudioSpeaker {
  let graph: SpeakerGraph | null = null;
  let isDestroyed = false;
  let volume = 1;
  // Context time at which everything enqueued so far has played out.
  let playsOutAt = 0;
  // Buffers enqueued since the last stop that have not finished playing.
  const pending = new Set<string>();
  let playbackEnd: (() => void) | null = null;
  let levelSamples: Float32Array<ArrayBuffer> | null = null;

  function ensureGraph(): SpeakerGraph | null {
    if (graph) return graph;
    if (isDestroyed) return null;
    void acquireSession();
    const context = new AudioContext({ sampleRate: SPEAKER_SAMPLE_RATE });
    const gain = context.createGain();
    gain.gain.value = volume;
    gain.connect(context.destination);
    // Analyser before the gain: the jaw follows the voice, not the volume knob.
    const analyser = context.createAnalyser();
    analyser.fftSize = LEVEL_FFT_SIZE;
    analyser.connect(gain);
    // One queue source for the speaker's life: an empty queue renders silence
    // and resumes with the next buffer, so chunks play back to back.
    const queue = context.createBufferQueueSource();
    queue.connect(analyser);
    queue.onBufferEnded = (event) => {
      // Buffers cleared by stop() (or finishing in the same instant) are no
      // longer pending: their end is not "everything played out".
      if (!pending.delete(String(event.bufferId))) return;
      if (pending.size === 0) playbackEnd?.();
    };
    try {
      // Explicit (0, 0): react-native-audio-api 0.13.6's JS start() defaults
      // `offset` to -1 and then rejects that very default with a RangeError, so a
      // bare start() always throws. Natively the offset is ignored while the
      // queue is empty, so (0, 0) here is exactly a plain start.
      queue.start(0, 0);
    } catch (err) {
      // Don't leak the half-built context (and its audio-session user); the
      // next call builds a fresh graph.
      void context
        .close()
        .catch(() => undefined)
        .finally(releaseSession);
      throw err;
    }
    graph = { context, queue, analyser, gain };
    return graph;
  }

  return {
    enqueue(chunk) {
      const g = ensureGraph();
      if (!g) return;
      const samples = pcm16Base64ToFloat32(chunk) as Float32Array<ArrayBuffer>;
      if (samples.length === 0) return;
      const buffer = g.context.createBuffer(1, samples.length, SPEAKER_SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);
      pending.add(g.queue.enqueueBuffer(buffer));
      const now = g.context.currentTime;
      playsOutAt = Math.max(now, playsOutAt) + buffer.duration;
    },

    stop() {
      pending.clear();
      playsOutAt = 0;
      graph?.queue.clearBuffers();
    },

    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      pending.clear();
      playbackEnd = null;
      const g = graph;
      graph = null;
      levelSamples = null;
      if (!g) return;
      g.queue.onBufferEnded = null;
      g.queue.clearBuffers();
      g.queue.stop();
      void g.context
        .close()
        .catch(() => undefined)
        .finally(releaseSession);
    },

    setVolume(next) {
      volume = Math.min(1, Math.max(0, next));
      if (graph) {
        graph.gain.gain.setTargetAtTime(volume, graph.context.currentTime, VOLUME_RAMP_SECONDS);
      }
    },

    backlogSeconds() {
      if (!graph) return 0;
      return Math.max(0, playsOutAt - graph.context.currentTime);
    },

    onPlaybackEnd(callback) {
      playbackEnd = callback;
    },

    // Native audio needs no user-gesture unlock.
    primeFromGesture() {},

    async tryResume() {
      const g = ensureGraph();
      if (!g) return false;
      if (g.context.state !== "running") {
        await g.context.resume().catch(() => undefined);
      }
      // Native output can always start; a still-suspended context resumes with
      // the first buffer (no autoplay policy to wait for).
      return true;
    },

    outputLevel() {
      if (!graph) return 0;
      levelSamples ??= new Float32Array(graph.analyser.fftSize);
      graph.analyser.getFloatTimeDomainData(levelSamples);
      let sum = 0;
      for (let i = 0; i < levelSamples.length; i++) sum += levelSamples[i] * levelSamples[i];
      const rms = Math.sqrt(sum / levelSamples.length);
      // Scaled like the web's: normal speech reaches about 1.
      return Math.min(1, rms * 5);
    },
  };
}

export const nativeAudioPort: AudioPort = {
  createRecorder: createNativeRecorder,
  createSpeaker: createNativeSpeaker,
};
