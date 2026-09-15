import { createClient } from '@supabase/supabase-js';

// Public (anon) key — safe to expose in the browser bundle. This client is
// only ever used to consume a signed upload URL/token that the server (with
// the service role key) generated; it has no ambient write access on its own.
let client = null;

export function getBrowserSupabase() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  }

  client = createClient(url, anonKey);
  return client;
}
