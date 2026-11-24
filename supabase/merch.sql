-- =====================================================================
-- Merchandise Collection: product photos, live availability, 1 per person
-- Run after schema.sql.
-- =====================================================================

alter table public.merch_inventory
  add column if not exists images text[] not null default '{}';
alter table public.merch_inventory drop constraint if exists merch_images_max;
alter table public.merch_inventory add constraint merch_images_max check (cardinality(images) <= 4);

-- Public: stock, handed out, selected (reserved) — no personal data
create or replace function public.merch_availability()
returns table (item text, stock int, given int, requested int, images text[])
language sql stable security definer set search_path = public as $$
  select m.item, m.stock, m.given,
         (select count(*) from public.wishlist w where w.item = m.item)::int,
         m.images
  from public.merch_inventory m;
$$;

-- Selecting an item reserves 1; refuse when nothing is left
create or replace function public.wishlist_check_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.merch_inventory; taken int;
begin
  select * into m from public.merch_inventory where item = new.item for update;
  if not found then raise exception 'Unknown item'; end if;
  select count(*) into taken from public.wishlist where item = new.item;
  if m.given + taken >= m.stock then raise exception 'Sorry, % is out of stock', new.item; end if;
  return new;
end $$;
drop trigger if exists wishlist_check_stock on public.wishlist;
create trigger wishlist_check_stock before insert on public.wishlist
  for each row execute function public.wishlist_check_stock();

-- Admin: set the product photos (storage paths in the merch-images bucket)
create or replace function public.set_merch_images(p_item text, p_images text[])
returns public.merch_inventory
language plpgsql security definer set search_path = public as $$
declare m public.merch_inventory;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if cardinality(p_images) > 4 then raise exception 'Up to 4 photos per product'; end if;
  update public.merch_inventory set images = coalesce(p_images, '{}') where item = p_item returning * into m;
  if not found then raise exception 'Unknown item'; end if;
  return m;
end $$;

revoke execute on function public.merch_availability() from public;
grant execute on function public.merch_availability() to anon, authenticated;
revoke execute on function public.set_merch_images(text, text[]) from public, anon;
grant execute on function public.set_merch_images(text, text[]) to authenticated;

-- Product photos: public read, only admins upload/delete
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-images', 'merch-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "merch-images: admin upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'merch-images' and public.is_admin());
create policy "merch-images: admin read" on storage.objects
  for select to authenticated using (bucket_id = 'merch-images' and public.is_admin());
create policy "merch-images: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'merch-images' and public.is_admin());
