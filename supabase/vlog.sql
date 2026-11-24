-- =====================================================================
-- Performance Vlog: posts (YouTube link, caption, images) + comments
-- Run after schema.sql. Safe to re-run.
-- =====================================================================

create table if not exists public.vlog_posts (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  author_cls  text not null default '',
  title       text not null check (char_length(title) between 1 and 120),
  caption     text not null default '' check (char_length(caption) <= 3000),
  youtube_id  text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  images      text[] not null default '{}' check (cardinality(images) <= 6),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vlog_posts_created_idx on public.vlog_posts(created_at desc);

create table if not exists public.vlog_comments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.vlog_posts(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  author_cls  text not null default '',
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists vlog_comments_post_idx on public.vlog_comments(post_id, created_at);

-- Author details always come from the signed-in user's profile
create or replace function public.vlog_stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or not p.active then raise exception 'Please log in to post'; end if;
  new.user_id := p.id; new.author_name := p.name; new.author_cls := p.cls; new.created_at := now();
  if tg_table_name = 'vlog_posts' then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists vlog_posts_stamp on public.vlog_posts;
create trigger vlog_posts_stamp before insert on public.vlog_posts
  for each row execute function public.vlog_stamp_author();
drop trigger if exists vlog_comments_stamp on public.vlog_comments;
create trigger vlog_comments_stamp before insert on public.vlog_comments
  for each row execute function public.vlog_stamp_author();

-- Edits keep the original author and time
create or replace function public.vlog_keep_author() returns trigger
language plpgsql set search_path = public as $$
begin
  new.user_id := old.user_id; new.author_name := old.author_name; new.author_cls := old.author_cls;
  new.created_at := old.created_at; new.updated_at := now();
  return new;
end $$;
drop trigger if exists vlog_posts_keep on public.vlog_posts;
create trigger vlog_posts_keep before update on public.vlog_posts
  for each row execute function public.vlog_keep_author();

alter table public.vlog_posts    enable row level security;
alter table public.vlog_comments enable row level security;

drop policy if exists "vlog_posts: public read" on public.vlog_posts;
create policy "vlog_posts: public read" on public.vlog_posts for select using (true);
drop policy if exists "vlog_posts: insert own" on public.vlog_posts;
create policy "vlog_posts: insert own" on public.vlog_posts
  for insert with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists "vlog_posts: admin edits" on public.vlog_posts;
create policy "vlog_posts: admin edits" on public.vlog_posts
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "vlog_posts: delete own or admin" on public.vlog_posts;
create policy "vlog_posts: delete own or admin" on public.vlog_posts
  for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists "vlog_comments: public read" on public.vlog_comments;
create policy "vlog_comments: public read" on public.vlog_comments for select using (true);
drop policy if exists "vlog_comments: insert own" on public.vlog_comments;
create policy "vlog_comments: insert own" on public.vlog_comments
  for insert with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists "vlog_comments: delete own or admin" on public.vlog_comments;
create policy "vlog_comments: delete own or admin" on public.vlog_comments
  for delete using (user_id = auth.uid() or public.is_admin());

grant select on public.vlog_posts, public.vlog_comments to anon, authenticated;
grant insert, delete on public.vlog_posts, public.vlog_comments to authenticated;
grant update (title, caption, youtube_id, images) on public.vlog_posts to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select, insert, update, delete on public.vlog_posts, public.vlog_comments to service_role;

-- Image storage: public read; each user uploads into a folder named after their user id
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vlog-images', 'vlog-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "vlog-images: upload own folder" on storage.objects;
create policy "vlog-images: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vlog-images' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_user());
drop policy if exists "vlog-images: read own or admin" on storage.objects;
create policy "vlog-images: read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'vlog-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "vlog-images: delete own or admin" on storage.objects;
create policy "vlog-images: delete own or admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vlog-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
