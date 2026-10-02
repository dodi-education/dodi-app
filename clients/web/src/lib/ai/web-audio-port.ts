/**
 * The browser's audio port for the companion session (`@dodi/client-state`
 * companion-audio): the AudioWorklet microphone recorder (getUserMedia with
 * echo cancellation + noise suppression, 16 kHz PCM16 out) and the Web Audio
 * streamer (24 kHz PCM16 in, gapless, master gain + level meter).
 */
import {
  type AudioPort,
  type AudioSpeaker,
  type MicRecorder,
  MicrophoneError,
} from "@dodi/client-state/companion-audio";

import { AudioRecorder } from "@/lib/ai/audio-recorder";
import { AudioStreamer } from "@/lib/ai/audio-streamer";

function createWebRecorder(): MicRecorder {
  let isStopped = false;
  let recorder: AudioRecorder | null = null;

  return {
    async start(onChunk) {
      if (!navigator.mediaDevices?.getUserMedia) {
        // getUserMedia only exists in secure contexts (https / localhost).
        throw new MicrophoneError("unsupported", "secureContextRequired");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          throw new MicrophoneError("permission-denied", err.message);
        }
        throw err;
      }

      // Stopped while the permission prompt was open: release the mic at once.
      if (isStopped) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      const rec = new AudioRecorder(onChunk);
      recorder = rec;
      try {
        await rec.startWithStream(stream);
      } catch (err) {
        rec.stop();
        throw err;
      }
      if (isStopped) rec.stop();
    },

    stop() {
      isStopped = true;
      recorder?.stop();
      recorder = null;
    },
  };
}

function createWebSpeaker(): AudioSpeaker {
  const streamer = new AudioStreamer();
  return {
    enqueue: (chunk) => streamer.addPcmChunk(chunk),
    stop: () => streamer.stop(),
    destroy: () => {
      void streamer.destroy().catch(() => {});
    },
    setVolume: (volume) => streamer.setVolume(volume),
    backlogSeconds: () => streamer.backlogSeconds(),
    onPlaybackEnd: (callback) => streamer.onPlaybackEnd(callback),
    primeFromGesture: () => streamer.primeFromGesture(),
    tryResume: () => streamer.tryResume(),
    outputLevel: () => streamer.outputLevel(),
  };
}

export const webAudioPort: AudioPort = {
  createRecorder: createWebRecorder,
  createSpeaker: createWebSpeaker,
};
