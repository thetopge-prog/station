-- 0008 — create_card: when the phone already exists, backfill a missing name
-- (customers who order with name+phone keep their name on file). Same signature.
create or replace function public.create_card(p_phone text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_serial text; v_id uuid;
begin
  if p_phone is not null and length(trim(p_phone)) > 0 then
    select card_serial, id into v_serial, v_id from customers where phone = trim(p_phone);
    if found then
      if p_name is not null and length(trim(p_name)) > 0 then
        update customers set name_ar = coalesce(nullif(name_ar, ''), trim(p_name)) where id = v_id;
      end if;
      return v_serial;
    end if;
  end if;
  insert into customers(phone, name_ar)
    values (nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_name, '')), ''))
    returning card_serial into v_serial;
  return v_serial;
end $$;
