-- =====================================================================
-- Music Concert of 10C9 — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: tables use IF NOT EXISTS, functions are replaced,
-- policies and triggers are dropped and re-created.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  name        text not null,
  cls         text not null default '',
  role        text not null default 'user' check (role in ('user','admin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.ticket_inventory (
  event_id  text not null,
  type_id   text not null check (type_id in ('A','B','F','S')),
  capacity  int  not null check (capacity >= 0),
  primary key (event_id, type_id)
);

create table if not exists public.tickets (
  code        text primary key,
  event_id    text not null,
  event_title text not null,
  event_when  text not null,
  type_id     text not null,
  type_name   text not null,
  qty         int  not null check (qty between 1 and 4),
  seats       text[] not null default '{}',
  user_id     uuid references public.profiles(id) on delete set null,
  username    text not null,
  name        text not null,
  cls         text not null default '',
  phone       text not null default '',
  pledge      text not null default '',
  status      text not null default 'active' check (status in ('active','checked','cancelled')),
  created_at  timestamptz not null default now(),
  foreign key (event_id, type_id) references public.ticket_inventory(event_id, type_id)
);
create index if not exists tickets_event_type_idx on public.tickets(event_id, type_id);
create index if not exists tickets_user_idx on public.tickets(user_id);

create table if not exists public.quiz_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  username    text not null default '',
  name        text not null default '',
  cls         text not null default '',
  score       int  not null check (score >= 0),
  total       int  not null check (total > 0),
  answers     int[] not null default '{}',
  created_at  timestamptz not null default now(),
  check (score <= total)
);

create table if not exists public.votes (
  act_id     int  not null check (act_id between 1 and 50),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (act_id, user_id)
);

create table if not exists public.merch_inventory (
  item   text primary key,
  stock  int not null check (stock >= 0),
  given  int not null default 0 check (given >= 0),
  check (given <= stock)
);

create table if not exists public.wishlist (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  item       text not null references public.merch_inventory(item) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item)
);

-- ---------------------------------------------------------------------
-- Seed data (ticket quantities & merchandise stock)
-- ---------------------------------------------------------------------
insert into public.ticket_inventory(event_id, type_id, capacity) values
  ('main','A',36),('main','B',36),('main','F',24),('main','S',80),
  ('rehearsal','A',36),('rehearsal','B',36),('rehearsal','F',24),('rehearsal','S',60)
on conflict do nothing;

insert into public.merch_inventory(item, stock) values
  ('Concert T-shirt',50),('Light stick',80),('Sticker set',100),
  ('Tote bag',40),('Name badge',60),('Bookmark',120)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- Seat rows for each seated zone (12 seats per row)
create or replace function public.zone_rows(p_type text) returns text[]
language sql immutable as $$
  select case p_type when 'A' then array['A','B','C']
                     when 'B' then array['D','E','F']
                     when 'F' then array['G','H']
                     else array[]::text[] end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
-- New auth user → profile (role is always 'user'; promote admins separately)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, name, cls)
  values (
    new.id,
    lower(new.raw_user_meta_data->>'username'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), new.raw_user_meta_data->>'username'),
    coalesce(new.raw_user_meta_data->>'cls', '')
  );
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nobody changes their own role/status; usernames are fixed
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() = old.id
     and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You cannot change your own role or status';
  end if;
  if new.username is distinct from old.username then
    raise exception 'Username cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Always keep at least one active admin (once one exists)
create or replace function public.ensure_admin_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.active
     and not exists (select 1 from public.profiles where role = 'admin' and active) then
    raise exception 'Keep at least one active admin';
  end if;
  return null;
end $$;
drop trigger if exists ensure_admin_left on public.profiles;
create trigger ensure_admin_left after update or delete on public.profiles
  for each row execute function public.ensure_admin_left();

