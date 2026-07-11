export const SUPPORTED_AUDIO_FORMATS = ["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"] as const;

export type SupportedAudioFormat = (typeof SUPPORTED_AUDIO_FORMATS)[number];

export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;

const AUDIO_FORMAT_SET = new Set<string>(SUPPORTED_AUDIO_FORMATS);

const CONTENT_TYPE_TO_FORMAT: Record<string, SupportedAudioFormat> = {
  "audio/aac": "m4a",
  "audio/flac": "flac",
  "audio/m4a": "m4a",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mpga": "mpga",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/x-flac": "flac",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm"
};

const FORMAT_COMPATIBLE_CONTENT_TYPES: Record<SupportedAudioFormat, string[]> = {
  flac: ["audio/flac", "audio/x-flac"],
  mp3: ["audio/mpeg", "audio/mp3"],
  mp4: ["audio/mp4", "video/mp4"],
  mpeg: ["audio/mpeg"],
  mpga: ["audio/mpeg", "audio/mpga"],
  m4a: ["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac"],
  ogg: ["audio/ogg"],
  wav: ["audio/wav", "audio/wave", "audio/x-wav"],
  webm: ["audio/webm", "video/webm"]
};

export const SUPPORTED_AUDIO_MIME_TYPES = Object.keys(CONTENT_TYPE_TO_FORMAT).sort();

export const SUPPORTED_AUDIO_ACCEPT = [
  ...SUPPORTED_AUDIO_MIME_TYPES,
  ...SUPPORTED_AUDIO_FORMATS.map((format) => `.${format}`)
].join(",");

export function normalizeAudioContentType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isSupportedAudioFormat(value: string): value is SupportedAudioFormat {
  return AUDIO_FORMAT_SET.has(value.toLowerCase());
}

export function getAudioFormatFromContentType(contentType: string): SupportedAudioFormat | null {
  return CONTENT_TYPE_TO_FORMAT[normalizeAudioContentType(contentType)] ?? null;
}

export function isAudioFormatCompatibleWithContentType(format: SupportedAudioFormat, contentType: string) {
  return FORMAT_COMPATIBLE_CONTENT_TYPES[format].includes(normalizeAudioContentType(contentType));
}

export function getAudioFormatFromFileName(fileName: string): SupportedAudioFormat | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension && isSupportedAudioFormat(extension) ? extension : null;
}

export function getDefaultContentTypeForAudioFormat(format: SupportedAudioFormat) {
  switch (format) {
    case "flac":
      return "audio/flac";
    case "mp3":
    case "mpeg":
      return "audio/mpeg";
    case "mp4":
    case "m4a":
      return "audio/mp4";
    case "mpga":
      return "audio/mpga";
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
  }
}

export function resolveSupportedAudioFormat(input: {
  fileName?: string | null;
  contentType?: string | null;
}): SupportedAudioFormat | null {
  if (input.fileName) {
    const fromName = getAudioFormatFromFileName(input.fileName);
    if (fromName) {
      return fromName;
    }
  }
  if (input.contentType) {
    return getAudioFormatFromContentType(input.contentType);
  }
  return null;
}
