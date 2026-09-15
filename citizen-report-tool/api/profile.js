import '../lib/env.js';
import { getClient, getProfile, upsertProfile } from '../lib/supabase-client.js';
import { validateProfile, sanitizeProfile } from '../lib/profile-schema.js';
import { requireUser, UnauthorizedError } from '../lib/require-user.js';

export default async function handler(req, res) {
  const supabase = getClient();

  try {
    const user = await requireUser(req, supabase);

    if (req.method === 'GET') {
      const profile = await getProfile(supabase, user.id);
      return res.status(200).json({ profile: profile ?? null });
    }

    if (req.method === 'PUT') {
      const validation = validateProfile(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid payload', errors: validation.errors });
      }

      const profile = sanitizeProfile(req.body);
      await upsertProfile(supabase, user.id, profile);

      return res.status(200).json({ profile });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error('Profile endpoint error:', err);
    return res.status(500).json({ error: 'Request failed', message: err.message });
  }
}
