-- Configurable cafe floor plan: which tables exist, indoor/outdoor, active or
-- not, and their x/y position (percent 0-100) on the layout map. Staff-editable
-- (cashier too) via server actions; service-role only at the DB.
create table if not exists public.cafe_tables (
  name text primary key,
  kind text not null default 'indoor' check (kind in ('indoor', 'outdoor')),
  active boolean not null default true,
  pos_x real not null default 50,
  pos_y real not null default 50,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.cafe_tables enable row level security;
revoke all on public.cafe_tables from anon, authenticated;

-- seed the current layout (12 indoor in a 4×3 grid + 2 outdoor) once
insert into public.cafe_tables(name, kind, active, pos_x, pos_y, sort) values
  ('1','indoor',true,15,12,1),('2','indoor',true,38,12,2),('3','indoor',true,61,12,3),('4','indoor',true,84,12,4),
  ('5','indoor',true,15,34,5),('6','indoor',true,38,34,6),('7','indoor',true,61,34,7),('8','indoor',true,84,34,8),
  ('9','indoor',true,15,56,9),('10','indoor',true,38,56,10),('11','indoor',true,61,56,11),('12','indoor',true,84,56,12),
  ('خارجي 1','outdoor',true,30,82,13),('خارجي 2','outdoor',true,60,82,14)
on conflict (name) do nothing;
