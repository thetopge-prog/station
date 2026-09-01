-- 0054 — ربط شركات التوصيل: أجرة، ومفتاح، واستدعاء مندوب.
--
-- «زاد» في الأنبار طلبت API من نظامنا لتقرأ طلبات التوصيل وتُرسل مندوباً.
-- ما كان موجوداً (0045) يكفي للحساب والتسوية، وينقصه ثلاثة أشياء:
--   · أجرة توصيل — لم يكن للنظام مفهوم عنها إطلاقاً
--   · مفتاح لكل شركة — مفتاح النظام الواحد يفتح /api/calls أيضاً، ولا يجوز
--     أن يُعطى لطرف خارجي
--   · وجهة الاستدعاء — تُكتب إعداداً لا كوداً، لأننا لا نملك وثائق زاد بعد

alter table public.delivery_partners
  add column if not exists delivery_fee int not null default 0
    check (delivery_fee >= 0),
  add column if not exists api_key text unique,
  add column if not exists dispatch_url text,
  add column if not exists dispatch_headers jsonb;

comment on column public.delivery_partners.delivery_fee is
  'أجرة التوصيل الثابتة لهذه الشركة — تُضاف إلى الطلب عند اختيارها.';
comment on column public.delivery_partners.api_key is
  'مفتاح هذه الشركة وحدها. لا يُقرأ إلا بمفتاح الخدمة — لا موظف يحتاجه.';

-- المفتاح والترويسات لا يقرؤهما موظف: الأول كلمة سرّ طرف خارجي، والثاني قد
-- يحمل كلمة سرّ ذلك الطرف عندنا. صفحة الشركات تقرأهما بمفتاح الخدمة خلف
-- requireAdmin، كما تفعل مع partner_balances أصلاً.
revoke select (api_key, dispatch_headers) on public.delivery_partners from authenticated;
grant select (delivery_fee, dispatch_url) on public.delivery_partners to authenticated;

alter table public.orders
  add column if not exists courier_requested_at timestamptz,
  add column if not exists courier_ref text;

comment on column public.orders.courier_requested_at is
  'وقت استدعاء المندوب — وجودها يمنع استدعاء مندوبين لطلب واحد.';
comment on column public.orders.courier_ref is
  'رقم الطلب عند شركة التوصيل، كما ردّته.';

grant select (courier_requested_at, courier_ref) on public.orders to authenticated;

/**
 * نفس save_partner، وقد كبرت.
 *
 * وُسِّعت بمعاملات لها قيم افتراضية، فكل نداء قديم يظل يعمل كما هو.
 */
create or replace function public.save_partner(
  p_id uuid,
  p_name text,
  p_phone text default null,
  p_active boolean default true,
  p_note text default null,
  p_fee int default null,
  p_dispatch_url text default null,
  p_dispatch_headers jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'name required'; end if;

  if p_id is null then
    insert into delivery_partners(name_ar, phone, is_active, note, delivery_fee, dispatch_url, dispatch_headers)
      values (trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_active,
              nullif(trim(coalesce(p_note, '')), ''), greatest(0, coalesce(p_fee, 0)),
              nullif(trim(coalesce(p_dispatch_url, '')), ''), p_dispatch_headers)
      returning id into v_id;
  else
    update delivery_partners
       set name_ar = trim(p_name),
           phone = nullif(trim(coalesce(p_phone, '')), ''),
           is_active = p_active,
           note = nullif(trim(coalesce(p_note, '')), ''),
           -- null يعني «لا تغيّرها»، فالنماذج القديمة لا تمسح ما لم ترسله
           delivery_fee = coalesce(greatest(0, p_fee), delivery_fee),
           dispatch_url = coalesce(nullif(trim(coalesce(p_dispatch_url, '')), ''), dispatch_url),
           dispatch_headers = coalesce(p_dispatch_headers, dispatch_headers)
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'unknown partner'; end if;
  end if;
  return v_id;
end $$;

/** يولّد مفتاح الشركة، أو يستبدله. الإبطال هو التوليد من جديد. */
create or replace function public.rotate_partner_key(p_partner uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  -- gen_random_uuid لا gen_random_bytes: الثانية في امتداد pgcrypto الذي يسكن
  -- مخططاً آخر، وهذه الدالة تثبّت search_path على public فلا تراه. اثنان منها
  -- يعطيان 64 حرفاً من العشوائية، وهو أكثر مما يحتاجه مفتاح شركة توصيل.
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update delivery_partners set api_key = v_key where id = p_partner;
  if not found then raise exception 'unknown partner'; end if;
  return v_key;
end $$;

revoke all on function public.rotate_partner_key(uuid) from public, anon;
grant execute on function public.rotate_partner_key(uuid) to authenticated;
