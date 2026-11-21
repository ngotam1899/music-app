// Shared constants used by the website and the Supabase backend.
export const BOOKABLE_EVENTS = ['main', 'rehearsal'];
export const SEATS_PER_ROW = 12;
export const ZONE_ROWS = { A: ['A', 'B', 'C'], B: ['D', 'E', 'F'], F: ['G', 'H'], S: [] };

// Default quantities (must match supabase/schema.sql seed data)
export const DEFAULT_CAPACITY = {
  main: { A: 36, B: 36, F: 24, S: 80 },
  rehearsal: { A: 36, B: 36, F: 24, S: 60 },
};
export const DEFAULT_STOCK = {
  'Concert T-shirt': 50, 'Light stick': 80, 'Sticker set': 100,
  'Tote bag': 40, 'Name badge': 60, 'Bookmark': 120,
};

export const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

// Supabase Auth needs an e-mail address, so each username is mapped to an
// internal address on this domain. No e-mail is ever sent to it.
export const USERNAME_EMAIL_DOMAIN = 'users.concert10c9.app';
export const usernameToEmail = u => `${String(u).trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
