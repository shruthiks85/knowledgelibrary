-- Run once in Supabase Dashboard -> SQL Editor.
-- Adds ownership to saved_items and locks it down with RLS.

alter table public.saved_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

-- Existing test rows have no owner and will become invisible. Optionally delete them:
-- delete from public.saved_items where user_id is null;

alter table public.saved_items enable row level security;

drop policy if exists "saved_items_select_own" on public.saved_items;
drop policy if exists "saved_items_insert_own" on public.saved_items;
drop policy if exists "saved_items_update_own" on public.saved_items;
drop policy if exists "saved_items_delete_own" on public.saved_items;

create policy "saved_items_select_own" on public.saved_items
  for select to authenticated using (user_id = auth.uid());

create policy "saved_items_insert_own" on public.saved_items
  for insert to authenticated with check (user_id = auth.uid());

create policy "saved_items_update_own" on public.saved_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "saved_items_delete_own" on public.saved_items
  for delete to authenticated using (user_id = auth.uid());

-- No access at all for anonymous visitors.
revoke all on public.saved_items from anon;
grant select, insert, update, delete on public.saved_items to authenticated;
