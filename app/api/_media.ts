export type SupportedMedia = { kind: "image" | "video" | "audio"; extension: string };

export function supportedMedia(type: string): SupportedMedia | null {
  const formats: Record<string, SupportedMedia> = {
    "image/jpeg": { kind: "image", extension: "jpg" },
    "image/png": { kind: "image", extension: "png" },
    "image/webp": { kind: "image", extension: "webp" },
    "video/mp4": { kind: "video", extension: "mp4" },
    "video/webm": { kind: "video", extension: "webm" },
    "video/quicktime": { kind: "video", extension: "mov" },
    "audio/mpeg": { kind: "audio", extension: "mp3" },
    "audio/wav": { kind: "audio", extension: "wav" },
    "audio/ogg": { kind: "audio", extension: "ogg" },
    "audio/mp4": { kind: "audio", extension: "m4a" },
  };
  return formats[type] ?? null;
}
