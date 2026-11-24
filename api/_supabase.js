// Server-side helpers for Vercel functions. Files starting with "_" are not routes.
// SUPABASE_SERVICE_ROLE_KEY is read from Vercel's server environment only.
import { createClient } from '@supabase/supabase-js';

export function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Object.assign(new Error('Server is not configured (missing Supabase environment variables).'), { status: 500 });
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}') } catch (e) { return {} }
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export async function handle(res, fn) {
  try { return await fn() }
  catch (e) { return send(res, e.status || 400, { error: e.message || 'Something went wrong' }) }
}

export const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }) };
