import '../lib/env.js';
import { getClient, insertReport, deleteReport } from '../lib/supabase-client.js';
import { validateReport, enrichReport } from '../lib/report-schema.js';
import { requireUser, UnauthorizedError } from '../lib/require-user.js';

export default async function handler(req, res) {
  const supabase = getClient();

  try {
    const user = await requireUser(req, supabase);

    if (req.method === 'POST') {
      const validation = validateReport(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid payload', errors: validation.errors });
      }

      const report = enrichReport(req.body);
      report.user_id = user.id;

      await insertReport(supabase, report);

      return res.status(201).json({
        id: report.id,
        schema_v: report.schema_v,
        timestamp: report.timestamp,
      });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id query parameter is required' });
      }

      const deleted = await deleteReport(supabase, user.id, id);
      if (!deleted) {
        return res.status(404).json({ error: 'Report not found' });
      }

      return res.status(200).json({ id, deleted: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error('Report endpoint error:', err);
    return res.status(500).json({ error: 'Request failed', message: err.message });
  }
}
