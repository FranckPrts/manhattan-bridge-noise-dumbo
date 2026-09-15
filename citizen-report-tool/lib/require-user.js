import { getUserFromToken } from './supabase-client.js';

export class UnauthorizedError extends Error {}

export async function requireUser(req, supabase) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const user = token ? await getUserFromToken(supabase, token) : null;
  if (!user) {
    throw new UnauthorizedError('Missing or invalid session — please sign in again');
  }

  return user;
}
