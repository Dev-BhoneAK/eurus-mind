import { extname } from "node:path";

// Formats the Gemini API accepts. Phones usually record .m4a; the PWA's MediaRecorder gives .webm.
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".m4a": "audio/m4a",
  ".aac": "audio/aac",
  ".mp3": "audio/mp3",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".webm": "audio/webm",
  ".flac": "audio/flac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
};

export const SUPPORTED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);

export function mimeTypeFor(path: string): string | undefined {
  return MIME_BY_EXTENSION[extname(path).toLowerCase()];
}

// Inline requests are capped at 20 MB after base64 adds about a third, so stay well under it.
export const MAX_AUDIO_BYTES = 14 * 1024 * 1024;
