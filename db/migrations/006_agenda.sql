-- Agenda de reportagens: o que a redação planeja mostrar em cada bairro (ou no Recife inteiro), e onde (g1, NE1, NE2).
create table if not exists agenda (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 140),
  note        text check (note is null or char_length(note) <= 400),
  starts_on   date not null,
  at_time     time,
  outlet      text not null check (outlet in ('g1', 'ne1', 'ne2')),
  city_id     text not null default 'recife' references cities(id),
  bairro_id   text references bairros(id) on delete cascade,   -- null = a cidade toda
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists agenda_day_idx on agenda (starts_on);
create index if not exists agenda_bairro_idx on agenda (bairro_id, starts_on);
