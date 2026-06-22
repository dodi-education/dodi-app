/**
 * AudioWorklet processor that converts Float32 audio samples to Int16 PCM
 * and posts the raw buffer to the main thread for base64 encoding.
 * Note: btoa/atob are not available in the AudioWorklet scope.
 */
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const float32Data = input[0]; // mono channel
    const int16Data = new Int16Array(float32Data.length);

    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Transfer the raw buffer to the main thread (base64 encoding happens there)
    this.port.postMessage(
      { type: "audio", buffer: int16Data.buffer },
      [int16Data.buffer]
    );
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
