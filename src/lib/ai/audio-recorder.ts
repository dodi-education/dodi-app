/**
 * Captures microphone audio and emits base64-encoded PCM chunks (16kHz, 16-bit LE, mono).
 * Uses AudioWorklet for processing.
 */
export class AudioRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onChunk: (base64Pcm: string) => void;
  private recording = false;

  constructor(onAudioChunk: (base64Pcm: string) => void) {
    this.onChunk = onAudioChunk;
  }

  /**
   * Start recording by requesting mic permission via getUserMedia.
   * Must be called within a user gesture context.
   */
  async start(): Promise<void> {
    if (this.recording) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    await this.initWithStream(stream);
  }

  /**
   * Start recording with a pre-acquired MediaStream.
   * Use this when getUserMedia was already called (e.g. to ensure
   * mic permission is requested within the user gesture context).
   */
  async startWithStream(stream: MediaStream): Promise<void> {
    if (this.recording) return;
    await this.initWithStream(stream);
  }

  private async initWithStream(stream: MediaStream): Promise<void> {
    this.stream = stream;
    this.context = new AudioContext({ sampleRate: 16000 });

    // Load the worklet processor
    await this.context.audioWorklet.addModule("/audio-worklet-processor.js");

    const source = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, "pcm-processor");

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === "audio" && this.recording) {
        // Worklet sends raw ArrayBuffer — encode to base64 in main thread
        const bytes = new Uint8Array(event.data.buffer as ArrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        this.onChunk(btoa(binary));
      }
    };

    source.connect(this.workletNode);
    // Connect to destination to keep the audio graph alive
    this.workletNode.connect(this.context.destination);

    this.recording = true;
  }

  stop(): void {
    this.recording = false;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }
  }

  isRecording(): boolean {
    return this.recording;
  }
}
