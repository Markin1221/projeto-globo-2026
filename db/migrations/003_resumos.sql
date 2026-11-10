-- Cache dos resumos de relatos. A chave muda quando os relatos ou as confirmações mudam,
-- então a IA só é chamada de novo quando há algo novo para resumir.
create table ai_summaries (
  key        text primary key,
  scope      text not null check (scope in ('grupo', 'geral')),
  engine     text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_summaries_created_idx on ai_summaries (created_at);
