// xAI speech to text (REST). Docs (checked 2026-10-10):
//   https://docs.x.ai/developers/rest-api-reference/inference/speech-to-text
//   https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
// POST https://api.x.ai/v1/stt, multipart/form-data:
//   model = grok-voice-transcribe-2.0 (the default), file = the audio. The file "must be the last field
//   in the multipart form". WAV is a container format, so audio_format/sample_rate are not set.
// Response: { text, language, duration, words? }; only `text` is used here.
// The old OpenAI-style path /v1/audio/transcriptions (model whisper-1) now returns 404.

export const XAI_STT_URL = 'https://api.x.ai/v1/stt';
export const XAI_STT_MODEL = 'grok-voice-transcribe-2.0';

export function buildSttForm(audio: Blob, filename = 'audio.wav'): FormData {
  const form = new FormData();
  form.append('model', XAI_STT_MODEL);
  form.append('file', audio, filename); // must stay last
  return form;
}

export function sttRequest(apiKey: string, audio: Blob): [string, RequestInit] {
  return [XAI_STT_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: buildSttForm(audio) }];
}

export function sttText(data: unknown): string {
  const text = (data as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text.trim() : '';
}
