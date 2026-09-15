/**
 * Plays PCM audio chunks from Gemini Live API using Web Audio API.
 * Input: base64-encoded 24kHz 16-bit little-endian mono PCM.
 */
export class AudioStreamer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private volume = 1;
  private scheduledTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: 24000 });
      // Master gain between every source and the speakers — the single point
      // the kid's volume slider controls.
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    return this.context;
  }

  /**
   * Master output volume, 0..1 (clamped). Applied with a short ramp so slider
   * drags don't click. Remembered even before the context exists, so a volume
   * set while dodi is idle still applies to the next utterance.
   */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
    }
  }

  addPcmChunk(base64Data: string): void {
    const ctx = this.ensureContext();

    // Decode base64 to Int16Array
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);

    // Convert Int16 to Float32 (normalized to [-1, 1])
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Create audio buffer
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    // Schedule for gapless playback
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain ?? ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, this.scheduledTime);
    source.start(startTime);
    this.scheduledTime = startTime + buffer.duration;

    this.activeSources.push(source);

    // Cleanup finished sources
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) this.activeSources.splice(idx, 1);
    };
  }

  /**
   * Seconds of already-scheduled audio still waiting to play — the playback
   * backlog. The model streams faster than realtime, so this grows while Dodi
   * talks and drains as it plays; a large value means the child is hearing audio
   * generated well in the past.
   */
  backlogSeconds(): number {
    if (!this.context) return 0;
    return Math.max(0, this.scheduledTime - this.context.currentTime);
  }

  /**
   * Resume AudioContext from a user gesture (required on mobile).
   */
  primeFromGesture(): void {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {
        // Best-effort resume from user gesture
      });
    }
  }

  /**
   * Try to resume the AudioContext without a user gesture.
   * Returns true if audio output is ready (running), false if still suspended.
   */
  async tryResume(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (ctx.state === "running") return true;
    try {
      await ctx.resume();
      return (ctx.state as string) === "running";
    } catch {
      return false;
    }
  }

  stop(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeSources = [];
    this.scheduledTime = 0;
  }

  async destroy(): Promise<void> {
    this.stop();
    this.gain = null;
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }
}
