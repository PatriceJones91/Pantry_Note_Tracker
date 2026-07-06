-- Pantry Note Tracker RPC Fix
-- This lets the Activity 1 app save/load rows through secure Supabase functions
-- instead of directly reading/writing the table from React.
-- Only affects Activity 1 objects.

create or replace function public.activity1_load_rows(
  p_participant_id text
)
returns table (
  id uuid,
  row_order integer,
  item_name text,
  quantity text,
  unit text,
  category text,
  expiration_date date,
  notes text
)
language sql
security definer
set search_path = public
as $$
  select
    api.id,
    api.row_order,
    api.item_name,
    api.quantity,
    api.unit,
    api.category,
    api.expiration_date,
    api.notes
  from public.activity1_pantry_items api
  where api.participant_id = p_participant_id
  order by api.row_order asc, api.created_at asc;
$$;

create or replace function public.activity1_save_rows(
  p_participant_id text,
  p_username text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  delete from public.activity1_pantry_items
  where participant_id = p_participant_id;

  insert into public.activity1_pantry_items (
    participant_id,
    username,
    row_order,
    item_name,
    quantity,
    unit,
    category,
    expiration_date,
    notes
  )
  select
    p_participant_id,
    nullif(trim(coalesce(p_username, '')), ''),
    coalesce(nullif(row_data.value ->> 'row_order', '')::integer, row_data.ordinality::integer),
    nullif(trim(coalesce(row_data.value ->> 'item_name', '')), ''),
    nullif(trim(coalesce(row_data.value ->> 'quantity', '')), ''),
    nullif(trim(coalesce(row_data.value ->> 'unit', '')), ''),
    nullif(trim(coalesce(row_data.value ->> 'category', '')), ''),
    nullif(trim(coalesce(row_data.value ->> 'expiration_date', '')), '')::date,
    nullif(trim(coalesce(row_data.value ->> 'notes', '')), '')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as row_data(value, ordinality)
  where
    nullif(trim(coalesce(row_data.value ->> 'item_name', '')), '') is not null
    or nullif(trim(coalesce(row_data.value ->> 'quantity', '')), '') is not null
    or nullif(trim(coalesce(row_data.value ->> 'unit', '')), '') is not null
    or nullif(trim(coalesce(row_data.value ->> 'category', '')), '') is not null
    or nullif(trim(coalesce(row_data.value ->> 'expiration_date', '')), '') is not null
    or nullif(trim(coalesce(row_data.value ->> 'notes', '')), '') is not null;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.activity1_load_rows(text) to anon, authenticated;
grant execute on function public.activity1_save_rows(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
