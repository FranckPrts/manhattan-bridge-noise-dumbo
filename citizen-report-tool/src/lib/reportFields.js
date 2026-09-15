export const ACTIVITIES = [
  { value: 'sleep', label: 'Sleep' },
  { value: 'work', label: 'Work' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'relaxation', label: 'Relaxation' },
  { value: 'other', label: 'Other' },
  { value: 'none', label: 'None' },
];

export const DIRECTIONS = [
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
  { value: 'unknown', label: "Don't know" },
];

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

// Per-event source/cause tag, assigned after recording (not live) to each
// citizen-captured loud moment — separate from SOUND_CHARACTERS, which
// describes the whole clip's acoustic quality, not what caused one moment.
export const EVENT_TYPES = [
  { value: 'train_passing', label: 'Train passing', icon: '🚂' },
  { value: 'horn_whistle', label: 'Horn / whistle', icon: '📯' },
  { value: 'screech_brakes', label: 'Screech / brakes', icon: '🔊' },
  { value: 'siren', label: 'Siren', icon: '🚨' },
  { value: 'construction', label: 'Construction', icon: '🔨' },
  { value: 'other', label: 'Other', icon: '❓' },
];

export function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label || value;
}

export function labelsFor(options, values) {
  return (values || []).map((v) => labelFor(options, v));
}
