-- Casos: notícias e relatos ligados ao mesmo problema, com a etapa de cada um.
alter table issues add column if not exists created_at timestamptz not null default now();
alter table issues add column if not exists created_by uuid references users(id) on delete set null;

-- Relato também pode ser ligado a um caso pela redação.
alter table relatos add column if not exists issue_id text references issues(id) on delete set null;

-- Etapa escolhida pela redação (sobrepõe a detectada pelo texto) e "tirar do caso" automático.
alter table news_items add column if not exists case_stage text check (case_stage in ('problema','andamento','resolvido'));
alter table news_items add column if not exists case_unlinked boolean not null default false;
alter table relatos add column if not exists case_stage text check (case_stage in ('problema','andamento','resolvido'));
alter table relatos add column if not exists case_unlinked boolean not null default false;

create index if not exists news_items_issue_idx on news_items (issue_id) where issue_id is not null;
create index if not exists relatos_issue_idx on relatos (issue_id) where issue_id is not null;
