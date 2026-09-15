import { useRef, useEffect, useMemo } from 'react';

const PADDING = 36;
const DBFS_MIN = -80;
const DBFS_MAX = 0;

export default function AnnoyanceScatter({ reports }) {
  const canvasRef = useRef(null);

  const points = useMemo(
    () =>
      reports
        .map((r) => ({
          annoyance: r.report_data?.annoyance,
          peakDbfs: r.spectral?.summary?.peak_dbfs,
        }))
        .filter((p) => typeof p.annoyance === 'number' && typeof p.peakDbfs === 'number'),
    [reports]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const plotW = width - PADDING * 2;
    const plotH = height - PADDING * 2;

    const style = getComputedStyle(document.documentElement);
    const border = style.getPropertyValue('--cp-border').trim() || '#ccc';
    const accent = style.getPropertyValue('--cp-accent').trim() || '#b11f4b';
    const textColor = style.getPropertyValue('--cp-text-soft').trim() || '#888';

    // Axes
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, PADDING);
    ctx.lineTo(PADDING, height - PADDING);
    ctx.lineTo(width - PADDING, height - PADDING);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = '11px sans-serif';
    ctx.fillText('Annoyance (0-10) →', PADDING, height - 10);
    ctx.save();
    ctx.translate(12, height - PADDING);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Peak level (dBFS) →', 0, 0);
    ctx.restore();

    points.forEach((p) => {
      const x = PADDING + (p.annoyance / 10) * plotW;
      const y = height - PADDING - ((p.peakDbfs - DBFS_MIN) / (DBFS_MAX - DBFS_MIN)) * plotH;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }, [points]);

  return (
    <div className="chart-block">
      <h2>Annoyance vs. measured peak level (n={points.length})</h2>
      {points.length === 0 ? (
        <p className="hint">No reports yet with both an annoyance rating and a spectral analysis.</p>
      ) : (
        <>
          <canvas ref={canvasRef} width={480} height={280} style={{ width: '100%', height: 'auto', maxWidth: 480 }} />
          <p className="hint">
            Peak level is uncalibrated (relative dBFS, not SPL) — comparable within one device's recordings, not
            necessarily across different phones.
          </p>
        </>
      )}
    </div>
  );
}