-- Quiz attempts are stamped with the signed-in user's details
create or replace function public.quiz_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or not p.active then raise exception 'Please sign in to save your result'; end if;
  new.user_id := p.id; new.username := p.username; new.name := p.name; new.cls := p.cls;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists quiz_fill on public.quiz_attempts;
create trigger quiz_fill before insert on public.quiz_attempts
  for each row execute function public.quiz_fill();

-- Votes and wishlist rows always belong to the caller
create or replace function public.stamp_user() returns trigger
language plpgsql set search_path = public as $$
begin
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists votes_stamp on public.votes;
create trigger votes_stamp before insert on public.votes
  for each row execute function public.stamp_user();
drop trigger if exists wishlist_stamp on public.wishlist;
create trigger wishlist_stamp before insert on public.wishlist
  for each row execute function public.stamp_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.ticket_inventory  enable row level security;
alter table public.tickets           enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.votes             enable row level security;
alter table public.merch_inventory   enable row level security;
alter table public.wishlist          enable row level security;

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ticket_inventory: public read" on public.ticket_inventory;
create policy "ticket_inventory: public read" on public.ticket_inventory for select using (true);

drop policy if exists "merch_inventory: public read" on public.merch_inventory;
create policy "merch_inventory: public read" on public.merch_inventory for select using (true);

-- Tickets are written only through the functions below
drop policy if exists "tickets: read own or admin" on public.tickets;
create policy "tickets: read own or admin" on public.tickets
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "quiz: read own or admin" on public.quiz_attempts;
create policy "quiz: read own or admin" on public.quiz_attempts
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "quiz: insert own" on public.quiz_attempts;
create policy "quiz: insert own" on public.quiz_attempts
  for insert with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists "votes: public read" on public.votes;
create policy "votes: public read" on public.votes for select using (true);
drop policy if exists "votes: insert own" on public.votes;
create policy "votes: insert own" on public.votes
  for insert with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists "votes: delete own" on public.votes;
create policy "votes: delete own" on public.votes for delete using (user_id = auth.uid());

drop policy if exists "wishlist: read own or admin" on public.wishlist;
create policy "wishlist: read own or admin" on public.wishlist
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "wishlist: insert own" on public.wishlist;
create policy "wishlist: insert own" on public.wishlist
  for insert with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists "wishlist: delete own or admin" on public.wishlist;
create policy "wishlist: delete own or admin" on public.wishlist
  for delete using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- RPC functions (called from the website)
-- ---------------------------------------------------------------------

-- Public: tickets issued and seats taken per event/type (no personal data)
create or replace function public.ticket_availability()
returns table (event_id text, type_id text, capacity int, issued int, seats text[])
language sql stable security definer set search_path = public as $$
  select i.event_id, i.type_id, i.capacity,
    coalesce((select sum(t.qty) from public.tickets t
              where t.event_id = i.event_id and t.type_id = i.type_id and t.status <> 'cancelled'), 0)::int,
    coalesce((select array_agg(x) from public.tickets t, unnest(t.seats) x
              where t.event_id = i.event_id and t.type_id = i.type_id and t.status <> 'cancelled'), '{}')
  from public.ticket_inventory i;
$$;

