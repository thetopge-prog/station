-- 0034_curbside_enum.sql — ENUM VALUE ONLY. Nothing else may live in this file.
--
-- Same constraint as 0023: Postgres refuses to *use* an enum value in the same
-- transaction that adds it, and db-apply.mjs runs each file as one batch. So
-- the value lands here and every consumer comes in 0035.
--
-- «الطلب من السيارة» is its own fulfilment mode, not a flavour of pickup: the
-- customer never comes inside, a runner carries the bag out to a parked car,
-- and the expediter has to message them first. Different work, different value.

alter type public.order_channel add value if not exists 'curbside';
