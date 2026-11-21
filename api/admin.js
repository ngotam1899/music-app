// POST /api/admin — admin actions that need the Supabase service-role key.
// The caller must send their own session token; only active admins are allowed.
import { randomInt } from 'node:crypto';
import { adminClient, readBody, send, handle, fail } from './_supabase.js';
import { USERNAME_RE, usernameToEmail } from '../src/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  return handle(res, async () => {
    const sb = adminClient();
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) fail('Please sign in first', 401);
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) fail('Your session has expired. Please log in again.', 401);
    const { data: me } = await sb.from('profiles').select('id,role,active').eq('id', user.id).maybeSingle();
    if (!me || me.role !== 'admin' || !me.active) fail('Admins only', 403);

    const b = readBody(req);
    const activeAdmins = async () => {
      const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
      return count || 0;
    };

    switch (b.action) {
      case 'createUser': {
        const username = String(b.username || '').trim().toLowerCase();
        const name = String(b.name || '').trim().slice(0, 80);
        const cls = String(b.cls || '').trim().slice(0, 60);
        const password = String(b.password || '');
        const role = b.role === 'admin' ? 'admin' : 'user';
        if (!name || !USERNAME_RE.test(username) || password.length < 6) fail('Check name, username (3–20) and password (min 6)');
        const { data, error } = await sb.auth.admin.createUser({
          email: usernameToEmail(username), password, email_confirm: true, user_metadata: { username, name, cls },
        });
        if (error) fail(/already|exists|registered|duplicate/i.test(error.message) ? 'Username already taken' : error.message);
        if (role === 'admin') {
          const { error: e2 } = await sb.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
          if (e2) fail(e2.message);
        }
        return send(res, 200, { ok: true });
      }
      case 'resetPassword': {
        const password = String(randomInt(100000, 1000000));
        const { error } = await sb.auth.admin.updateUserById(String(b.userId), { password });
        if (error) fail(error.message);
        return send(res, 200, { password });
      }
      case 'deleteUser': {
        const id = String(b.userId || '');
        if (id === me.id) fail('You cannot delete yourself');
        const { data: target } = await sb.from('profiles').select('role,active').eq('id', id).maybeSingle();
        if (!target) fail('User not found', 404);
        if (target.role === 'admin' && target.active && await activeAdmins() <= 1) fail('Keep at least one active admin');
        const { error } = await sb.auth.admin.deleteUser(id);
        if (error) fail(error.message);
        return send(res, 200, { ok: true });
      }
      case 'resetEvent': {
        const { data: users, error } = await sb.from('profiles').select('id').eq('role', 'user');
        if (error) fail(error.message);
        for (const u of users) {
          const { error: e } = await sb.auth.admin.deleteUser(u.id);
          if (e) fail(e.message);
        }
        const { error: e3 } = await sb.rpc('reset_event_data');
        if (e3) fail(e3.message);
        return send(res, 200, { ok: true, deletedUsers: users.length });
      }
      default:
        fail('Unknown action');
    }
  });
}
