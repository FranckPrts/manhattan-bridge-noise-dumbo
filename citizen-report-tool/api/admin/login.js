import '../../lib/env.js';
import { verifyPassword, signAdminToken, ADMIN_COOKIE_NAME } from '../../lib/require-admin.js';

const SESSION_MAX_AGE_SEC = 12 * 60 * 60; // 12 hours, matches lib/require-admin.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password } = req.body || {};

    if (!verifyPassword(password)) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = signAdminToken();
    res.setHeader(
      'Set-Cookie',
      `${ADMIN_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}`
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ error: 'Login failed', message: err.message });
  }
}
