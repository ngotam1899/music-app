// Cloud backend: Supabase (Auth + Postgres with Row Level Security).
// Admin-only actions that need the service-role key go through /api/admin
// (a Vercel serverless function), so that key never reaches the browser.
import { createClient } from '@supabase/supabase-js';
import { BOOKABLE_EVENTS, usernameToEmail } from '../config.js';

const fail = m => { throw new Error(m) };
const ok = ({ data, error }) => { if (error) fail(error.message); return data };

export function createSupabaseStore(url, anonKey) {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  let S = emptyState();

  function emptyState() {
    return { profile: null, users: [], inv: {}, avail: {}, merch: {}, votes: {}, myTickets: [], allTickets: [], quiz: [], myQuiz: [], myWish: [], wishAll: {} };
  }
  const mapProfile = p => ({ id: p.id, u: p.username, name: p.name, cls: p.cls, role: p.role, active: p.active, at: Date.parse(p.created_at) });
  const mapTicket = r => ({
    code: r.code, evId: r.event_id, ev: r.event_title, when: r.event_when, typeId: r.type_id, type: r.type_name,
    qty: r.qty, seatList: r.seats || [], seats: (r.seats || []).length ? r.seats.join(', ') : 'Standing',
    uid: r.user_id, u: r.username, name: r.name, cls: r.cls, phone: r.phone, pledge: r.pledge, status: r.status, at: Date.parse(r.created_at),
  });
  const mapQuiz = q => ({ uid: q.user_id, u: q.username, name: q.name, cls: q.cls, score: q.score, total: q.total, answers: q.answers || [], at: Date.parse(q.created_at) });
  const mapPost = r => ({ id: r.id, uid: r.user_id, author: r.author_name, cls: r.author_cls, title: r.title, caption: r.caption, yt: r.youtube_id, images: r.images || [], at: Date.parse(r.created_at), edited: Date.parse(r.updated_at) - Date.parse(r.created_at) > 2000 });
  const mapComment = r => ({ id: r.id, postId: r.post_id, uid: r.user_id, author: r.author_name, cls: r.author_cls, body: r.body, at: Date.parse(r.created_at) });
  let V = { posts: [], comments: [] };
  const BUCKET = 'vlog-images';
  const extOf = f => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[f.type] || 'jpg';
  async function uploadImages(files) {
    const me = uid(), paths = [];
    for (const f of files) {
      const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(f)}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
      if (error) { if (paths.length) await sb.storage.from(BUCKET).remove(paths); fail('Image upload failed: ' + error.message) }
      paths.push(path);
    }
    return paths;
  }
  const isAdmin = () => S.profile?.role === 'admin' && S.profile?.active;
  const uid = () => S.profile?.id || fail('Please sign in first');

  async function load() {
    const { data: { session } } = await sb.auth.getSession();
    const next = emptyState();
    const [avail, merch, votes, prof] = await Promise.all([
      sb.rpc('ticket_availability'),
      sb.rpc('merch_availability'),
      sb.from('votes').select('act_id,user_id'),
      session ? sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    ok(avail).forEach(r => {
      (next.inv[r.event_id] ??= {})[r.type_id] = r.capacity;
      (next.avail[r.event_id] ??= {})[r.type_id] = { issued: r.issued, seats: r.seats || [] };
    });
    ok(merch).forEach(m => { next.merch[m.item] = { stock: m.stock, given: m.given, requested: m.requested || 0, images: m.images || [] } });
    ok(votes).forEach(v => { (next.votes[v.act_id] ??= []).push(v.user_id) });
    const p = ok(prof);
    if (session && (!p || !p.active)) { await sb.auth.signOut({ scope: 'local' }); S = next; if (p && !p.active) fail('This account is locked. Please contact the admin.'); return }
    if (p) {
      next.profile = mapProfile(p);
      const [mine, wish, myq] = await Promise.all([
        sb.from('tickets').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
        sb.from('wishlist').select('item').eq('user_id', p.id),
        sb.from('quiz_attempts').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
      ]);
      next.myTickets = ok(mine).map(mapTicket);
      next.myWish = ok(wish).map(w => w.item);
      next.myQuiz = ok(myq).map(mapQuiz);
      if (p.role === 'admin') {
        const [users, all, quiz, wishAll] = await Promise.all([
          sb.from('profiles').select('*').order('created_at'),
          sb.from('tickets').select('*').order('created_at', { ascending: false }),
          sb.from('quiz_attempts').select('*').order('created_at', { ascending: false }),
          sb.from('wishlist').select('user_id,item'),
        ]);
        next.users = ok(users).map(mapProfile);
        next.allTickets = ok(all).map(mapTicket);
        next.quiz = ok(quiz).map(mapQuiz);
        ok(wishAll).forEach(w => { (next.wishAll[w.user_id] ??= []).push(w.item) });
      } else next.users = [next.profile];
    }
    BOOKABLE_EVENTS.forEach(e => { next.inv[e] ??= {}; next.avail[e] ??= {} });
    S = next;
  }

  async function api(path, body, auth) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) fail('Please sign in first');
      headers.Authorization = 'Bearer ' + session.access_token;
    }
    let res;
    try { res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) }) }
    catch (e) { fail('Cannot reach the server. Please try again.') }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) fail(json.error || `Server error (${res.status})`);
    return json;
  }

  const store = {
    mode: 'cloud',
    async init() { try { await load() } catch (e) { console.error(e); throw e } },
    refresh: load,

    me: () => S.profile,
    users: () => S.users,
    cap: (ev, t) => S.inv[ev]?.[t] ?? 0,
    issued: (ev, t) => S.avail[ev]?.[t]?.issued ?? 0,
    taken: ev => new Set(Object.values(S.avail[ev] || {}).flatMap(a => a.seats)),
    tickets: () => isAdmin() ? S.allTickets : S.myTickets,
    myTickets: () => S.myTickets,
    quiz: () => S.quiz,
    myQuiz: () => S.myQuiz,
    votes: id => S.votes[id] || [],
    myWish: () => S.myWish,
    wishAll: () => S.wishAll,
    merch: n => S.merch[n] || { stock: 0, given: 0, requested: 0, images: [] },
    merchImageUrl: path => sb.storage.from('merch-images').getPublicUrl(path).data.publicUrl,
    async setMerchImages(item, { keep, files, removed }) {
      const slug = item.toLowerCase().replace(/[^a-z0-9]+/g, '-'), added = [];
      for (const f of files) {
        const path = `items/${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(f)}`;
        const { error } = await sb.storage.from('merch-images').upload(path, f, { contentType: f.type, upsert: false });
        if (error) { if (added.length) await sb.storage.from('merch-images').remove(added); fail('Photo upload failed: ' + error.message) }
        added.push(path);
      }
      const { error } = await sb.rpc('set_merch_images', { p_item: item, p_images: [...keep, ...added] });
      if (error) { if (added.length) await sb.storage.from('merch-images').remove(added); fail(error.message) }
      if (removed.length) await sb.storage.from('merch-images').remove(removed);
      await load();
    },

    async login(un, pw) {
      const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(un), password: pw });
      if (error) fail(/confirm/i.test(error.message) ? 'Please confirm your account first.' : 'Wrong username or password.');
      await load();
      return S.profile || fail('Account not found.');
    },
    async signup({ u, name, cls, pw }) {
      await api('/api/signup', { username: u, password: pw, name, cls });
      return store.login(u, pw);
    },
    // 'local' = sign out only this browser; other devices stay signed in.
    // (supabase-js defaults to 'global', which revokes the user's sessions on every device.)
    async logout() { await sb.auth.signOut({ scope: 'local' }); await load() },
    async changePassword(oldPw, newPw) {
      const me = S.profile || fail('Please sign in first');
      const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(me.u), password: oldPw });
      if (error) fail('Current password is not correct.');
      ok(await sb.auth.updateUser({ password: newPw }));
    },

    async book({ ev, evTitle, evWhen, type, typeName, qty, seats, phone, pledge }) {
      const r = ok(await sb.rpc('book_ticket', { p_event: ev, p_event_title: evTitle, p_event_when: evWhen, p_type: type, p_type_name: typeName, p_qty: qty, p_seats: seats, p_phone: phone || '', p_pledge: pledge || '' }));
      await load(); return mapTicket(r);
    },
    /* ---- Performance Vlog ---- */
    async vlogLoad() {
      const [p, c] = await Promise.all([
        sb.from('vlog_posts').select('*').order('created_at', { ascending: false }),
        sb.from('vlog_comments').select('*').order('created_at', { ascending: true }),
      ]);
      V = { posts: ok(p).map(mapPost), comments: ok(c).map(mapComment) };
      return V;
    },
    vlog: () => V,
    imageUrl: path => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    async vlogCreate({ title, caption, yt, files }) {
      uid(); const images = await uploadImages(files);
      const { error } = await sb.from('vlog_posts').insert({ title, caption, youtube_id: yt, images });
      if (error) { if (images.length) await sb.storage.from(BUCKET).remove(images); fail(error.message) }
      await store.vlogLoad();
    },
    async vlogUpdate(id, { title, caption, yt, keep, files, removed }) {
      const added = await uploadImages(files);
      const d = ok(await sb.from('vlog_posts').update({ title, caption, youtube_id: yt, images: [...keep, ...added] }).eq('id', id).select('id'));
      if (!d.length) { if (added.length) await sb.storage.from(BUCKET).remove(added); fail('Only admins can edit vlogs') }
      if (removed.length) await sb.storage.from(BUCKET).remove(removed);
      await store.vlogLoad();
    },
    async vlogDelete(id) {
      const post = V.posts.find(p => p.id === id);
      const d = ok(await sb.from('vlog_posts').delete().eq('id', id).select('id'));
      if (!d.length) fail('Not allowed');
      if (post?.images.length) await sb.storage.from(BUCKET).remove(post.images);
      await store.vlogLoad();
    },
    async commentAdd(postId, body) { uid(); ok(await sb.from('vlog_comments').insert({ post_id: postId, body })); await store.vlogLoad() },
    async commentDelete(id) { const d = ok(await sb.from('vlog_comments').delete().eq('id', id).select('id')); if (!d.length) fail('Not allowed'); await store.vlogLoad() },
    // Public ticket view for a scanned QR (no login). Returns only what is printed on the e-ticket.
    async getTicketByCode(code) {
      const rows = ok(await sb.rpc('get_ticket_public', { p_code: code }));
      const r = Array.isArray(rows) ? rows[0] : rows;
      return r ? mapTicket({ ...r, user_id: null, username: '', phone: '' }) : null;
    },
    async setTicketStatus(code, status) { ok(await sb.rpc('set_ticket_status', { p_code: code, p_status: status })); await load() },
    async toggleVote(id) {
      const me = uid(), voted = (S.votes[id] || []).includes(me);
      if (voted) ok(await sb.from('votes').delete().eq('act_id', id).eq('user_id', me));
      else ok(await sb.from('votes').insert({ act_id: id }));
      await load(); return !voted;
    },
    async toggleWish(item) {
      const me = uid();
      if (S.myWish.includes(item)) ok(await sb.from('wishlist').delete().eq('user_id', me).eq('item', item));
      else ok(await sb.from('wishlist').insert({ item }));
      await load();
    },
    async saveQuiz({ score, total, answers }) { uid(); ok(await sb.from('quiz_attempts').insert({ score, total, answers })); await load() },

    /* admin */
    async setRole(id, role) {
      const d = ok(await sb.from('profiles').update({ role }).eq('id', id).select('id'));
      if (!d.length) fail('Not allowed'); await load();
    },
    async setActive(id, active) {
      const d = ok(await sb.from('profiles').update({ active }).eq('id', id).select('id'));
      if (!d.length) fail('Not allowed'); await load();
    },
    async resetPassword(id) { const r = await api('/api/admin', { action: 'resetPassword', userId: id }, true); return r.password },
    async deleteUser(id) { await api('/api/admin', { action: 'deleteUser', userId: id }, true); await load() },
    async addUser({ u, name, cls, pw, role }) { await api('/api/admin', { action: 'createUser', username: u, name, cls, password: pw, role }, true); await load() },
    async saveCapacities(ev, caps) {
      const errs = ok(await sb.rpc('save_capacities', { p_event: ev, p_caps: caps })) || [];
      await load();
      return errs.map(s => { const [type, min, max] = s.split(':'); return { type, min: +min, max: +max } });
    },
    async giveMerch(item, delta, userId) { ok(await sb.rpc('give_merch', { p_item: item, p_delta: delta, p_user: userId || null })); await load() },
    async saveStock(map) {
      const errs = ok(await sb.rpc('save_stock', { p_stock: map })) || [];
      await load();
      return errs.map(s => { const i = s.lastIndexOf(':'); return { item: s.slice(0, i), min: +s.slice(i + 1) } });
    },
    async resetEvent() { await api('/api/admin', { action: 'resetEvent' }, true); await load() },
  };
  return store;
}
