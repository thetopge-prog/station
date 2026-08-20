-- 0023_order_enums.sql — ENUM VALUES ONLY. Nothing else may live in this file.
--
-- Postgres refuses to *use* an enum value in the same transaction that adds it,
-- and db-apply.mjs runs each file as one batch. So the additions get their own
-- migration and every consumer (0024+) comes after. Idempotent.

alter type public.order_channel add value if not exists 'delivery';
alter type public.order_channel add value if not exists 'pickup';

-- Kitchen state, kept STRICTLY separate from orders.status (which is money:
-- pending/paid/cancelled/refunded and is read by place_order, mark_order_paid,
-- range_summary, the dashboard and the Telegram bot). Splitting them is what
-- lets the whole KDS land without touching one line of existing money logic.
--   new       → placed, nobody has started
--   preparing → an expediter claimed it / chefs are cooking
--   ready     → assembled and verified, on the customer TV
--   handed    → given to the customer, off the screens
do $$ begin
  create type public.prep_status as enum ('new', 'preparing', 'ready', 'handed');
exception when duplicate_object then null; end $$;
