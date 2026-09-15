export const ACTIVITIES = ['sleep', 'work', 'conversation', 'relaxation', 'other', 'none'];
export const DIRECTIONS = ['north', 'south', 'east', 'west', 'unknown'];

// Official channels (NYC 311, the NYC Noise Code) have no category for
// rail/subway noise at all — residents can't file a complaint that names
// what they're hearing. These options exist so citizen reports can. Shared
// between the form (ReportForm.jsx) and the answer review (ReportsList.jsx).
export const SOUND_CHARACTERS = [
  { value: 'screech_squeal', label: 'Screech / squeal' },
  { value: 'rumble_hum', label: 'Rumble / low hum' },
  { value: 'clatter_bang', label: 'Clatter / banging' },
  { value: 'horn_whistle', label: 'Horn / whistle' },
  { value: 'brakes', label: 'Brakes' },
  { value: 'other', label: 'Other' },
];

export const DURATION_PATTERNS = [
  { value: 'sudden_burst', label: 'Sudden burst (<2s)' },
  { value: 'few_seconds', label: 'A few seconds' },
  { value: 'sustained', label: 'Sustained (10s+)' },
  { value: 'continuous', label: 'Continuous / ongoing' },
];

export const RECURRING_OPTIONS = [
  { value: 'first_time', label: 'First time I noticed it' },
  { value: 'occasional', label: 'Happens occasionally' },
  { value: 'frequent_daily', label: 'Happens daily' },
  { value: 'constant', label: 'Constant / ongoing problem' },
];

export const BEHAVIORAL_RESPONSES = [
  { value: 'covered_ears', label: 'Covered ears' },
  { value: 'left_area', label: 'Left the area' },
  { value: 'closed_windows', label: 'Closed windows' },
];

export function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label || value;
}

export function labelsFor(options, values) {
  return (values || []).map((v) => labelFor(options, v));
}
