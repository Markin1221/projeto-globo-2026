-- Bairro em Pauta: schema inicial (PostgreSQL 14+).
-- Convenções: nomes em snake_case; chaves naturais em texto (slug) para o que é configuração
-- (cidades, bairros, fontes, temas) e UUID para o que é conteúdo gerado; datas sempre em timestamptz.

-- ---------------------------------------------------------------------------------------------
-- Geografia
-- ---------------------------------------------------------------------------------------------
create table cities (
  id     text primary key,                 -- slug: 'recife'
  name   text not null,
  state  char(2) not null default 'PE',
  lat    double precision not null,        -- centro do mapa
  lng    double precision not null,
  zoom   int not null default 12,
  active boolean not null default true
);

create table bairros (
  id         text primary key,             -- slug único: 'casa-amarela', 'olinda-carmo'
  city_id    text not null references cities(id),
  name       text not null,
  region     text not null default '',     -- 'Zona Norte', 'Centro'...
  lat        double precision not null,    -- centroide
  lng        double precision not null,
  boundary   jsonb,                        -- geometria GeoJSON (Polygon/MultiPolygon), opcional
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city_id, name)
);

-- Outros nomes pelos quais o bairro aparece em textos ("Recife Antigo"). Usado na detecção.
create table bairro_aliases (
  bairro_id text not null references bairros(id) on delete cascade,
  alias     text not null,
  primary key (bairro_id, alias)
);

-- Pares de bairros com nomes parecidos ("Boa Vista" x "Boa Viagem"): a interface pede confirmação.
create table bairro_confusions (
  bairro_id text not null references bairros(id) on delete cascade,
  other_id  text not null references bairros(id) on delete cascade,
  primary key (bairro_id, other_id),
  check (bairro_id <> other_id)
);

-- Vias com nome de bairro ("Avenida Boa Viagem", "Rua Boa Vista"): não contam como citação do bairro.
create table streets (
  id        bigint generated always as identity primary key,
  bairro_id text not null references bairros(id) on delete cascade,
  name      text not null,
  unique (bairro_id, name)
);

-- ---------------------------------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------------------------------
create table users (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  handle           text not null unique,
  role             text not null default 'morador' check (role in ('morador', 'jornalista', 'moderador', 'admin')),
  bio              text not null default '',
  home_bairro_id   text references bairros(id) on delete set null,
  hue              int not null default 210,           -- cor do avatar
  blocked          boolean not null default false,
  location_allowed boolean not null default false,
  location_label   text,
  deleted_at       timestamptz,                        -- conta apagada: dados pessoais já removidos
  created_at       timestamptz not null default now()
);

create table user_follows (
  user_id    uuid not null references users(id) on delete cascade,
  bairro_id  text not null references bairros(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bairro_id)
);
create index user_follows_bairro_idx on user_follows (bairro_id);

-- ---------------------------------------------------------------------------------------------
-- Fontes, temas e notícias (o que um scraper alimenta)
-- ---------------------------------------------------------------------------------------------
-- Programa de TV ou portal. Para raspar o G1, use a fonte 'g1-pe' (ou crie outra no Admin).
create table sources (
  id         text primary key,             -- slug: 'ne1', 'g1-pe'
  name       text not null unique,
  short      text not null,
  kind       text not null check (kind in ('telejornal', 'esporte', 'comunitario', 'portal')),
  schedule   text not null default '',
  base_url   text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table topics (
  id    text primary key,                  -- 'alagamento', 'transito'... 'geral' é o padrão
  label text not null
);

-- Assunto recorrente que liga várias notícias ("Buraco na Rua Alto do Céu").
create table issues (
  id    text primary key,
  label text not null
);

-- Cada execução de ingestão (scraper, importação). Permite auditar e desfazer um lote.
create table ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   text not null references sources(id),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  received    int not null default 0,
  created     int not null default 0,
  updated     int not null default 0,
  skipped     int not null default 0,
  notes       text
);

-- Tabela única de conteúdo oficial:
--   'trecho'  = trecho de telejornal (tem transcript_lines)
--   'materia' = matéria de portal (vem do scraper)
--   'post'    = post oficial escrito pela redação na plataforma
create table news_items (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('trecho', 'materia', 'post')),
  source_id         text references sources(id),
  title             text not null,
  summary           text not null default '',          -- linha fina / resumo
  body              text not null default '',          -- parágrafos separados por linha em branco
  topic_id          text not null default 'geral' references topics(id),
  author_id         uuid references users(id) on delete set null,
  author_name       text,                               -- assinatura da fonte externa
  published_at      timestamptz not null,
  url               text unique,                        -- URL canônica: chave de deduplicação do scraper
  external_id       text,                               -- id da notícia na fonte, se houver
  content_hash      text,                               -- sha256 de título+resumo+corpo: detecta atualização
  image_url         text,
  duration_sec      int,                                -- só para trechos
  what_changes      text[] not null default '{}',       -- "O que muda para você"
  audio_description text[] not null default '{}',
  is_live           boolean not null default false,
  issue_id          text references issues(id) on delete set null,
  origin_relato_id  uuid,                               -- FK adicionada abaixo (relato que virou pauta)
  ingest_run_id     uuid references ingest_runs(id) on delete set null,
  raw               jsonb,                              -- payload original da fonte, para reprocessar
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_id, external_id)
);
create index news_items_published_idx on news_items (published_at desc);
create index news_items_source_idx on news_items (source_id, published_at desc);
create index news_items_topic_idx on news_items (topic_id);
create index news_items_issue_idx on news_items (issue_id) where issue_id is not null;

