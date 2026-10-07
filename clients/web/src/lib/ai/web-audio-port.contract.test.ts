import { beforeEach, vi } from "vitest";
import {
  createFakeAudioEngine,
  describeAudioSpeakerContract,
  describeMicRecorderContract,
} from "@dodi/client-state/companion-audio.contract";

import { webAudioPort } from "./web-audio-port";

// Node has no Web Audio: the speaker runs on the contract's fake engine
// (virtual clock, Web Audio's one-shot buffer sources), the same engine the
// mobile app's react-native-audio-api speaker runs on. The microphone side
// fakes getUserMedia only; capture itself (AudioWorklet) isn't exercised.
const engine = createFakeAudioEngine();
vi.stubGlobal("AudioContext", engine.AudioContext);

const mic = { isAllowed: true, openTracks: 0 };

vi.stubGlobal("navigator", {
  mediaDevices: {
    async getUserMedia(): Promise<MediaStream> {
      if (!mic.isAllowed) throw new DOMException("Permission denied", "NotAllowedError");
      mic.openTracks += 1;
      let isLive = true;
      const track = {
        stop: () => {
          if (isLive) mic.openTracks -= 1;
          isLive = false;
        },
      };
      return { getTracks: () => [track] } as unknown as MediaStream;
    },
  },
});

beforeEach(() => {
  engine.reset();
  mic.isAllowed = true;
  mic.openTracks = 0;
});

describeAudioSpeakerContract("web (Web Audio buffer sources)", {
  engine,
  createSpeaker: () => webAudioPort.createSpeaker(),
});

describeMicRecorderContract("web (getUserMedia)", {
  createRecorder: () => webAudioPort.createRecorder(),
  denyPermission: () => {
    mic.isAllowed = false;
  },
  isMicOpen: () => mic.openTracks > 0,
});
