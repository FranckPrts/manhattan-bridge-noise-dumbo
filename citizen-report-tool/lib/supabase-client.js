import { createClient } from '@supabase/supabase-js';

export const MEDIA_BUCKET = 'report-media';
const REPORTS_TABLE = 'reports';
const SIGNED_READ_TTL_SEC = 60 * 60; // 1 hour — long enough to view/play in one sitting

let client = null;

export function getClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  // SUPABASE_SERVICE_ROLE_KEY is the legacy name; newer Supabase projects
  // issue this as a "secret key" instead (SUPABASE_SECRET_KEY) — accept either.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase credentials in environment (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY)');
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return client;
}

// Verifies a browser-supplied access token (from the signed-in user's
// Supabase Auth session) and returns the user it belongs to. Works with the
// service-role client — it just forwards the token to Supabase Auth.
export async function getUserFromToken(supabase, accessToken) {
  if (!accessToken) return null;

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}

// Media (audio, image, video) is uploaded directly from the browser to
// Supabase Storage via a short-lived signed URL, bypassing the Vercel
// function entirely — keeps large files off the serverless request body
// (size + execution time limits) and off this function's memory.
export async function createSignedUploadUrl(supabase, path) {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);

  if (error) {
    throw new Error(`Supabase signed upload URL failed: ${error.message}`);
  }

  return data; // { path, token, signedUrl }
}

export async function createSignedReadUrl(supabase, path) {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_READ_TTL_SEC);

  if (error) {
    throw new Error(`Supabase signed read URL failed: ${error.message}`);
  }

  return data.signedUrl;
}

export async function insertReport(supabase, report) {
  const { error } = await supabase.from(REPORTS_TABLE).insert({
    id: report.id,
    schema_v: report.schema_v,
    user_id: report.user_id,
    timestamp: report.timestamp,
    lat: report.location.lat,
    lon: report.location.lon,
    report_data: report.report_data,
    spectral: report.spectral,
    device: report.device,
    media: report.media,
  });

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
}

export async function listReportsForUser(supabase, userId) {
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Supabase list failed: ${error.message}`);
  }

  return data;
}

// Looks up a report and confirms it belongs to userId before returning it —
// callers use this to authorize a delete without trusting the client.
export async function getOwnedReport(supabase, userId, reportId) {
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select('*')
    .eq('id', reportId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase lookup failed: ${error.message}`);
  }

  return data;
}

export async function deleteReport(supabase, userId, reportId) {
  const report = await getOwnedReport(supabase, userId, reportId);
  if (!report) {
    return false; // not found, or not owned by this user
  }

  const paths = (report.media || []).map((m) => m.path).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    if (storageError) {
      throw new Error(`Supabase media delete failed: ${storageError.message}`);
    }
  }

  const { error } = await supabase.from(REPORTS_TABLE).delete().eq('id', reportId).eq('user_id', userId);
  if (error) {
    throw new Error(`Supabase report delete failed: ${error.message}`);
  }

  return true;
}

export async function checkConnection(supabase) {
  const { error } = await supabase.from(REPORTS_TABLE).select('id', { count: 'exact', head: true });
  if (error) {
    throw new Error(`Supabase connection check failed: ${error.message}`);
  }
  return true;
}
