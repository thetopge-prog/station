-- ═══ طلبات الزبائن من تليغرام ═══
--
-- البوت يرسل الطلب إلى مدخل الطلبات الخارجية (/api/orders/whatsapp) فيصل
-- الكاشير بزرّ «قبول» كأي طلب واتساب. يبقى شيئان في القاعدة:
--
--   ١. مصدر الطلب: order_source كان محصوراً في pos/web/whatsapp، وplace_order
--      تُرجع كل مجهول إلى pos. فيُوسَّع القيد، والمدخل يكتب 'telegram' بعد
--      الإدراج — بدل إعادة كتابة place_order الطويلة لأجل كلمة واحدة.
--   ٢. معرّف محادثة الزبون: ليُبلَّغ حين يُقبل طلبه ويجهز — من الفعل الخادمي
--      نفسه الذي يضغطه الكاشير، فوراً، لا بمهمة دورية.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.orders'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%order_source%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_order_source_check
  check (order_source in ('pos', 'web', 'whatsapp', 'telegram'));

alter table public.orders add column if not exists telegram_chat_id text;

-- يُقرأ من عميل الخدمة وحده؛ رقم محادثة ليس للعموم
revoke select (telegram_chat_id) on public.orders from anon, authenticated;

notify pgrst, 'reload schema';
