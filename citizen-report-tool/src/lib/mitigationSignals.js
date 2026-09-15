// Maps what a citizen report + its on-device spectral analysis can observe
// to the category of physical intervention it's evidence for, and
// aggregates that across all reports into a procurement-facing ranking.
//
// Rule-based rather than statistical: the dataset is small, self-reported,
// and multi-select, so hand-authored acoustic-engineering signatures (which
// sound character + felt vibration + duration envelope typically indicate
// in rail-noise-control practice) are both more defensible to a reviewer
// and easier to audit line-by-line than a trained classifier would be.
//
// Each category names concrete track/structure interventions so a
// procurement decision has a next step, not just a diagnosis. `RECURRING_WEIGHT`
// and `friction_squeal`/dominant-band checks are the only numeric judgment
// calls here — see inline comments for the acoustic reasoning behind each.

const RECURRING_WEIGHT = {
  first_time: 1,
  occasional: 2,
  frequent_daily: 3,
  constant: 4,
};

// Curve/wheel-flange squeal is a high-frequency stick-slip phenomenon
// (typically >1kHz); low-frequency rumble/hum is the structure-borne or
// rolling-noise band (typically <250Hz). Used only to *corroborate* a
// self-reported sound_character, never to override it — the on-device
// analysis is uncalibrated and per-device, so it's a supporting signal.
const HIGH_FREQ_HZ = 1000;
const LOW_FREQ_HZ = 300;

export const MITIGATION_CATEGORIES = [
  {
    key: 'friction_squeal',
    label: 'Wheel/rail friction (curve squeal)',
    signature: 'High-frequency screech, not felt as structural vibration, usually brief',
    mitigations: [
      'Top-of-rail friction modifiers',
      'Wayside or onboard rail lubrication',
      'Rail & wheel profile grinding',
    ],
    matches: (r) => (r.report_data?.sound_character || []).includes('screech_squeal'),
  },
  {
    key: 'structural_vibration',
    label: 'Structure-borne noise (bridge re-radiation)',
    signature: 'Low rumble/hum reported together with felt vibration — the deck is re-radiating structural vibration as sound',
    mitigations: [
      'Resilient direct-fixation rail fasteners',
      'Elastomeric rail pads / under-rail damping',
      'Tuned mass dampers on the structure',
    ],
    matches: (r) =>
      (r.report_data?.sound_character || []).includes('rumble_hum') && r.report_data?.felt_vibration === true,
  },
  {
    key: 'rolling_noise',
    label: 'Rolling noise (wheel/rail roughness)',
    signature: 'Low rumble/hum without felt vibration — airborne rolling noise, not structural re-radiation',
    mitigations: [
      'Rail grinding / wheel truing program',
      'Acoustic rail dampers (tuned absorbers clipped to the rail web)',
    ],
    matches: (r) =>
      (r.report_data?.sound_character || []).includes('rumble_hum') && r.report_data?.felt_vibration !== true,
  },
  {
    key: 'joint_impact',
    label: 'Impact noise (joints / deck plates)',
    signature: 'Clatter or banging, reported as a sudden burst or a few seconds — an impulsive impact, not a sustained tone',
    mitigations: [
      'Rail joint welding (continuous welded rail)',
      'Deck expansion-joint hardware maintenance',
      'Deck panel damping mats',
    ],
    matches: (r) =>
      (r.report_data?.sound_character || []).includes('clatter_bang') &&
      ['sudden_burst', 'few_seconds'].includes(r.report_data?.duration_pattern),
  },
  {
    key: 'brake_maintenance',
    label: 'Brake noise',
    signature: 'Reported brake sound — a rolling-stock maintenance issue, not a bridge-structure one',
    mitigations: ['Brake shoe/pad composition review (operator-side, not a bridge procurement item)'],
    trackSide: false,
    matches: (r) => (r.report_data?.sound_character || []).includes('brakes'),
  },
  {
    key: 'operational_horn',
    label: 'Horn / whistle',
    signature: 'Reported horn or whistle — an operational sound, not something track/structure hardware controls',
    mitigations: ['Quiet-zone / wayside horn policy review (operational, not a bridge procurement item)'],
    trackSide: false,
    matches: (r) => (r.report_data?.sound_character || []).includes('horn_whistle'),
  },
];

function bucketKey(lat, lon) {
  // ~111m grid (3 decimal places) — coarse enough to group repeat reports
  // from "the same spot on the bridge," fine enough to separate spans.
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function isCorroborated(category, report) {
  const bandHz = report.spectral?.summary?.dominant_band_hz;
  if (typeof bandHz !== 'number') return false;
  if (category.key === 'friction_squeal') return bandHz >= HIGH_FREQ_HZ;
  if (category.key === 'structural_vibration' || category.key === 'rolling_noise') return bandHz <= LOW_FREQ_HZ;
  return false;
}

function hotspotsFor(reports) {
  const buckets = new Map();
  reports.forEach((r) => {
    if (typeof r.lat !== 'number' || typeof r.lon !== 'number') return;
    const key = bucketKey(r.lat, r.lon);
    const bucket = buckets.get(key) || { lat: r.lat, lon: r.lon, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
  });
  return [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 3);
}

export function classifyReport(report) {
  return MITIGATION_CATEGORIES.filter((c) => c.matches(report)).map((c) => ({
    category: c,
    corroborated: isCorroborated(c, report),
  }));
}

export function aggregateMitigationSignals(reports) {
  return MITIGATION_CATEGORIES.map((category) => {
    const matched = reports.filter((r) => category.matches(r));
    const count = matched.length;

    const annoyances = matched.map((r) => r.report_data?.annoyance).filter((v) => typeof v === 'number');
    const avgAnnoyance = annoyances.length ? annoyances.reduce((a, b) => a + b, 0) / annoyances.length : null;

    const feltVibrationCount = matched.filter((r) => r.report_data?.felt_vibration === true).length;
    const sleepInterruptedCount = matched.filter((r) => r.report_data?.activity_interrupted === 'sleep').length;
    const corroboratedCount = matched.filter((r) => isCorroborated(category, r)).length;

    const severityWeight = matched.reduce((sum, r) => {
      const recurringWeight = RECURRING_WEIGHT[r.report_data?.recurring] || 1;
      const annoyance = typeof r.report_data?.annoyance === 'number' ? r.report_data.annoyance : 5;
      return sum + annoyance * recurringWeight;
    }, 0);

    return {
      ...category,
      count,
      avgAnnoyance,
      pctFeltVibration: count ? feltVibrationCount / count : 0,
      pctSleepInterrupted: count ? sleepInterruptedCount / count : 0,
      pctCorroborated: count ? corroboratedCount / count : 0,
      score: severityWeight,
      hotspots: hotspotsFor(matched),
    };
  }).sort((a, b) => b.score - a.score);
}
