// Picks the data backend:
// - Supabase when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were set at BUILD time.
// - Local demo backend (browser localStorage) only in development (`npm run dev`)
//   or when VITE_DATA_MODE=local is set on purpose.
// - In a production build without Supabase settings, accounts are DISABLED with a
//   clear message. (Before, the site silently fell back to local demo mode, so an
//   account created on one device existed only in that browser.)
import { localStore } from './local.js';
import { DEFAULT_CAPACITY, DEFAULT_STOCK } from '../config.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const forceLocal = import.meta.env.VITE_DATA_MODE === 'local';

export const NOT_CONFIGURED_MESSAGE =
  'Sign-in is unavailable: this website is not connected to its database yet. Please tell the site admin (Supabase settings are missing in Vercel).';

export async function createStore() {
  if (url && key && !forceLocal) {
    const { createSupabaseStore } = await import('./supabase.js');
    return createSupabaseStore(url, key);
  }
  if (forceLocal || !import.meta.env.PROD) return localStore;
  console.error('[10C9] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY were not set when this site was built. Accounts are disabled.');
  return unconfiguredStore();
}

// Read-only stand-in: the public pages still work, but nothing is saved per device.
function unconfiguredStore() {
  const no = async () => { throw new Error(NOT_CONFIGURED_MESSAGE) };
  return {
    mode: 'unconfigured',
    async init() { }, async refresh() { },
    me: () => null, users: () => [],
    cap: (ev, t) => DEFAULT_CAPACITY[ev]?.[t] ?? 0, issued: () => 0, taken: () => new Set(),
    tickets: () => [], myTickets: () => [], quiz: () => [], votes: () => [], myWish: () => [], wishAll: () => ({}),
    merch: n => ({ stock: DEFAULT_STOCK[n] ?? 0, given: 0 }),
    login: no, signup: no, logout: async () => { }, changePassword: no,
    book: no, setTicketStatus: no, toggleVote: no, toggleWish: no, saveQuiz: no,
    setRole: no, setActive: no, resetPassword: no, deleteUser: no, addUser: no,
    saveCapacities: no, giveMerch: no, saveStock: no, resetEvent: no,
  };
}
