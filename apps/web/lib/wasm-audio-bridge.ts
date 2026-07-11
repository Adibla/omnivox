import type { EncoderStats, WasmAudioBridge } from "@omnivox/wasm-audio";

class RingBuffer {
  private chunks: Uint8Array[] = [];
  push(chunk: Uint8Array) {
    this.chunks.push(chunk);
  }
  pull() {
    return this.chunks.shift() ?? null;
  }
}

export class HybridAudioBridge implements WasmAudioBridge {
  private queue = new RingBuffer();
  private stats: EncoderStats = {
    rms: 0,
    clipping: 0,
    droppedFrames: 0,
    avgEncodeMs: 0
  };
  private initialized = false;

  async initEncoder(_config: { sampleRate: number; channels: number; bitrate: number }) {
    this.initialized = true;
  }

  pushPcmFrame(frame: Float32Array | Int16Array) {
    if (!this.initialized) {
      throw new Error("Encoder has not been initialized.");
    }
    const startedAt = performance.now();
    let encoded: Uint8Array;

    if (typeof MediaRecorder !== "undefined") {
      encoded = new Uint8Array(frame.byteLength);
    } else {
      const converted = frame instanceof Float32Array ? Int16Array.from(frame, (sample) => sample * 0x7fff) : frame;
      encoded = new Uint8Array(converted.buffer.slice(0));
    }

    this.queue.push(encoded);
    const elapsed = performance.now() - startedAt;
    this.stats.avgEncodeMs = this.stats.avgEncodeMs === 0 ? elapsed : (this.stats.avgEncodeMs + elapsed) / 2;
  }

  pullEncodedChunk() {
    return this.queue.pull();
  }

  flushAndFinalize() {
    return this.queue.pull();
  }

  getStats() {
    return this.stats;
  }
}