-- Reserve free tickets (checks quantity and seats atomically)
create or replace function public.book_ticket(
  p_event text, p_event_title text, p_event_when text,
  p_type text, p_type_name text, p_qty int, p_seats text[],
  p_phone text default '', p_pledge text default '')
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles; inv public.ticket_inventory; used int; r text[];
  s text; pos int; n int; taken text[]; v_code text; t public.tickets;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Please sign in to reserve'; end if;
  if not p.active then raise exception 'This account is locked. Please contact the admin.'; end if;
  if p_qty is null or p_qty not between 1 and 4 then raise exception 'You can book 1 to 4 tickets'; end if;

  select * into inv from public.ticket_inventory
    where event_id = p_event and type_id = p_type for update;
  if not found then raise exception 'Unknown event or ticket type'; end if;

  select coalesce(sum(qty), 0) into used from public.tickets
    where event_id = p_event and type_id = p_type and status <> 'cancelled';
  if used + p_qty > inv.capacity then raise exception 'Sorry, not enough tickets left'; end if;

  r := public.zone_rows(p_type);
  if cardinality(r) > 0 then
    if coalesce(cardinality(p_seats), 0) <> p_qty
       or (select count(distinct x) from unnest(p_seats) x) <> p_qty then
      raise exception 'Please choose % seat(s)', p_qty;
    end if;
    select coalesce(array_agg(x), '{}') into taken
      from public.tickets tk, unnest(tk.seats) x
      where tk.event_id = p_event and tk.type_id = p_type and tk.status <> 'cancelled';
    foreach s in array p_seats loop
      if s !~ '^[A-Z][0-9]{1,2}$' then raise exception 'Invalid seat %', s; end if;
      pos := array_position(r, substring(s from 1 for 1));
      n := substring(s from 2)::int;
      if pos is null or n not between 1 and 12 then raise exception 'Seat % is not in this zone', s; end if;
      if (pos - 1) * 12 + n - 1 >= inv.capacity then raise exception 'Seat % is closed', s; end if;
      if s = any(taken) then raise exception 'Seat % was just taken — please choose again', s; end if;
    end loop;
  elsif coalesce(cardinality(p_seats), 0) > 0 then
    raise exception 'Standing tickets have no seats';
  end if;

  v_code := '10C9-' || upper(substr(md5(gen_random_uuid()::text), 1, 4))
                    || '-' || upper(substr(md5(clock_timestamp()::text), 1, 3));
  insert into public.tickets (code, event_id, event_title, event_when, type_id, type_name, qty, seats,
                              user_id, username, name, cls, phone, pledge)
  values (v_code, p_event, left(p_event_title, 120), left(p_event_when, 120), p_type, left(p_type_name, 80),
          p_qty, case when cardinality(r) > 0 then p_seats else '{}' end,
          p.id, p.username, p.name, p.cls, left(coalesce(p_phone, ''), 80), left(coalesce(p_pledge, ''), 300))
  returning * into t;
  return t;
end $$;

-- Check in / cancel / restore (owner may only cancel their own active ticket)
create or replace function public.set_ticket_status(p_code text, p_status text)
returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; inv public.ticket_inventory; used int;
begin
  if p_status not in ('active','checked','cancelled') then raise exception 'Invalid status'; end if;
  select * into t from public.tickets where code = p_code for update;
  if not found then raise exception 'Ticket not found'; end if;
  if not public.is_admin() then
    if t.user_id is distinct from auth.uid() or not public.is_active_user()
       or not (t.status = 'active' and p_status = 'cancelled') then
      raise exception 'Not allowed';
    end if;
  end if;
  if t.status = 'cancelled' and p_status <> 'cancelled' then
    select * into inv from public.ticket_inventory
      where event_id = t.event_id and type_id = t.type_id for update;
    select coalesce(sum(qty), 0) into used from public.tickets
      where event_id = t.event_id and type_id = t.type_id and status <> 'cancelled';
    if used + t.qty > inv.capacity then raise exception 'Cannot restore: not enough tickets left'; end if;
    if exists (select 1 from public.tickets o, unnest(o.seats) x
               where o.event_id = t.event_id and o.status <> 'cancelled' and x = any(t.seats)) then
      raise exception 'Cannot restore: a seat is already taken';
    end if;
  end if;
  update public.tickets set status = p_status where code = p_code returning * into t;
  return t;
end $$;

