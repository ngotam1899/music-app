// Local demo backend: everything is kept in this browser's localStorage.
// Used automatically when no Supabase settings are configured.
import { BOOKABLE_EVENTS, DEFAULT_CAPACITY, DEFAULT_STOCK, SEATS_PER_ROW, ZONE_ROWS, USERNAME_RE } from '../config.js';

const KEY = 'c10c9_db_v2', SKEY = 'c10c9_session', mem = {};
const ls = {
  get(k) { try { return localStorage.getItem(k) } catch (e) { return mem[k] ?? null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch (e) { mem[k] = v } },
  del(k) { try { localStorage.removeItem(k) } catch (e) { delete mem[k] } },
};
const rnd = () => Math.random().toString(36).slice(2, 10);
const fail = m => { throw new Error(m) };

function freshDB() {
  const t = {}; BOOKABLE_EVENTS.forEach(e => { t[e] = { ...DEFAULT_CAPACITY[e] } });
  return { users: [], tickets: [], quiz: [], votes: {}, wish: {}, inv: { tickets: t, merch: {} } };
}
let DB = null;
const save = () => ls.set(KEY, JSON.stringify(DB));

async function hashPw(pw, salt) {
  const s = salt + ':' + pw;
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'f' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }
}
async function makeUser({ u, name, cls, role = 'user', pw }) {
  const salt = rnd();
  return { u, name, cls: cls || '', role, active: true, salt, hash: await hashPw(pw, salt), at: Date.now() };
}
const pub = x => x && ({ id: x.u, u: x.u, name: x.name, cls: x.cls, role: x.role, active: x.active, at: x.at });
const curRaw = () => { const u = ls.get(SKEY); const x = u && DB.users.find(z => z.u === u); if (u && (!x || !x.active)) { ls.del(SKEY); return null } return x || null };
const activeAdmins = () => DB.users.filter(x => x.role === 'admin' && x.active).length;
const requireAdmin = () => { if (curRaw()?.role !== 'admin') fail('Admins only') };
const requireUser = () => curRaw() || fail('Please sign in first');
const mapTicket = t => ({ ...t, uid: t.u });
const liveTickets = (ev, t) => DB.tickets.filter(x => x.evId === ev && (!t || x.typeId === t) && x.status !== 'cancelled');

