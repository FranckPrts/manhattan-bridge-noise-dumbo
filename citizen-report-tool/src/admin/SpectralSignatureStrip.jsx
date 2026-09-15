import { useRef, useEffect } from 'react';

// A single-row heatmap of relative band levels (each band re-based to its
// own event's peak = 0dB) — the "shape" of a sound across frequency, at a
// glance. Deliberately not absolute dBFS: see eventBandProfile() in
// spectralAnalysis.js for why only relative levels are safe to compare
// across reports/devices. Low frequency on the left, high on the right —
// same left-to-right sense as SpectrogramView's bottom-to-top axis, just
// flattened to one row since these are meant to sit many-per-screen in a
// gallery.

const RELATIVE_MIN_DB = -40; // anything quieter than 40dB under this event's own peak reads as "off"
const HEIGHT = 28;
const TICK_HZ = [100, 1000, 10000];

function colorForRelative(db) {
  const t = Math.min(1, Math.max(0, (db - RELATIVE_MIN_DB) / (0 - RELATIVE_MIN_DB)));
  const hue = 240 * (1 - t);
  return `hsl(${hue}, 90%, ${20 + t * 40}%)`;
}

export default function SpectralSignatureStrip({ bandCentersHz, relativeDbfs, width = 320 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bandCentersHz?.length) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, HEIGHT);

    const cellW = width / bandCentersHz.length;
    bandCentersHz.forEach((_, b) => {
      ctx.fillStyle = colorForRelative(relativeDbfs[b]);
      ctx.fillRect(b * cellW, 0, cellW + 1, HEIGHT);
    });
  }, [bandCentersHz, relativeDbfs, width]);

  if (!bandCentersHz?.length) return null;

  const minHz = bandCentersHz[0];
  const maxHz = bandCentersHz[bandCentersHz.length - 1];

  return (
    <div className="spectral-strip">
      <canvas ref={canvasRef} width={width} height={HEIGHT} style={{ width: '100%', height: HEIGHT }} />
      <div className="spectral-strip-ticks">
        {TICK_HZ.filter((hz) => hz >= minHz && hz <= maxHz).map((hz) => (
          <span key={hz} style={{ left: `${((Math.log2(hz / minHz)) / Math.log2(maxHz / minHz)) * 100}%` }}>
            {hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`}
          </span>
        ))}
      </div>
    </div>
  );
}
