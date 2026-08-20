-- 0004_storage.sql — public bucket for menu item images.
-- Uploads go through the service-role client (admin-gated action), so no extra
-- storage RLS is needed for writes; the bucket is public for read (getPublicUrl).
-- Idempotent.
insert into storage.buckets (id, name, public)
values ('menu', 'menu', true)
on conflict (id) do update set public = true;
