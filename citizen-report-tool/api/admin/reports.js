import '../../lib/env.js';
import { getClient, listAllReports, createSignedReadUrl } from '../../lib/supabase-client.js';
import { requireAdmin, UnauthorizedError } from '../../lib/require-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    requireAdmin(req);

    const supabase = getClient();
    const reports = await listAllReports(supabase);

    const withPlaybackUrls = await Promise.all(
      reports.map(async (report) => {
        const media = await Promise.all(
          (report.media || []).map(async (item) => ({
            ...item,
            url: await createSignedReadUrl(supabase, item.path),
          }))
        );
        return { ...report, media };
      })
    );

    return res.status(200).json({ reports: withPlaybackUrls });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error('Admin list reports error:', err);
    return res.status(500).json({ error: 'Failed to list reports', message: err.message });
  }
}
