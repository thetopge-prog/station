-- 0094: ذاكرة عبارات الزبائن — «يتعلم مما يطلبون».
-- كل نصّ حرّ يكتبه زبون للبوت (واتساب/تيليغرام) يُحفظ مع ما فُهم منه. المرّة
-- التالية نفس العبارة تُفهم من الذاكرة فوراً بلا نموذج لغوي، والمالك يرى ماذا
-- يكتب الزبائن فعلاً (select * from bot_phrases order by hits desc).
create table if not exists public.bot_phrases (
  text_key text primary key,              -- النصّ مطويّاً (بلا تشكيل/همزات) — مفتاح المطابقة
  text text not null,                     -- كما كتبه الزبون أول مرّة
  intent text not null check (intent in ('order', 'menu', 'other')),
  parsed jsonb,                           -- {lines:[{item_id,size,qty,note}], reply}
  source text not null default 'llm',     -- rules | llm | memory
  hits int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.bot_phrases enable row level security;
revoke all on public.bot_phrases from anon, authenticated;
