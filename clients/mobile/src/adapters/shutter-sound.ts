/**
 * The snapshot shutter sound (web: components/snapshots/snapshot-flash plays
 * /sounds/snapshot.mp3 when the flash mounts) on react-native-audio-api.
 *
 * Best-effort, like the web's `audio.play().catch(() => {})`: any failure
 * (asset, decode, audio output) only logs and never reaches the UI.
 *
 * Each shot gets its own short-lived AudioContext with one buffer source,
 * closed when the sound ends. The audio session is held through audio-port's
 * counter (`acquirePlaybackSession`), so a shot during a voice conversation
 * never deactivates the session or touches its options, and a shot outside
 * one hands the session back afterwards (iOS; on Android both are no-ops).
 */
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { AudioContext } from "react-native-audio-api";

import { acquirePlaybackSession, releasePlaybackSession } from "./audio-port";
import { SHUTTER_SOUND_MODULE } from "./shutter-sound-asset";

/** Closes the context this long after the sound should have ended, if the end event never comes. */
const END_GRACE_MS = 1000;

let loadingBytes: Promise<ArrayBuffer> | null = null;

/** The mp3's bytes, read once (a failed read retries on the next shot). */
function loadBytes(): Promise<ArrayBuffer> {
  if (!loadingBytes) {
    loadingBytes = (async () => {
      const asset = Asset.fromModule(SHUTTER_SOUND_MODULE);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error("shutter sound asset has no local file");
      return new File(asset.localUri).arrayBuffer();
    })();
    loadingBytes.catch(() => {
      loadingBytes = null;
    });
  }
  return loadingBytes;
}

async function play(): Promise<void> {
  const bytes = await loadBytes();
  await acquirePlaybackSession();

  let context: AudioContext | null = null;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let isFinished = false;
  const finish = (): void => {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(endTimer);
    const closing = context ? context.close().catch(() => undefined) : Promise.resolve();
    void closing.finally(releasePlaybackSession);
  };

  try {
    context = new AudioContext();
    // A copy: the cached bytes stay intact for the next shot.
    const buffer = await context.decodeAudioData(bytes.slice(0));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onEnded = finish;
    // Explicit (when, offset): react-native-audio-api 0.13.6 validates them in
    // JS (its buffer-queue node even rejects its own default offset); (0, 0)
    // is a plain "play from the start, now".
    source.start(0, 0);
    endTimer = setTimeout(finish, buffer.duration * 1000 + END_GRACE_MS);
  } catch (err) {
    finish();
    throw err;
  }
}

/** Plays the shutter once. Never throws. */
export function playShutterSound(): void {
  play().catch((err: unknown) => {
    console.warn("[shutter] sound failed:", err);
  });
}