-- Rastreamento geográfico: em quais bairros a notícia foi pautada e como soubemos.
create table news_item_bairros (
  news_item_id uuid not null references news_items(id) on delete cascade,
  bairro_id    text not null references bairros(id) on delete cascade,
  method       text not null default 'detectado' check (method in ('detectado', 'manual')),
  matched_text text,                                    -- trecho que disparou a detecção
  primary key (news_item_id, bairro_id)
);
create index news_item_bairros_bairro_idx on news_item_bairros (bairro_id);

create table transcript_lines (
  id           bigint generated always as identity primary key,
  news_item_id uuid not null references news_items(id) on delete cascade,
  t_sec        int not null,                            -- segundo dentro do trecho
  speaker      text not null default '',
  text         text not null
);
create index transcript_lines_item_idx on transcript_lines (news_item_id, t_sec);

-- ---------------------------------------------------------------------------------------------
-- Relatos informais de moradores (não verificados)
-- ---------------------------------------------------------------------------------------------
create table relatos (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null references topics(id),
  description   text not null,
  media_type    text check (media_type in ('foto', 'video', 'audio')),
  media_name    text,
  bairro_id     text not null references bairros(id),
  street        text not null,
  reference     text not null,
  pin_lat       double precision,
  pin_lng       double precision,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  author_id     uuid not null references users(id),
  status        text not null default 'enviado' check (status in ('enviado', 'apuracao', 'confirmado', 'falso')),
  assignee_id   uuid references users(id) on delete set null,  -- jornalista responsável
  newsroom_note text
);
create index relatos_bairro_idx on relatos (bairro_id, status);
create index relatos_author_idx on relatos (author_id);

alter table news_items add constraint news_items_origin_relato_fk
  foreign key (origin_relato_id) references relatos(id) on delete set null;

-- Dados de contato ficam em tabela própria: a API só entrega a jornalista, admin e ao autor.
create table relato_contacts (
  relato_id       uuid primary key references relatos(id) on delete cascade,
  full_name       text not null,
  age             int not null check (age between 13 and 120),
  phone           text not null,
  address         text not null,
  accepts_contact boolean not null default false
);

-- "Eu também vi". user_id nulo = confirmação simulada da demo.
create table relato_confirmations (
  id         bigint generated always as identity primary key,
  relato_id  uuid not null references relatos(id) on delete cascade,
  user_id    uuid references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index relato_confirmations_once_idx on relato_confirmations (relato_id, user_id) where user_id is not null;
create index relato_confirmations_relato_idx on relato_confirmations (relato_id);

create table relato_status_history (
  id        bigint generated always as identity primary key,
  relato_id uuid not null references relatos(id) on delete cascade,
  status    text not null check (status in ('enviado', 'apuracao', 'confirmado', 'falso')),
  at        timestamptz not null default now(),
  by_user   uuid references users(id) on delete set null
);
create index relato_status_history_relato_idx on relato_status_history (relato_id, at);

-- ---------------------------------------------------------------------------------------------
-- Comunidade e moderação. "target" é polimórfico: (tipo, id) aponta para
--   'segment' | 'article' -> news_items,  'relato' -> relatos,  'comment' -> comments
-- ---------------------------------------------------------------------------------------------
create table comments (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('segment', 'article', 'relato')),
  target_id   uuid not null,
  parent_id   uuid references comments(id) on delete cascade,
  author_id   uuid references users(id) on delete set null,   -- nulo = visitante sem conta
  guest_name  text,
  guest_age   int check (guest_age is null or guest_age >= 13),
  text        text not null,
  created_at  timestamptz not null default now()
);
create index comments_target_idx on comments (target_type, target_id, created_at);

create table user_saves (
  user_id     uuid not null references users(id) on delete cascade,
  target_type text not null check (target_type in ('segment', 'article', 'relato')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('segment', 'article', 'relato', 'comment')),
  target_id   uuid not null,
  reason      text not null,
  detail      text not null default '',
  reporter_id uuid references users(id) on delete set null,
  status      text not null default 'aberta' check (status in ('aberta', 'procedente', 'improcedente')),
  created_at  timestamptz not null default now()
);
create index reports_status_idx on reports (status, created_at desc);

create table hidden_content (
  target_type text not null check (target_type in ('segment', 'article', 'relato', 'comment')),
  target_id   uuid not null,
  hidden_by   uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id)
);

create table locked_threads (
  target_type text not null check (target_type in ('segment', 'article', 'relato')),
  target_id   uuid not null,
  locked_by   uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id)
);

-- ---------------------------------------------------------------------------------------------
-- Alertas práticos e notificações
-- ---------------------------------------------------------------------------------------------
create table alerts (
  id           uuid primary key default gen_random_uuid(),
  bairro_id    text not null references bairros(id) on delete cascade,
  type         text not null check (type in ('transito', 'obras', 'agua', 'seguranca', 'alagamento', 'vacinacao')),
  title        text not null,
  detail       text not null default '',
  severity     text not null default 'info' check (severity in ('info', 'atencao', 'urgente')),
  source_label text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index alerts_bairro_idx on alerts (bairro_id) where active;

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('ao-vivo', 'relato', 'comentario', 'alerta', 'sistema', 'redacao')),
  title      text not null,
  body       text not null default '',
  href       text not null default '/',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table app_meta (
  key   text primary key,
  value jsonb not null
);
