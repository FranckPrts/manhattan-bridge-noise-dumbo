import { useEffect, useRef } from 'react';

// Live, real-time-only view — not the stored analysis. Reads the recorder's
// MediaStream as a second, non-destructive consumer (createMediaStreamSource
// doesn't interfere with the MediaRecorder also reading it) and draws a
// scrolling frequency-vs-time heatmap, the same scroll-and-draw-a-row
// technique as chrome-music-lab's spectrogram:
// https://github.com/googlecreativelab/chrome-music-lab/tree/master/spectrogram
// — adapted to scroll vertically (new row at the bottom, everything above it
// scrolls up) so it reads top-to-bottom like the rest of this app's vertical
// timeline, rather than left-to-right.
// Coarser than the stored `spectral` record (linear FFT bins from a live
// AnalyserNode, not the fractional-octave filter-bank in
// `spectralAnalysis.js`) — purely a recording aid, never saved.

const DBFS_MIN = -100;
const DBFS_MAX = -30;

function levelToColor(db) {
  const t = Math.min(1, Math.max(0, (db - DBFS_MIN) / (DBFS_MAX - DBFS_MIN)));
  const hue = 240 * (1 - t); // blue (quiet) → red (loud), matches SpectrogramView/GeoSpectralOverlay
  return `hsl(${hue}, 90%, ${20 + t * 40}%)`;
}

export default function LiveSpectrogram({ stream }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return undefined;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.minDecibels = DBFS_MIN;
    analyser.maxDecibels = DBFS_MAX;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const data = new Float32Array(bufferLength);
    let rafId;

    const draw = () => {
      analyser.getFloatFrequencyData(data);

      // Scroll the whole canvas 1px up, then draw a fresh row at the
      // bottom edge — chrome-music-lab's technique, axes swapped.
      ctx.drawImage(canvas, 0, -1);

      const binW = width / bufferLength;
      for (let i = 0; i < bufferLength; i++) {
        ctx.fillStyle = levelToColor(data[i]);
        const x = i * binW; // low frequency on the left
        ctx.fillRect(x, height - 1, binW + 1, 1);
      }

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="live-spectrogram">
      <canvas ref={canvasRef} width={140} height={160} />
      <p className="hint">Live view — watch for the train's signature, then hold the button below</p>
    </div>
  );
}
