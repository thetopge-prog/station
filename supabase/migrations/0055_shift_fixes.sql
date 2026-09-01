-- 0055 — عطلان في إغلاق الوردية، ونسبة طلبات الهَب.

/**
 * المبلغ الذي ينتقل إلى الكاشير التالي = المعدود **ناقص** ما صعد للإدارة.
 *
 * كان يمرَّر المعدود كاملاً، فيُطلب من الكاشير التالي أن يؤكّد استلام مال
 * أودِع فعلاً في الأعلى — عجزٌ مضمون على شخص بريء في أول عدّ له.
 */
create or replace function public.close_cashier_session(
  p_session uuid,
  p_counted int,
  p_deposited int default 0,
  p_handover_to uuid default null,
  p_note text default null
) returns table(expected_cash int, variance int)
language plpgsql security definer set search_path = public as $$
declare v_rep record; v_expected int; v_counted int; v_deposited int;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;

  v_counted   := greatest(0, coalesce(p_counted, 0));
  v_deposited := greatest(0, coalesce(p_deposited, 0));

  -- إغلاق وردية مغلقة كان ينجح صامتاً ويكتب فوق الأرقام المجمَّدة
  if exists (select 1 from cashier_sessions where id = p_session and closed_at is not null) then
    raise exception 'already closed';
  end if;

  update cashier_sessions set deposited = v_deposited where id = p_session;
  select * into v_rep from public.session_report(p_session);
  v_expected := v_rep.expected_cash;

  update cashier_sessions
     set closed_at = now(),
         counted_cash = v_counted,
         expected_cash = v_expected,
         variance = v_counted - v_expected,
         close_note = nullif(trim(coalesce(p_note, '')), ''),
         handover_to = p_handover_to,
         -- ما بقي في الدرج فعلاً، لا ما كان فيه قبل الإيداع
         handover_amount = greatest(0, v_counted - v_deposited)
   where id = p_session;

  return query select v_expected, v_counted - v_expected;
end $$;

revoke all on function public.close_cashier_session(uuid, int, int, uuid, text) from public, anon;
grant execute on function public.close_cashier_session(uuid, int, int, uuid, text) to authenticated;
