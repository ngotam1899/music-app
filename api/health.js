// GET /api/health — deployment diagnostics. Shows only yes/no checks and
// Supabase error messages; never returns any key or secret value.
import { createClient } from '@supabase/supabase-js';
import { usernameToEmail } from '../src/config.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const E = process.env;
  const url = E.SUPABASE_URL || E.VITE_SUPABASE_URL || E.NEXT_PUBLIC_SUPABASE_URL;
  const browserUrl = E.VITE_SUPABASE_URL || E.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = E.SUPABASE_SERVICE_ROLE_KEY || E.SUPABASE_SECRET_KEY;
  const report = {
    env: {
      browserSupabaseUrl: Boolean(browserUrl),
      browserAnonKey: Boolean(E.VITE_SUPABASE_ANON_KEY || E.NEXT_PUBLIC_SUPABASE_ANON_KEY || E.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      serverSupabaseUrl: Boolean(url),
      serverServiceKey: Boolean(serviceKey),
      urlsMatch: !url || !browserUrl || url.replace(/\/+$/, '') === browserUrl.replace(/\/+$/, ''),
    },
    usernameEmailExample: usernameToEmail('example_user'),
    checks: {},
  };
  if (url && serviceKey) {
    const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const check = async (name, fn) => {
      try { const { error } = await fn(); report.checks[name] = error ? 'ERROR: ' + error.message : 'ok' }
      catch (e) { report.checks[name] = 'ERROR: ' + (e.message || String(e)) }
    };
    await check('authAdmin', () => sb.auth.admin.listUsers({ page: 1, perPage: 1 }));
    await check('profilesTable', () => sb.from('profiles').select('id', { count: 'exact', head: true }));
    await check('ticketAvailabilityFunction', () => sb.rpc('ticket_availability'));
    const { count: admins } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    report.adminAccounts = admins ?? null;
  } else {
    report.checks.server = 'ERROR: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set in Vercel';
  }
  report.ok = Object.values(report.env).every(Boolean) && Object.values(report.checks).every(v => v === 'ok');
  return res.status(200).json(report);
}
