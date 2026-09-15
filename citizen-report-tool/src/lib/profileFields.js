// Answers only what a report-by-report schema can't: who is exposed, for how
// long, and how mitigated their indoor exposure already is. This is what
// turns repeat reports from one identity into a longitudinal exposure panel
// rather than a pile of unrelated one-off complaints.
export const RELATIONSHIPS = [
  { value: 'resident', label: 'I live here' },
  { value: 'worker', label: 'I work here' },
  { value: 'regular_visitor', label: 'I visit regularly' },
  { value: 'occasional_visitor', label: 'I visit occasionally' },
];

export const TENURES = [
  { value: 'lt_1yr', label: 'Less than 1 year' },
  { value: '1_5yr', label: '1–5 years' },
  { value: '5yr_plus', label: '5+ years' },
];

export const GLAZING_OPTIONS = [
  { value: 'single', label: 'Single-pane windows' },
  { value: 'double', label: 'Double-glazed / soundproofed windows' },
  { value: 'not_sure', label: "Not sure" },
  { value: 'na', label: 'Not applicable' },
];

export const TYPICAL_CONTEXTS = [
  { value: 'home', label: 'At home' },
  { value: 'work', label: 'At work' },
  { value: 'park', label: 'In the park / outdoors' },
  { value: 'transit', label: 'Commuting / in transit' },
  { value: 'other', label: 'Other' },
];

export const PROFILE_FIELDS = ['relationship', 'tenure', 'glazing', 'typical_context'];

// Consent is deliberately excluded — it's opt-in, not a completeness
// requirement, matching the existing backup-email philosophy of "opt-in, not
// a gate" (see BackupEmail.jsx).
export function isProfileComplete(profile) {
  if (!profile) return false;
  return PROFILE_FIELDS.every((field) => !!profile[field]);
}
