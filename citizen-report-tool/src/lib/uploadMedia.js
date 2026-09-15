import { getBrowserSupabase } from './supabaseClient.js';

// Uploads a blob directly to Supabase Storage: requests a short-lived signed
// URL from our API (server holds the service role key), then uploads straight
// from the browser — the file bytes never pass through a Vercel function.
export async function uploadMedia(blob, { kind, durationSec, accessToken } = {}) {
  const urlRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ content_type: blob.type, kind }),
  });

  if (!urlRes.ok) {
    const err = await urlRes.json().catch(() => ({}));
    throw new Error(err.message || `Could not get upload URL (${urlRes.status})`);
  }

  const { path, token, bucket } = await urlRes.json();

  const supabase = getBrowserSupabase();
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, blob);

  if (error) {
    throw new Error(`Media upload failed: ${error.message}`);
  }

  return {
    path,
    mime_type: blob.type,
    kind,
    ...(durationSec !== undefined ? { duration_sec: durationSec } : {}),
  };
}
