# Music Concert of 10C9 🎶

Charity concert website for Class 10C9, Nguyen Van Linh High School: event home page, free Ticketbox with seat map and e-tickets, Performance line-up with voting, Musical Museum with a quiz, Merchandise Collection, Contact, User/Admin accounts and an Admin Dashboard.

**Stack:** Vite (vanilla JavaScript, no framework) · Supabase (Auth + Postgres with Row Level Security) · Vercel (static hosting + 2 serverless functions).

---

## Project structure

```
concert-10c9/
├── index.html              # Page markup (entry point for Vite)
├── public/favicon.svg
├── src/
│   ├── main.js             # App logic (UI, routing, Ticketbox, quiz, admin dashboard)
│   ├── styles.css          # All styles
│   ├── config.js           # Shared constants (zones, default stock, username rules)
│   └── store/
│       ├── index.js        # Chooses backend: Supabase if configured, else local demo
│       ├── supabase.js     # Cloud backend (Supabase)
│       └── local.js        # Demo backend (browser localStorage)
├── api/                    # Vercel serverless functions (server-side only)
│   ├── _supabase.js        # Service-role client helper (not a route)
│   ├── signup.js           # POST /api/signup  — create a user account
│   └── admin.js            # POST /api/admin   — add/delete user, reset password, reset event
├── supabase/schema.sql     # Tables, RLS policies, triggers, RPC functions, seed data
├── package.json · vite.config.js · vercel.json
├── .env.example            # Template for environment variables (no real values)
└── .gitignore              # Keeps .env*, node_modules, dist out of Git
```

## Two data modes

| Mode | When | Data lives in |
|---|---|---|
| **Cloud** | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set | Supabase (shared by everyone) |
| **Local demo** | Those variables are missing (or `VITE_DATA_MODE=local`) | Each visitor's browser only. Demo admin: `admin` / `admin123` |

The demo admin account exists **only** in local demo mode. It is never created in Supabase.

## Environment variables

| Variable | Where | Secret? | Value |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (all envs) + `.env.local` | No | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel (all envs) + `.env.local` | No (public, protected by RLS) | anon / publishable key |
| `SUPABASE_URL` | Vercel (server) | No | Same Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) **only** | **YES** | service_role / secret key |
| `VITE_DATA_MODE` | optional | No | `local` to force demo mode |

⚠️ Never put the service-role key in a `VITE_` variable, in code, or in Git. Anything starting with `VITE_` is shipped to the browser.

---

## Deploy step by step

### 1. Supabase
1. Create a project at https://supabase.com.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled. Turn **off** "Allow new users to sign up" (accounts are created by `/api/signup`, so public sign-ups aren't needed and this closes a side door).
4. **Project Settings → API**: copy the Project URL, the anon/publishable key and the service_role/secret key for step 3.

### 2. GitHub
```bash
cd concert-10c9
git init
git add .
git status                # check: no .env.local, no node_modules, no dist
git commit -m "Music Concert of 10C9 website"
git branch -M main
git remote add origin https://github.com/<your-account>/music-concert-10c9.git
git push -u origin main
```

### 3. Vercel
1. https://vercel.com → **Add New → Project** → import the GitHub repo. Vercel detects **Vite** automatically (build `npm run build`, output `dist`).
2. **Environment Variables**: add the 4 variables from the table above.
3. **Deploy**.

### 4. Create the first admin
1. Open the live site → **Sign up** with your own username.
2. Supabase **SQL Editor** → run (with your username):
   ```sql
   update public.profiles set role = 'admin' where username = 'your_username';
   ```
3. Log out and back in → the **🛠️ Admin** tab appears. More admins can now be added from **Admin → Users**.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values, or leave empty for demo mode
npm run dev                  # http://localhost:5173  (website only)
npx vercel dev               # website + /api functions (needed for sign-up/admin actions in cloud mode)
npm run build                # production build → dist/
```

## Security notes
- Every table has Row Level Security. Users only read their own tickets, quiz results and wishlist; admins read everything.
- Tickets are only written through database functions (`book_ticket`, `set_ticket_status`). These check sign-in, locked accounts, ticket quantity and seat conflicts on the server, so two people can't take the same seat.
- Users can't change their own role or status, and the database always keeps at least one active admin.
- Admin actions that need the service-role key run in `/api/admin`. That function checks the caller's session and admin role first.
