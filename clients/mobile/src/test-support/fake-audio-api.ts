/**
 * Stand-in for `react-native-audio-api` for Node tests, on the shared fake
 * audio engine of the companion-audio contract (virtual clock, gapless queue
 * source):
 *
 *   vi.mock("react-native-audio-api", () => import("@/test-support/fake-audio-api"));
 *
 * The microphone side is a recorder that only tracks whether it is capturing,
 * and an AudioManager whose permission answer the test controls.
 */
import { createFakeAudioEngine } from "@dodi/client-state/companion-audio.contract";

export const audioEngine = createFakeAudioEngine();

type Permission = "Granted" | "Denied" | "Undetermined";

export const micDevice = {
  permission: "Granted" as Permission,
  isRecording: false,
  reset(): void {
    micDevice.permission = "Granted";
    micDevice.isRecording = false;
  },
};

export const AudioContext = audioEngine.AudioContext;

type Result = { status: "success" } | { status: "error"; message: string };

export class AudioRecorder {
  private onReady: unknown = null;
  onAudioReady(_options: unknown, callback: unknown): Result {
    this.onReady = callback;
    return { status: "success" };
  }
  clearOnAudioReady(): void {
    this.onReady = null;
  }
  onError(): void {}
  clearOnError(): void {}
  async start(): Promise<Result> {
    micDevice.isRecording = true;
    return { status: "success" };
  }
  async stop(): Promise<Result> {
    micDevice.isRecording = false;
    return { status: "success" };
  }
}

export const AudioManager = {
  setAudioSessionOptions(): void {},
  async setAudioSessionActivity(): Promise<boolean> {
    return true;
  },
  async checkRecordingPermissions(): Promise<Permission> {
    return micDevice.permission;
  },
  async requestRecordingPermissions(): Promise<Permission> {
    return micDevice.permission;
  },
};
