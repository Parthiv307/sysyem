-- Hunter System schema for Supabase.
-- Run this once in your project's SQL Editor (Supabase dashboard -> SQL Editor -> New query -> paste -> Run).

create table if not exists hunter_data (
  user_id uuid references auth.users(id) on delete cascade primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: a user can only ever read or write their own row.
alter table hunter_data enable row level security;

create policy "Users can read their own hunter data"
  on hunter_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own hunter data"
  on hunter_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own hunter data"
  on hunter_data for update
  using (auth.uid() = user_id);

create policy "Users can delete their own hunter data"
  on hunter_data for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh on every write.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists hunter_data_updated_at on hunter_data;
create trigger hunter_data_updated_at
  before update on hunter_data
  for each row execute function set_updated_at();
