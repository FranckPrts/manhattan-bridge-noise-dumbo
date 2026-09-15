// On-device spectral analysis of a recorded audio clip. Filter-bank +
// envelope-follower approach (not FFT/STFT binning) — see
// IMPLEMENTATION_NOTES.md "Spectral analysis" for the full rationale.
// Runs entirely on native Web Audio nodes: no FFT math, no dependency.

export const BANDS_PER_OCTAVE = 12;
const MIN_BAND_HZ = 20;
const MAX_BAND_HZ = 20000;

const ENVELOPE_TIME_CONSTANT_MS = 125; // FAST weighting, per IEC 61672 / this repo's own field protocol
const FRAME_HOP_SEC = 0.1;
const BASELINE_WINDOW_SEC = 0.8;
const EVENT_THRESHOLD_DB = 6;
const EVENT_MIN_DURATION_MS = 300;
const DBFS_FLOOR = -120;

const SCHEMA_VERSION = 'spectral_v1';

// Standard fractional-octave center-frequency formula. N=3 reproduces the
// textbook 1/3-octave table (25, 31.5, 40, 50, 63, 80, 100Hz...) exactly.
export function generateBandCenters(bandsPerOctave = BANDS_PER_OCTAVE, minHz = MIN_BAND_HZ, maxHz = MAX_BAND_HZ) {
  const iMin = Math.ceil(bandsPerOctave * Math.log2(minHz / 1000));
  const iMax = Math.floor(bandsPerOctave * Math.log2(maxHz / 1000));
  const centers = [];
  for (let i = iMin; i <= iMax; i++) {
    centers.push(1000 * Math.pow(2, i / bandsPerOctave));
  }
  return centers;
}

function bandQ(fc, bandsPerOctave) {
  // Edge ratio for a fractional-octave band of width 1/bandsPerOctave octaves.
  const edgeRatio = Math.pow(2, 1 / (2 * bandsPerOctave));
  const bandwidth = fc * edgeRatio - fc / edgeRatio;
  return fc / bandwidth;
}

export async function decodeToBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close();
  }
}

function toMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContextClass();
  const mono = ctx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
  const out = mono.getChannelData(0);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      out[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  ctx.close();
  return mono;
}

function absCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}

// Web Audio caps channel counts at 32 (OfflineAudioContext, ChannelMergerNode
// inputs) per spec — with ~90-120 bands at 1/12-octave, everything can't
// render in a single multi-channel pass. Render in chunks of <=32 bandpass
// channels instead, plus one separate single-channel pass for the broadband
// (unfiltered) envelope used for baseline/event detection.
const MAX_RENDER_CHANNELS = 32;

const lowpassFreqHz = 1 / (2 * Math.PI * (ENVELOPE_TIME_CONSTANT_MS / 1000));

function buildEnvelopeChain(offlineCtx, curve, inputNode, outputNode, outputChannelIndex) {
  const rectifier = offlineCtx.createWaveShaper();
  rectifier.curve = curve;
  const smoother = offlineCtx.createBiquadFilter();
  smoother.type = 'lowpass';
  smoother.frequency.value = lowpassFreqHz;
  smoother.Q.value = 0.707;

  inputNode.connect(rectifier);
  rectifier.connect(smoother);
  if (outputChannelIndex === undefined) {
    smoother.connect(outputNode);
  } else {
    smoother.connect(outputNode, 0, outputChannelIndex);
  }
}

// Renders one chunk of bandpass channels (<=32) in a single offline pass.
async function renderBandChunk(monoBuffer, freqs) {
  const OfflineAudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineAudioContextClass(freqs.length, monoBuffer.length, monoBuffer.sampleRate);
  const curve = absCurve();

  const source = offlineCtx.createBufferSource();
  source.buffer = monoBuffer;

  const merger = offlineCtx.createChannelMerger(freqs.length);
  merger.connect(offlineCtx.destination);

  freqs.forEach((fc, i) => {
    const bandpass = offlineCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = fc;
    bandpass.Q.value = bandQ(fc, BANDS_PER_OCTAVE);
    source.connect(bandpass);
    buildEnvelopeChain(offlineCtx, curve, bandpass, merger, i);
  });

  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return freqs.map((_, i) => rendered.getChannelData(i));
}

