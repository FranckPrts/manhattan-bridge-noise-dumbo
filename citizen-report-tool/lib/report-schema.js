export function validateReport(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Body must be a JSON object'] };
  }

  // Required: timestamp
  if (!body.timestamp || typeof body.timestamp !== 'string') {
    errors.push('timestamp: required, must be ISO 8601 UTC string');
  } else {
    try {
      new Date(body.timestamp);
    } catch {
      errors.push('timestamp: invalid ISO 8601 format');
    }
  }

  // Required: location with lat/lon
  if (!body.location || typeof body.location !== 'object') {
    errors.push('location: required, must be an object');
  } else {
    if (typeof body.location.lat !== 'number' || body.location.lat < -90 || body.location.lat > 90) {
      errors.push('location.lat: required, must be a number between -90 and 90');
    }
    if (typeof body.location.lon !== 'number' || body.location.lon < -180 || body.location.lon > 180) {
      errors.push('location.lon: required, must be a number between -180 and 180');
    }
  }

  // Required: report_data — free-form JSON, shape owned by the frontend form,
  // not enforced here (lets the form evolve without a schema migration each time)
  if (!body.report_data || typeof body.report_data !== 'object' || Array.isArray(body.report_data)) {
    errors.push('report_data: required, must be a JSON object');
  }

  // Optional: spectral (check shape if present, but don't require it in Phase 1)
  if (body.spectral !== undefined && body.spectral !== null) {
    if (typeof body.spectral !== 'object') {
      errors.push('spectral: if provided, must be an object or null');
    }
  }

  // Optional: device
  if (body.device !== undefined && body.device !== null) {
    if (typeof body.device !== 'string') {
      errors.push('device: if provided, must be a string');
    }
  }

  // Optional: media — references to files already uploaded directly to
  // Supabase Storage (via /api/upload-url + a signed URL), not raw bytes here
  const MEDIA_KINDS = ['audio', 'image', 'video'];
  if (body.media !== undefined && body.media !== null) {
    if (!Array.isArray(body.media)) {
      errors.push('media: if provided, must be an array');
    } else {
      body.media.forEach((item, i) => {
        if (!item || typeof item !== 'object') {
          errors.push(`media[${i}]: must be an object`);
          return;
        }
        if (typeof item.path !== 'string' || !item.path) {
          errors.push(`media[${i}].path: required, must be a string (the Supabase Storage path)`);
        }
        if (typeof item.mime_type !== 'string' || !item.mime_type) {
          errors.push(`media[${i}].mime_type: required, must be a string`);
        }
        if (!MEDIA_KINDS.includes(item.kind)) {
          errors.push(`media[${i}].kind: required, must be one of: ${MEDIA_KINDS.join(', ')}`);
        }
        if (item.duration_sec !== undefined && (typeof item.duration_sec !== 'number' || item.duration_sec <= 0)) {
          errors.push(`media[${i}].duration_sec: if provided, must be a positive number`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function enrichReport(body) {
  return {
    id: crypto.randomUUID(),
    schema_v: 1,
    timestamp: body.timestamp,
    location: body.location,
    report_data: body.report_data,
    spectral: body.spectral ?? null,
    device: body.device ?? null,
    media: body.media ?? [],
  };
}
