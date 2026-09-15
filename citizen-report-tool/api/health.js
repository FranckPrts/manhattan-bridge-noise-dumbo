import '../lib/env.js';
import { getClient, checkConnection } from '../lib/supabase-client.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getClient();
    await checkConnection(supabase);

    return res.status(200).json({
      status: 'ok',
      backend: 'supabase',
      url: process.env.SUPABASE_URL,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check error:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
}
