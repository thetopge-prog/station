-- 0047_incoming_calls.sql — الزبون يتصل، فيعرفه النظام قبل أن يتكلّم.
--
-- Two small things, one workflow: a delivery order taken over the phone.
--
-- 1) العنوان يُحفظ مع الزبون
--    It was only ever stored on the ORDER (orders.address_note), so a customer
--    who has ordered twenty times gets asked where he lives twenty times. The
--    address belongs to the person, not to one receipt.
alter table public.customers
  add column if not exists address text;

comment on column public.customers.address is
  'آخر عنوان توصيل معروف. يُملأ تلقائياً عند الطلب، ويُعرض للكاشير حين يُعرف الرقم.';

-- 2) سجل المكالمات الواردة
--    A phone on the counter posts the caller's number here the moment it rings
--    (MacroDroid on the shop's own Android, or a caller-ID modem). The cashier
--    screen watches this table and shows who is calling BEFORE the handset is
--    picked up.
--
--    Deliberately a log and not a single row: two lines ring at once during a
--    rush, and an overwritten row is a lost customer.
create table if not exists public.incoming_calls (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  -- matched to a customer at insert time, so the screen needs no second query
  customer_id uuid references public.customers(id) on delete set null,
  -- set when a cashier acts on it, so it stops shouting
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists incoming_calls_recent
  on public.incoming_calls(created_at desc) where handled_at is null;

alter table public.incoming_calls enable row level security;
-- Read through the service client behind a staff gate, like customers: a phone
-- number is PII and the anon key must never see one.
revoke all on public.incoming_calls from anon, authenticated;
