-- 0006_bot_webhook.sql — 24/7 Telegram bot via Supabase Edge Function webhook.
-- bot_state persists per-chat conversational state (price-edit / add-product
-- inputs) across stateless function invocations. pg_cron + pg_net power the
-- nightly 23:59 Baghdad report (the cron job itself is scheduled separately —
-- it carries a secret, so it is NOT committed to this public repo). Idempotent.

create table if not exists public.bot_state (
  chat_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.bot_state enable row level security;
-- no policies: service-role (the edge function) only.

create extension if not exists pg_cron;
create extension if not exists pg_net;
