import { describe, expect, it } from "vitest";
import { detectUnsupportedAudioContainer } from "@omnivox/shared";

function isoBmff(brand: string): Uint8Array {
  const header = new Uint8Array(16);
  header.set([0, 0, 0, 24], 0);
  header.set(
    [..."ftyp"].map((c) => c.charCodeAt(0)),
    4,
  );
  header.set(
    [...brand].map((c) => c.charCodeAt(0)),
    8,
  );
  return header;
}

describe("detectUnsupportedAudioContainer", () => {
  it("flags 3GP containers regardless of the claimed extension", () => {
    expect(detectUnsupportedAudioContainer(isoBmff("3gp4"))).toBe("3gp");
    expect(detectUnsupportedAudioContainer(isoBmff("3gp5"))).toBe("3gp");
    expect(detectUnsupportedAudioContainer(isoBmff("3g2a"))).toBe("3gp");
  });

  it("accepts real MP4/M4A brands", () => {
    expect(detectUnsupportedAudioContainer(isoBmff("M4A "))).toBeNull();
    expect(detectUnsupportedAudioContainer(isoBmff("isom"))).toBeNull();
    expect(detectUnsupportedAudioContainer(isoBmff("mp42"))).toBeNull();
  });

  it("ignores non-ISO-BMFF files and short buffers", () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectUnsupportedAudioContainer(mp3)).toBeNull();
    expect(detectUnsupportedAudioContainer(new Uint8Array(4))).toBeNull();
    expect(detectUnsupportedAudioContainer(new ArrayBuffer(0))).toBeNull();
  });
});
