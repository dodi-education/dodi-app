import { beforeEach, vi } from "vitest";
import {
  describeAudioSpeakerContract,
  describeMicRecorderContract,
} from "@dodi/client-state/companion-audio.contract";

import { audioEngine, micDevice } from "@/test-support/fake-audio-api";

import { nativeAudioPort } from "./audio-port";

vi.mock("react-native-audio-api", () => import("@/test-support/fake-audio-api"));

beforeEach(() => {
  audioEngine.reset();
  micDevice.reset();
});

describeAudioSpeakerContract("mobile (react-native-audio-api queue source)", {
  engine: audioEngine,
  createSpeaker: () => nativeAudioPort.createSpeaker(),
});

describeMicRecorderContract("mobile (react-native-audio-api recorder)", {
  createRecorder: () => nativeAudioPort.createRecorder(),
  denyPermission: () => {
    micDevice.permission = "Denied";
  },
  isMicOpen: () => micDevice.isRecording,
});
