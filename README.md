# Station — ستيشن

نظام إدارة طلبات متكامل لكافيه ستيشن (الرمادي، العراق): منيو رقمي عربي RTL، طلب عبر QR من الموبايل أو جهاز لوحي، شاشة كاشير، نقاط ولاء ببطاقات QR، لوحة مبيعات وأرباح، وبوت تليغرام للإحصائيات.

A complete cafe order-management PWA: Arabic-first digital menu, QR/kiosk self-ordering, cashier POS with thermal receipts, points-based loyalty with scannable QR cards, sales/profit dashboard, expenses, and a Telegram stats bot.

## Stack
Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + Storage) · Vitest

## التشغيل / Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys (see below)
npm run db:apply supabase/migrations/0001_init.sql
npm run db:apply supabase/migrations/0002_security.sql
npm run db:apply supabase/migrations/0003_seed.sql
npm run db:apply supabase/migrations/0004_storage.sql
node scripts/create-admin.mjs   # creates the owner login from ADMIN_EMAIL/ADMIN_PASSWORD
npm run dev
```

بدون إعداد Supabase يعمل التطبيق تلقائياً في **وضع تجريبي** (منيو محلي، بدون حفظ).

### Environment (.env.local)
| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public client config |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; the ONLY path to cost/profit + loyalty rpc |
| `SUPABASE_DB_URL` | Postgres connection (use the **session pooler** URL) for `npm run db:apply` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | one-time owner account creation |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OWNER_CHAT_IDS` | stats bot (`npm run bot`) |
| `POINTS_PER_IQD` / `POINTS_PER_REWARD` / `REWARD_VALUE_IQD` | loyalty tuning |

## الصفحات / Routes
- `/menu` · `/kiosk` — منيو الزبائن والطلب الذاتي (عام، `?t=N` لرقم الطاولة)
- `/card/[serial]` — بطاقة الولاء العامة (QR + النقاط)
- `/cashier` — الكاشير: طلبات + دفع + فاتورة 80mm + استقبال طلبات الموبايل
- `/dashboard` — المبيعات/الأرباح/المصروفات/الصافي + رسم بياني
- `/menu-admin` — إدارة الأصناف والصور والأسعار والكلفة
- `/loyalty` — البطاقات والنقاط · `/expenses` — المصروفات · `/qr` — ملصقات QR للطباعة

## الأمان / Security model
- Cost & profit **never traverse PostgREST**: revoked from `anon`+`authenticated`; admin reads them only via the service-role client, server-side.
- Orders are placed through the `place_order` SECURITY DEFINER rpc — prices recomputed server-side, atomic daily order numbers, snapshots.
- Loyalty points are a ledger (`loyalty_events`) with DB-enforced idempotency (no double-award).

## Commands
`npm run dev` · `npm run check` (lint+types+build) · `npm test` · `npm run db:apply <file>` · `npm run bot`

## Deploy
Netlify-ready (`netlify.toml`, `@netlify/plugin-nextjs`). Set the env vars above in the site settings.
