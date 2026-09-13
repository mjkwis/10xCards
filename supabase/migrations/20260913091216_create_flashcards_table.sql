-- Create flashcards table with owner-scoped RLS.
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  front text not null check (char_length(front) <= 200),
  back text not null check (char_length(back) <= 500),
  source text not null check (source in ('ai-full', 'ai-edited', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_user_id_idx on public.flashcards (user_id);

alter table public.flashcards enable row level security;

create policy "flashcards_select_own" on public.flashcards
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "flashcards_insert_own" on public.flashcards
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "flashcards_update_own" on public.flashcards
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flashcards_delete_own" on public.flashcards
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row execute function public.set_updated_at();