-- Admin: update ticket quantities. Returns 'TYPE:min:max' for rejected values.
create or replace function public.save_capacities(p_event text, p_caps jsonb)
returns text[]
language plpgsql security definer set search_path = public as $$
declare k text; raw text; v int; used int; mx int; errs text[] := '{}';
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  for k, raw in select key, value from jsonb_each_text(p_caps) loop
    select coalesce(sum(qty), 0) into used from public.tickets
      where event_id = p_event and type_id = k and status <> 'cancelled';
    mx := case when cardinality(public.zone_rows(k)) > 0 then cardinality(public.zone_rows(k)) * 12 else 2000 end;
    v := case when raw ~ '^\d+$' then raw::int else null end;
    if v is null or v < used or v > mx then
      errs := errs || format('%s:%s:%s', k, used, mx);
    else
      update public.ticket_inventory set capacity = v where event_id = p_event and type_id = k;
    end if;
  end loop;
  return errs;
end $$;

-- Admin: update merchandise stock. Returns 'item:min' for rejected values.
create or replace function public.save_stock(p_stock jsonb)
returns text[]
language plpgsql security definer set search_path = public as $$
declare k text; raw text; v int; m public.merch_inventory; errs text[] := '{}';
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  for k, raw in select key, value from jsonb_each_text(p_stock) loop
    select * into m from public.merch_inventory where item = k for update;
    if not found then continue; end if;
    v := case when raw ~ '^\d+$' then raw::int else null end;
    if v is null or v < m.given or v > 10000 then
      errs := errs || format('%s:%s', k, m.given);
    else
      update public.merch_inventory set stock = v where item = k;
    end if;
  end loop;
  return errs;
end $$;

-- Admin: hand out (+1) or undo (-1) a gift; optionally clear it from a guest's wishlist
create or replace function public.give_merch(p_item text, p_delta int, p_user uuid default null)
returns public.merch_inventory
language plpgsql security definer set search_path = public as $$
declare m public.merch_inventory;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into m from public.merch_inventory where item = p_item for update;
  if not found then raise exception 'Unknown item'; end if;
  if m.given + p_delta < 0 then raise exception 'Already at 0'; end if;
  if m.given + p_delta > m.stock then raise exception 'Out of stock'; end if;
  update public.merch_inventory set given = given + p_delta where item = p_item returning * into m;
  if p_user is not null then
    delete from public.wishlist where user_id = p_user and item = p_item;
  end if;
  return m;
end $$;

-- Admin / server: clear event data and restore default quantities
create or replace function public.reset_event_data()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Admins only';
  end if;
  delete from public.tickets where true;
  delete from public.quiz_attempts where true;
  delete from public.votes where true;
  delete from public.wishlist where true;
  update public.ticket_inventory set capacity = case type_id
    when 'A' then 36 when 'B' then 36 when 'F' then 24
    else case event_id when 'main' then 80 else 60 end end
  where true;
  update public.merch_inventory m set given = 0, stock = d.stock
  from (values ('Concert T-shirt',50),('Light stick',80),('Sticker set',100),
               ('Tote bag',40),('Name badge',60),('Bookmark',120)) as d(item, stock)
  where m.item = d.item;
end $$;

-- Function permissions
revoke execute on function public.book_ticket(text,text,text,text,text,int,text[],text,text) from public, anon;
revoke execute on function public.set_ticket_status(text,text) from public, anon;
revoke execute on function public.save_capacities(text,jsonb) from public, anon;
revoke execute on function public.save_stock(jsonb) from public, anon;
revoke execute on function public.give_merch(text,int,uuid) from public, anon;
revoke execute on function public.reset_event_data() from public, anon;
grant execute on function public.book_ticket(text,text,text,text,text,int,text[],text,text) to authenticated;
grant execute on function public.set_ticket_status(text,text) to authenticated;
grant execute on function public.save_capacities(text,jsonb) to authenticated;
grant execute on function public.save_stock(jsonb) to authenticated;
grant execute on function public.give_merch(text,int,uuid) to authenticated;
grant execute on function public.reset_event_data() to authenticated, service_role;
grant execute on function public.ticket_availability() to anon, authenticated;

-- =====================================================================
-- AFTER your first sign-up on the website, make yourself admin
-- (replace your_username, then run this line on its own):
--
--   update public.profiles set role = 'admin' where username = 'your_username';
-- =====================================================================