async function renderBroadband(monoBuffer) {
  const OfflineAudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineAudioContextClass(1, monoBuffer.length, monoBuffer.sampleRate);
  const curve = absCurve();

  const source = offlineCtx.createBufferSource();
  source.buffer = monoBuffer;
  buildEnvelopeChain(offlineCtx, curve, source, offlineCtx.destination);

  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

// Returns { bandChannels: Float32Array[] (one per band), broadbandChannel, sampleRate }
async function renderEnvelopes(monoBuffer, bandCenters) {
  const bandChannels = [];
  for (let start = 0; start < bandCenters.length; start += MAX_RENDER_CHANNELS) {
    const chunk = bandCenters.slice(start, start + MAX_RENDER_CHANNELS);
    const chunkChannels = await renderBandChunk(monoBuffer, chunk);
    bandChannels.push(...chunkChannels);
  }

  const broadbandChannel = await renderBroadband(monoBuffer);

  return { bandChannels, broadbandChannel, sampleRate: monoBuffer.sampleRate };
}

function amplitudeToDbfs(amplitude) {
  const clamped = Math.max(amplitude, 1e-6);
  return Math.max(20 * Math.log10(clamped), DBFS_FLOOR);
}

function sampleFrames(channelData, sampleRate, frameTimesSec) {
  return frameTimesSec.map((t) => {
    const idx = Math.min(Math.round(t * sampleRate), channelData.length - 1);
    return channelData[idx];
  });
}

// Finds the quietest contiguous window of the broadband envelope and
// averages each band's envelope over it. This plays the same statistical
// role as Welch's method (a low-variance reference estimate from averaging
// multiple samples) but operates on the already-smoothed envelope domain,
// not by averaging FFT periodograms — named accordingly rather than
// borrowing the term "Welch" for a mechanistically different technique.
function computeBaseline(levelsAmplitude, broadbandAmplitude, frameTimesSec) {
  const windowFrames = Math.round(BASELINE_WINDOW_SEC / FRAME_HOP_SEC);
  if (broadbandAmplitude.length < windowFrames) {
    return null;
  }

  let bestStart = 0;
  let bestMean = Infinity;
  for (let start = 0; start + windowFrames <= broadbandAmplitude.length; start++) {
    let sum = 0;
    for (let i = start; i < start + windowFrames; i++) sum += broadbandAmplitude[i];
    const mean = sum / windowFrames;
    if (mean < bestMean) {
      bestMean = mean;
      bestStart = start;
    }
  }

  const bandMeans = levelsAmplitude[0].map((_, bandIdx) => {
    let sum = 0;
    for (let i = bestStart; i < bestStart + windowFrames; i++) sum += levelsAmplitude[i][bandIdx];
    return amplitudeToDbfs(sum / windowFrames);
  });

  return {
    method: 'envelope_mean',
    window_sec: [frameTimesSec[bestStart], frameTimesSec[bestStart + windowFrames - 1]],
    levels_dbfs: bandMeans,
    broadband_dbfs: amplitudeToDbfs(bestMean),
  };
}

function detectEvent(broadbandAmplitude, frameTimesSec, baseline) {
  if (!baseline) return null;

  const thresholdAmplitude = Math.pow(10, (baseline.broadband_dbfs + EVENT_THRESHOLD_DB) / 20);
  const minFrames = Math.max(1, Math.round(EVENT_MIN_DURATION_MS / 1000 / FRAME_HOP_SEC));

  let onsetIdx = -1;
  let offsetIdx = -1;
  let runStart = -1;

  for (let i = 0; i < broadbandAmplitude.length; i++) {
    const above = broadbandAmplitude[i] >= thresholdAmplitude;
    if (above && runStart === -1) {
      runStart = i;
    }
    if (above && i - runStart + 1 >= minFrames && onsetIdx === -1) {
      onsetIdx = runStart;
    }
    if (!above) {
      if (onsetIdx !== -1 && offsetIdx === -1) offsetIdx = i - 1;
      runStart = -1;
    }
  }
  if (onsetIdx !== -1 && offsetIdx === -1) offsetIdx = broadbandAmplitude.length - 1;
  if (onsetIdx === -1) return null;

  return {
    onset_sec: frameTimesSec[onsetIdx],
    offset_sec: frameTimesSec[offsetIdx],
    detection: {
      method: 'relative_to_baseline',
      threshold_db: EVENT_THRESHOLD_DB,
      min_duration_ms: EVENT_MIN_DURATION_MS,
    },
  };
}

function computeSummary(levelsDbfs, bandCenters, event, frameTimesSec) {
  let peakDbfs = -Infinity;
  let peakBandHz = null;

  const eventFrameRange = event
    ? [frameTimesSec.findIndex((t) => t >= event.onset_sec), frameTimesSec.findIndex((t) => t >= event.offset_sec)]
    : [0, levelsDbfs.length - 1];
  const [rangeStart, rangeEndRaw] = eventFrameRange;
  const rangeEnd = rangeEndRaw === -1 ? levelsDbfs.length - 1 : rangeEndRaw;

  const bandSums = new Array(bandCenters.length).fill(0);
  let frameCount = 0;

  for (let f = Math.max(rangeStart, 0); f <= rangeEnd; f++) {
    for (let b = 0; b < bandCenters.length; b++) {
      const v = levelsDbfs[f][b];
      bandSums[b] += v;
      if (v > peakDbfs) {
        peakDbfs = v;
        peakBandHz = bandCenters[b];
      }
    }
    frameCount++;
  }

  let dominantBandHz = null;
  let dominantMean = -Infinity;
  bandSums.forEach((sum, b) => {
    const mean = sum / Math.max(frameCount, 1);
    if (mean > dominantMean) {
      dominantMean = mean;
      dominantBandHz = bandCenters[b];
    }
  });

  return {
    peak_dbfs: peakDbfs,
    peak_band_hz: peakBandHz,
    dominant_band_hz: dominantBandHz,
    event_duration_sec: event ? event.offset_sec - event.onset_sec : null,
  };
}

// Accepts a Blob (recorded clip) or an already-decoded AudioBuffer (for
// direct testing with a synthetic tone, bypassing blob decode).
export async function analyzeAudioBlob(blobOrBuffer) {
  const rawBuffer = blobOrBuffer instanceof AudioBuffer ? blobOrBuffer : await decodeToBuffer(blobOrBuffer);
  const monoBuffer = toMono(rawBuffer);
  const bandCenters = generateBandCenters();

  const { bandChannels, broadbandChannel, sampleRate } = await renderEnvelopes(monoBuffer, bandCenters);

  const durationSec = monoBuffer.duration;
  const frameCount = Math.floor(durationSec / FRAME_HOP_SEC);
  // Computed from the index, not accumulated via repeated += FRAME_HOP_SEC,
  // which drifts (floating-point rounding compounds over many additions).
  const frameTimesSec = Array.from({ length: frameCount }, (_, i) => i * FRAME_HOP_SEC);

  const levelsAmplitude = frameTimesSec.map((_, frameIdx) =>
    bandChannels.map((channel) => sampleFrames(channel, sampleRate, [frameTimesSec[frameIdx]])[0])
  );
  const broadbandAmplitude = sampleFrames(broadbandChannel, sampleRate, frameTimesSec);

  const levelsDbfs = levelsAmplitude.map((frame) => frame.map(amplitudeToDbfs));

  const baseline = computeBaseline(levelsAmplitude, broadbandAmplitude, frameTimesSec);
  const event = detectEvent(broadbandAmplitude, frameTimesSec, baseline);
  const summary = computeSummary(levelsDbfs, bandCenters, event, frameTimesSec);

  return {
    schema: SCHEMA_VERSION,
    calibrated: false,
    sample_rate_hz: sampleRate,
    band_scheme: `1/${BANDS_PER_OCTAVE}-octave`,
    bands_per_octave: BANDS_PER_OCTAVE,
    band_centers_hz: bandCenters,
    envelope_time_constant_ms: ENVELOPE_TIME_CONSTANT_MS,
    frame_hop_ms: FRAME_HOP_SEC * 1000,
    frame_times_sec: frameTimesSec,
    levels_dbfs: levelsDbfs,
    baseline: baseline ? { method: baseline.method, window_sec: baseline.window_sec, levels_dbfs: baseline.levels_dbfs } : null,
    event,
    summary,
  };
}

// Stats for one citizen-marked event window (start_sec–end_sec), used by
// EventAnnotator.jsx (peak level bar, barycenter text) and SpectrogramView.jsx
// (the barycenter anchor drawn on the vertical heatmap). Both read from the
// same pass so the number shown on the card and the dot drawn on the
// spectrogram can never disagree.
//
// barycenter_sec is the energy-weighted mean time within the window — not
// the midpoint — using each frame's peak-across-bands level (converted to
// linear power) as its weight. For a held-down range that started slightly
// early or ran slightly long, this is a better "where the sound actually
// was" anchor than the raw start/end the citizen happened to press.
export function eventWindowStats(spectral, startSec, endSec) {
  const { frame_times_sec: times, levels_dbfs: levels } = spectral;
  let peakDbfs = -Infinity;
  let weightSum = 0;
  let weightedTimeSum = 0;

  for (let f = 0; f < times.length; f++) {
    if (times[f] < startSec || times[f] > endSec) continue;
    let framePeak = -Infinity;
    for (let b = 0; b < levels[f].length; b++) {
      if (levels[f][b] > framePeak) framePeak = levels[f][b];
    }
    if (framePeak === -Infinity) continue;
    if (framePeak > peakDbfs) peakDbfs = framePeak;
    const weight = Math.pow(10, framePeak / 10); // power-domain, not amplitude — matches dB-of-power convention
    weightSum += weight;
    weightedTimeSum += weight * times[f];
  }

  return {
    peak_dbfs: peakDbfs === -Infinity ? null : peakDbfs,
    barycenter_sec: weightSum > 0 ? weightedTimeSum / weightSum : (startSec + endSec) / 2,
  };
}

// Per-band mean level within a citizen-marked event window — the "spectral
// signature" of that one loud moment, for admin exploration
// (EventExplorer.jsx). Also returns `relative_dbfs`, each band re-based to
// that event's own peak = 0dB: raw dBFS is uncalibrated and per-device (see
// IMPLEMENTATION_NOTES.md "Deferred... per-band energy distribution across
// reports"), so comparing *shape* — where the energy sits across frequency,
// not how loud it was — is the only cross-device/cross-report comparison
// that's actually valid here.
export function eventBandProfile(spectral, startSec, endSec) {
  const { frame_times_sec: times, levels_dbfs: levels, band_centers_hz: bands } = spectral;
  const bandCount = bands.length;
  const sums = new Array(bandCount).fill(0);
  let frameCount = 0;

  for (let f = 0; f < times.length; f++) {
    if (times[f] < startSec || times[f] > endSec) continue;
    for (let b = 0; b < bandCount; b++) sums[b] += levels[f][b];
    frameCount++;
  }
  if (frameCount === 0) return null;

  const meanDbfs = sums.map((s) => s / frameCount);
  const peak = Math.max(...meanDbfs);

  return {
    band_centers_hz: bands,
    mean_dbfs: meanDbfs,
    relative_dbfs: meanDbfs.map((v) => v - peak),
  };
}
