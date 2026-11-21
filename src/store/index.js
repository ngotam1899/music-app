// Picks the data backend:
// - Supabase when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (production)
// - otherwise the local demo backend (browser localStorage), so the site still works
//   when opened without any configuration.
import { localStore } from './local.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const forceLocal = import.meta.env.VITE_DATA_MODE === 'local';

export async function createStore() {
  if (url && key && !forceLocal) {
    const { createSupabaseStore } = await import('./supabase.js');
    return createSupabaseStore(url, key);
  }
  if (import.meta.env.PROD && !forceLocal) {
    console.warn('[10C9] Supabase is not configured — running in local demo mode (data stays in this browser).');
  }
  return localStore;
}
