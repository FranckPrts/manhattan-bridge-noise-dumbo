import { useMemo } from 'react';
import { aggregateMitigationSignals } from '../lib/mitigationSignals.js';

function Pct({ value }) {
  return <>{Math.round(value * 100)}%</>;
}

function MitigationCard({ signal, maxScore }) {
  const { label, signature, mitigations, count, avgAnnoyance, pctFeltVibration, pctSleepInterrupted, pctCorroborated, score, hotspots, trackSide } = signal;

  return (
    <div className="chart-block mitigation-card">
      <h2>
        {label}
        {trackSide === false && <span className="mitigation-flag">operational, not bridge procurement</span>}
      </h2>
      <p className="hint">{signature}</p>

      {count === 0 ? (
        <p className="hint">No matching reports yet.</p>
      ) : (
        <>
          <div className="histogram-row">
            <span className="histogram-label">Severity-weighted score</span>
            <div className="histogram-bar-track">
              <div className="histogram-bar-fill" style={{ width: `${maxScore ? (score / maxScore) * 100 : 0}%` }} />
            </div>
            <span className="histogram-count">{Math.round(score)}</span>
          </div>

          <ul className="mitigation-stats">
            <li>{count} report{count === 1 ? '' : 's'}</li>
            <li>avg annoyance {avgAnnoyance !== null ? avgAnnoyance.toFixed(1) : '—'}/10</li>
            <li><Pct value={pctFeltVibration} /> felt vibration</li>
            <li><Pct value={pctSleepInterrupted} /> interrupted sleep</li>
            <li><Pct value={pctCorroborated} /> corroborated by measured spectrum</li>
          </ul>

          {hotspots.length > 0 && (
            <p className="hint">
              Hot spots: {hotspots.map((h) => `${h.lat.toFixed(3)}, ${h.lon.toFixed(3)} (${h.count})`).join(' · ')}
            </p>
          )}

          <p className="hint mitigation-actions">
            <strong>Candidate interventions:</strong> {mitigations.join('; ')}
          </p>
        </>
      )}
    </div>
  );
}

export default function MitigationInsights({ reports }) {
  const signals = useMemo(() => aggregateMitigationSignals(reports), [reports]);
  const trackSideSignals = signals.filter((s) => s.trackSide !== false);
  const operationalSignals = signals.filter((s) => s.trackSide === false);
  const maxScore = Math.max(1, ...signals.map((s) => s.score));

  return (
    <div>
      <details className="chart-block mitigation-legend" open>
        <summary>Which variables drive this ranking, and why</summary>
        <ul>
          <li>
            <strong>Sound character</strong> is the primary signal — it maps directly to a physical cause: screech/squeal
            points at wheel-rail friction, rumble/hum at rolling or structure-borne noise, clatter/bang at impacts.
          </li>
          <li>
            <strong>Felt vibration</strong> splits rumble/hum into two very different fixes: felt in the body means the
            bridge structure is re-radiating vibration (fix the structure/fasteners), not felt means it's airborne
            rolling noise (fix the rail/wheel surface).
          </li>
          <li>
            <strong>Duration pattern</strong> separates impulsive events (joints, impacts) from sustained tones
            (friction, structural resonance) — different families of fix again.
          </li>
          <li>
            <strong>Measured dominant frequency band</strong> (from the on-device spectral analysis, uncalibrated but
            per-device consistent) corroborates the self-report — high-frequency energy for squeal, low-frequency for
            rumble — shown as "% corroborated" per category.
          </li>
          <li>
            <strong>Annoyance × recurrence</strong> weights the ranking by impact, not just report count — a category
            with fewer but more frequent, more annoying reports can outrank a more-reported but milder one.
          </li>
          <li>
            <strong>Location</strong> (rounded to ~100m) surfaces hot spots per category, since curve-squeal and
            joint-impact fixes are typically targeted at specific spans, not the whole bridge.
          </li>
        </ul>
      </details>

      <h2 className="mitigation-section-title">Bridge/track interventions, ranked by severity-weighted evidence</h2>
      <div className="mitigation-grid">
        {trackSideSignals.map((s) => (
          <MitigationCard key={s.key} signal={s} maxScore={maxScore} />
        ))}
      </div>

      {operationalSignals.some((s) => s.count > 0) && (
        <>
          <h2 className="mitigation-section-title">Not a bridge-structure procurement item</h2>
          <div className="mitigation-grid">
            {operationalSignals.map((s) => (
              <MitigationCard key={s.key} signal={s} maxScore={maxScore} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
