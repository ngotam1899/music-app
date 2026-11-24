-- =====================================================================
-- Concert Passport (Parts 1–5): one row per user per part, latest answers
-- Run after schema.sql.
-- =====================================================================
create table if not exists public.passport_answers (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  part       text not null check (part in ('p1','p2','p3','p4a','p4b','p4c','p5')),
  answers    jsonb not null default '{}',
  score      int  check (score >= 0),
  total      int  check (total > 0),
  attempts   int  not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, part),
  check (score is null or total is null or score <= total),
  check (pg_column_size(answers) <= 20000)
);

-- Always the signed-in user; count attempts on resubmission
create or replace function public.passport_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.attempts := old.attempts + 1;
  else
    new.attempts := 1;
  end if;
  return new;
end $$;
create trigger passport_stamp before insert or update on public.passport_answers
  for each row execute function public.passport_stamp();

alter table public.passport_answers enable row level security;
create policy "passport: read own or admin" on public.passport_answers
  for select using (user_id = auth.uid() or public.is_admin());
create policy "passport: insert own" on public.passport_answers
  for insert with check (user_id = auth.uid() and public.is_active_user());
create policy "passport: update own" on public.passport_answers
  for update using (user_id = auth.uid() and public.is_active_user()) with check (user_id = auth.uid());

grant select, insert on public.passport_answers to authenticated;
grant update (part, answers, score, total) on public.passport_answers to authenticated;
grant select, insert, update, delete on public.passport_answers to service_role;
