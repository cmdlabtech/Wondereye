import { getBridge } from './bridge';
import { AppState } from './types';
import { fetchTranscribe } from './api';
import { renderListening, renderVoiceResult, renderList, renderError } from './renderer';

// PCM format assumed for G2 hardware — adjust if device reports differently
const AUDIO_SAMPLE_RATE = 16000; // Hz
const AUDIO_BIT_DEPTH = 16;      // bits
const AUDIO_CHANNELS = 1;        // mono

const SILENCE_THRESHOLD = 200;      // RMS amplitude below this = silence (0–32768 scale)
const SILENCE_DURATION_MS = 1500;   // 1.5s continuous silence → auto-stop
const MAX_RECORDING_MS = 10000;     // hard cap on recording duration
const MAX_AUDIO_BYTES = 800_000;    // safety cap on buffer size before force-stop

function rmsOfChunk(chunk: Uint8Array): number {
  // PCM is 16-bit little-endian — compute RMS over signed 16-bit samples
  let sum = 0;
  const samples = Math.floor(chunk.length / 2);
  for (let i = 0; i < samples; i++) {
    const lo = chunk[i * 2];
    const hi = chunk[i * 2 + 1];
    // Sign-extend 16-bit
    let sample = (hi << 8) | lo;
    if (sample & 0x8000) sample = sample - 0x10000;
    sum += sample * sample;
  }
  return samples > 0 ? Math.sqrt(sum / samples) : 0;
}

function chunkDurationMs(chunk: Uint8Array): number {
  const bytesPerSample = AUDIO_BIT_DEPTH / 8;
  const samples = chunk.length / (bytesPerSample * AUDIO_CHANNELS);
  return (samples / AUDIO_SAMPLE_RATE) * 1000;
}

function buildWavBlob(chunks: Uint8Array[]): Blob {
  // Concatenate all PCM chunks
  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  const pcm = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }

  const byteRate = AUDIO_SAMPLE_RATE * AUDIO_CHANNELS * (AUDIO_BIT_DEPTH / 8);
  const blockAlign = AUDIO_CHANNELS * (AUDIO_BIT_DEPTH / 8);
  const wavBuffer = new ArrayBuffer(44 + totalBytes);
  const view = new DataView(wavBuffer);

  // RIFF header
  view.setUint8(0, 'R'.charCodeAt(0)); view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0)); view.setUint8(3, 'F'.charCodeAt(0));
  view.setUint32(4, 36 + totalBytes, true);
  view.setUint8(8, 'W'.charCodeAt(0)); view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0)); view.setUint8(11, 'E'.charCodeAt(0));
  // fmt chunk
  view.setUint8(12, 'f'.charCodeAt(0)); view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0)); view.setUint8(15, ' '.charCodeAt(0));
  view.setUint32(16, 16, true);         // chunk size
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, AUDIO_CHANNELS, true);
  view.setUint32(24, AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, AUDIO_BIT_DEPTH, true);
  // data chunk
  view.setUint8(36, 'd'.charCodeAt(0)); view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0)); view.setUint8(39, 'a'.charCodeAt(0));
  view.setUint32(40, totalBytes, true);
  new Uint8Array(wavBuffer).set(pcm, 44);

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function clearVoiceTimers(state: AppState): void {
  if (state.voiceHardTimer != null) {
    clearTimeout(state.voiceHardTimer);
    state.voiceHardTimer = undefined;
  }
}

export function startVoiceRecording(state: AppState): void {
  if (state.mode === 'listening') return; // already recording
  state.mode = 'listening';
  state.voiceBuffer = [];
  state.voiceSilenceAccum = 0;
  getBridge().audioControl(true).catch((err: unknown) => {
    console.warn('[voice] audioControl(true) failed:', err);
  });
  renderListening().catch((err: unknown) => console.warn('[voice] renderListening failed:', err));
  state.voiceHardTimer = setTimeout(() => {
    stopVoiceRecording(state).catch(() => {});
  }, MAX_RECORDING_MS);
}

export async function stopVoiceRecording(state: AppState): Promise<void> {
  if (state.mode !== 'listening') return; // guard against double-call
  state.mode = 'loading'; // prevent re-entry while async work runs
  clearVoiceTimers(state);
  getBridge().audioControl(false).catch((err: unknown) => {
    console.warn('[voice] audioControl(false) failed:', err);
  });

  const chunks = state.voiceBuffer ?? [];
  state.voiceBuffer = [];

  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  if (totalBytes === 0) {
    state.mode = 'list';
    renderList(state).catch(() => {});
    return;
  }

  const wav = buildWavBlob(chunks);
  const formData = new FormData();
  formData.append('file', wav, 'audio.wav');
  formData.append('landmarks', JSON.stringify(state.landmarks.map(l => ({ name: l.name }))));

  try {
    const result = await fetchTranscribe(formData);
    if (result.matched !== null) {
      const idx = state.landmarks.findIndex(
        l => l.name.toLowerCase() === result.matched!.toLowerCase()
      );
      if (idx >= 0) state.selectedIndex = idx;
      state.mode = 'list';
      await renderList(state);
    } else {
      state.mode = 'list';
      await renderVoiceResult(null);
      setTimeout(() => {
        if (state.mode === 'list') renderList(state).catch(() => {});
      }, 1500);
    }
  } catch (err) {
    console.error('[voice] transcribe error:', err);
    state.mode = 'error';
    state.errorMessage = 'Voice search failed.\nPlease try again.';
    renderError(state.errorMessage).catch(() => {});
  }
}

export function handleAudioChunk(state: AppState, event: any): void {
  if (state.mode !== 'listening') return;
  const chunk: Uint8Array | undefined = event.audioEvent?.audioPcm;
  if (!chunk || chunk.length === 0) return;

  state.voiceBuffer = state.voiceBuffer ?? [];
  state.voiceBuffer.push(chunk);

  const rms = rmsOfChunk(chunk);
  const durationMs = chunkDurationMs(chunk);

  if (rms < SILENCE_THRESHOLD) {
    state.voiceSilenceAccum = (state.voiceSilenceAccum ?? 0) + durationMs;
    if (state.voiceSilenceAccum >= SILENCE_DURATION_MS) {
      stopVoiceRecording(state).catch(() => {});
    }
  } else {
    state.voiceSilenceAccum = 0;
  }

  const totalBytes = state.voiceBuffer.reduce((sum, c) => sum + c.length, 0);
  if (totalBytes >= MAX_AUDIO_BYTES) {
    stopVoiceRecording(state).catch(() => {});
  }
}
