-- Add FSRS scheduling state to flashcards, defaulted to match ts-fsrs's createEmptyCard() output.
-- Note: ts-fsrs@5.x's Card shape includes `learning_steps` alongside the originally-planned 9 fields.
alter table public.flashcards
  add column due_at timestamptz not null default now(),
  add column stability double precision not null default 0,
  add column difficulty double precision not null default 0,
  add column elapsed_days integer not null default 0,
  add column scheduled_days integer not null default 0,
  add column learning_steps integer not null default 0,
  add column reps integer not null default 0,
  add column lapses integer not null default 0,
  add column state smallint not null default 0,
  add column last_reviewed_at timestamptz;

create index flashcards_due_idx on public.flashcards (user_id, due_at);
