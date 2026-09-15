const RELATIONSHIPS = ['resident', 'worker', 'regular_visitor', 'occasional_visitor'];
const TENURES = ['lt_1yr', '1_5yr', '5yr_plus'];
const GLAZING = ['single', 'double', 'not_sure', 'na'];
const CONTEXTS = ['home', 'work', 'park', 'transit', 'other'];

// All fields are individually optional — a partially-filled profile is a
// valid, expected state (see ProfileArea.jsx's completeness pill), not a
// validation error. Only the *values*, when present, are constrained.
export function validateProfile(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Body must be a JSON object'] };
  }

  if (body.relationship != null && !RELATIONSHIPS.includes(body.relationship)) {
    errors.push(`relationship: must be one of ${RELATIONSHIPS.join(', ')}`);
  }
  if (body.tenure != null && !TENURES.includes(body.tenure)) {
    errors.push(`tenure: must be one of ${TENURES.join(', ')}`);
  }
  if (body.glazing != null && !GLAZING.includes(body.glazing)) {
    errors.push(`glazing: must be one of ${GLAZING.join(', ')}`);
  }
  if (body.typical_context != null && !CONTEXTS.includes(body.typical_context)) {
    errors.push(`typical_context: must be one of ${CONTEXTS.join(', ')}`);
  }
  if (body.longitudinal_consent !== undefined && typeof body.longitudinal_consent !== 'boolean') {
    errors.push('longitudinal_consent: must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

export function sanitizeProfile(body) {
  return {
    relationship: body.relationship ?? null,
    tenure: body.tenure ?? null,
    glazing: body.glazing ?? null,
    typical_context: body.typical_context ?? null,
    longitudinal_consent: body.longitudinal_consent ?? false,
  };
}
