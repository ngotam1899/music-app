// GET /api/health — deployment diagnostics. Shows only yes/no checks and
// Supabase error messages; never returns any key or secret value.
import { createClient } from '@supabase/supabase-js';
import { usernameToEmail } from '../src/config.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const report = {
    env: {
      VITE_SUPABASE_URL: Boolean(process.env.VITE_SUPABASE_URL),
      VITE_SUPABASE_ANON_KEY: Boolean(process.env.VITE_SUPABASE_ANON_KEY),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      urlsMatch: !process.env.SUPABASE_URL || !process.env.VITE_SUPABASE_URL
        || process.env.SUPABASE_URL.replace(/\/+$/, '') === process.env.VITE_SUPABASE_URL.replace(/\/+$/, ''),
    },
    usernameEmailExample: usernameToEmail('example_user'),
    checks: {},
  };
  if (url && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
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
