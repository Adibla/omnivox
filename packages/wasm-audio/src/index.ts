export type EncoderStats = {
  rms: number;
  clipping: number;
  droppedFrames: number;
  avgEncodeMs: number;
};

export interface WasmAudioBridge {
  initEncoder(config: { sampleRate: number; channels: number; bitrate: number }): Promise<void>;
  pushPcmFrame(frame: Float32Array | Int16Array): void;
  pullEncodedChunk(): Uint8Array | null;
  flushAndFinalize(): Uint8Array | null;
  getStats(): EncoderStats;
}