export const localStore = {
  mode: 'local',
  async init() {
    try { DB = JSON.parse(ls.get(KEY)) } catch (e) { }
    if (!DB || !Array.isArray(DB.users)) DB = freshDB();
    BOOKABLE_EVENTS.forEach(e => { DB.inv.tickets[e] ??= { ...DEFAULT_CAPACITY[e] } });
    Object.entries(DEFAULT_STOCK).forEach(([n, s]) => { DB.inv.merch[n] ??= { stock: s, given: 0 } });
    // Demo admin for local mode only (never created in the cloud database)
    if (!DB.users.some(x => x.role === 'admin')) DB.users.unshift(await makeUser({ u: 'admin', name: 'Administrator', cls: 'Teacher', role: 'admin', pw: 'admin123' }));
    save();
  },
  async refresh() { },

  me: () => pub(curRaw()),
  users: () => curRaw()?.role === 'admin' ? DB.users.map(pub) : (curRaw() ? [pub(curRaw())] : []),
  cap: (ev, t) => DB.inv.tickets[ev][t],
  issued: (ev, t) => liveTickets(ev, t).reduce((a, x) => a + x.qty, 0),
  taken: ev => new Set(liveTickets(ev).flatMap(x => x.seatList || [])),
  tickets: () => curRaw()?.role === 'admin' ? DB.tickets.map(mapTicket) : localStore.myTickets(),
  myTickets: () => { const u = curRaw(); return u ? DB.tickets.filter(t => t.u === u.u).map(mapTicket) : [] },
  quiz: () => curRaw()?.role === 'admin' ? DB.quiz.map(q => ({ ...q, uid: q.u })) : [],
  myQuiz: () => { const u = curRaw(); return u ? DB.quiz.filter(q => q.u === u.u).map(q => ({ ...q, uid: q.u })) : [] },
  votes: id => DB.votes[id] || [],
  myWish: () => { const u = curRaw(); return u ? (DB.wish[u.u] || []) : [] },
  wishAll: () => curRaw()?.role === 'admin' ? DB.wish : {},
  merch: n => DB.inv.merch[n],

  async login(un, pw) {
    const u = DB.users.find(x => x.u === un);
    if (!u || await hashPw(pw, u.salt) !== u.hash) fail('Wrong username or password.');
    if (!u.active) fail('This account is locked. Please contact the admin.');
    ls.set(SKEY, u.u); return pub(u);
  },
  async signup({ u, name, cls, pw }) {
    if (DB.users.some(x => x.u === u)) fail('This username is already taken.');
    const x = await makeUser({ u, name, cls, pw }); DB.users.push(x); save(); ls.set(SKEY, x.u); return pub(x);
  },
  async logout() { ls.del(SKEY) },
  async changePassword(oldPw, newPw) {
    const u = requireUser();
    if (await hashPw(oldPw, u.salt) !== u.hash) fail('Current password is not correct.');
    u.salt = rnd(); u.hash = await hashPw(newPw, u.salt); save();
  },

  async book({ ev, evTitle, evWhen, type, typeName, qty, seats, phone, pledge }) {
    const u = requireUser(), seated = ZONE_ROWS[type].length > 0;
    if (localStore.cap(ev, type) - localStore.issued(ev, type) < qty) fail('Sorry, not enough tickets left');
    const tk = localStore.taken(ev); if (seated && seats.some(s => tk.has(s))) fail('A seat was just taken — please choose again');
    const code = '10C9-' + rnd().slice(0, 4).toUpperCase() + '-' + Date.now().toString(36).slice(-3).toUpperCase();
    const t = { code, evId: ev, ev: evTitle, when: evWhen, typeId: type, type: typeName, qty, seatList: seated ? [...seats] : [], seats: seated ? seats.join(', ') : 'Standing', u: u.u, name: u.name, cls: u.cls, phone, pledge, status: 'active', at: Date.now() };
    DB.tickets.unshift(t); save(); return mapTicket(t);
  },
  async getTicketByCode(code) { const t = DB.tickets.find(x => x.code === code); return t ? mapTicket(t) : null },
  async setTicketStatus(code, status) {
    const me = requireUser(), t = DB.tickets.find(x => x.code === code) || fail('Ticket not found');
    if (me.role !== 'admin' && !(t.u === me.u && t.status === 'active' && status === 'cancelled')) fail('Not allowed');
    if (t.status === 'cancelled' && status !== 'cancelled') {
      const tk = localStore.taken(t.evId);
      if (localStore.cap(t.evId, t.typeId) - localStore.issued(t.evId, t.typeId) < t.qty || (t.seatList || []).some(s => tk.has(s))) fail('Cannot restore: seats or tickets no longer available');
    }
    t.status = status; save();
  },
  async toggleVote(id) {
    const u = requireUser().u, l = DB.votes[id] || (DB.votes[id] = []), i = l.indexOf(u);
    if (i >= 0) l.splice(i, 1); else l.push(u); save(); return i < 0;
  },
  async toggleWish(item) {
    const u = requireUser().u, l = DB.wish[u] || (DB.wish[u] = []), i = l.indexOf(item);
    if (i >= 0) l.splice(i, 1); else l.push(item); save();
  },
  async saveQuiz(r) { const u = requireUser(); DB.quiz.unshift({ ...r, u: u.u, name: u.name, cls: u.cls, at: Date.now() }); save() },

  /* admin */
  async setRole(id, role) {
    requireAdmin(); const u = DB.users.find(x => x.u === id);
    if (!u || u.u === curRaw().u) fail('You cannot change your own role');
    if (u.role === 'admin' && role !== 'admin' && activeAdmins() <= 1) fail('Keep at least one active admin');
    u.role = role; save();
  },
  async setActive(id, active) {
    requireAdmin(); const u = DB.users.find(x => x.u === id);
    if (!u || u.u === curRaw().u) fail('You cannot lock yourself');
    if (!active && u.role === 'admin' && activeAdmins() <= 1) fail('Keep at least one active admin');
    u.active = active; save();
  },
  async resetPassword(id) {
    requireAdmin(); const u = DB.users.find(x => x.u === id) || fail('User not found');
    const pw = String(Math.floor(100000 + Math.random() * 900000));
    u.salt = rnd(); u.hash = await hashPw(pw, u.salt); save(); return pw;
  },
  async deleteUser(id) {
    requireAdmin(); const u = DB.users.find(x => x.u === id);
    if (!u || u.u === curRaw().u) fail('You cannot delete yourself');
    if (u.role === 'admin' && activeAdmins() <= 1) fail('Keep at least one active admin');
    DB.users = DB.users.filter(x => x !== u); delete DB.wish[u.u];
    Object.values(DB.votes).forEach(l => { const i = l.indexOf(u.u); if (i >= 0) l.splice(i, 1) }); save();
  },
  async addUser({ u, name, cls, pw, role }) {
    requireAdmin(); if (!USERNAME_RE.test(u)) fail('Invalid username');
    if (DB.users.some(x => x.u === u)) fail('Username already taken');
    DB.users.push(await makeUser({ u, name, cls, role, pw })); save();
  },
  async saveCapacities(ev, caps) {
    requireAdmin(); const errs = [];
    Object.entries(caps).forEach(([t, v]) => {
      const min = localStore.issued(ev, t), max = ZONE_ROWS[t].length ? ZONE_ROWS[t].length * SEATS_PER_ROW : 2000;
      if (!(Number.isInteger(v) && v >= min && v <= max)) errs.push({ type: t, min, max }); else DB.inv.tickets[ev][t] = v;
    });
    save(); return errs;
  },
  async giveMerch(item, delta, userId) {
    requireAdmin(); const m = DB.inv.merch[item] || fail('Unknown item'), nv = m.given + delta;
    if (nv < 0) fail('Already at 0'); if (nv > m.stock) fail('Out of stock');
    m.given = nv;
    if (userId) { const l = DB.wish[userId] || [], i = l.indexOf(item); if (i >= 0) l.splice(i, 1) }
    save();
  },
  async saveStock(map) {
    requireAdmin(); const errs = [];
    Object.entries(map).forEach(([n, v]) => { const inv = DB.inv.merch[n]; if (!(Number.isInteger(v) && v >= inv.given && v <= 10000)) errs.push({ item: n, min: inv.given }); else inv.stock = v });
    save(); return errs;
  },
  async resetEvent() {
    requireAdmin(); const keep = DB.users.filter(x => x.role === 'admin');
    DB = freshDB(); DB.users = keep;
    Object.entries(DEFAULT_STOCK).forEach(([n, s]) => { DB.inv.merch[n] = { stock: s, given: 0 } }); save();
  },
};
