-- 0095: تقييم الزبون بعد التسليم، وحفظ الطلب الجيد لإعادة الطلب.
--
-- handed_at: لحظة «سلّم للسائق/للزبون» — بعدها بأربعين دقيقة يسأل البوت
-- «قيّم تجربتك». rating_asked_at يمنع السؤال مرتين. saved_for_customer: طلب
-- قيّمه صاحبه فوق ٨ من ١٠ → يظهر له في «طلباتي السابقة».
alter table public.orders add column if not exists handed_at timestamptz;
alter table public.orders add column if not exists rating_asked_at timestamptz;
alter table public.orders add column if not exists saved_for_customer boolean not null default false;

create or replace function public.stamp_handed_at() returns trigger
language plpgsql as $$
begin
  if new.prep_status = 'handed' and (old.prep_status is distinct from 'handed') then
    new.handed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists orders_stamp_handed on public.orders;
create trigger orders_stamp_handed before update of prep_status on public.orders
  for each row execute function public.stamp_handed_at();

create table if not exists public.order_ratings (
  order_id uuid primary key references public.orders(id) on delete cascade,
  food smallint check (food between 1 and 10),
  service smallint check (service between 1 and 10),
  ordering smallint check (ordering between 1 and 10),
  advice text,
  score numeric(4,2),
  source text,
  created_at timestamptz not null default now()
);
alter table public.order_ratings enable row level security;
revoke all on public.order_ratings from anon;
grant select on public.order_ratings to authenticated;

-- الطلبات التي حان وقت سؤالها (تُقرأ من مسار المتابعة بالخدمة)
create index if not exists orders_rating_due on public.orders (handed_at)
  where handed_at is not null and rating_asked_at is null;
