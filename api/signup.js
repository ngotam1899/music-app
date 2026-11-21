// POST /api/signup — create a normal "user" account from a username + password.
// Accounts are created server-side (already confirmed), so no e-mail is needed.
import { adminClient, readBody, send, handle, fail } from './_supabase.js';
import { USERNAME_RE, usernameToEmail } from '../src/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  return handle(res, async () => {
    const b = readBody(req);
    const username = String(b.username || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 80);
    const cls = String(b.cls || '').trim().slice(0, 60);
    const password = String(b.password || '');
    if (!name) fail('Please enter your full name.');
    if (!USERNAME_RE.test(username)) fail('Username: 3–20 characters, letters a-z, numbers, dot or underscore.');
    if (password.length < 6 || password.length > 72) fail('Password must be 6–72 characters.');

    const sb = adminClient();
    const { error } = await sb.auth.admin.createUser({
      email: usernameToEmail(username), password, email_confirm: true,
      user_metadata: { username, name, cls },
    });
    if (error) fail(/already|exists|registered|duplicate/i.test(error.message) ? 'This username is already taken.' : error.message);
    return send(res, 200, { ok: true });
  });
}
