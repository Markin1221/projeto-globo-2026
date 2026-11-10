-- Resultados dos modelos de apoio (localização e utilidade das notícias).

-- Onde a notícia se passa: 'recife', 'rmr' (Região Metropolitana), 'pe' (resto do estado), 'fora' ou 'indefinido'.
alter table news_items add column location_scope text check (location_scope in ('recife', 'rmr', 'pe', 'fora', 'indefinido'));
alter table news_items add column location_city text;
-- Utilidade para o dia a dia do morador, de 0 a 100.
alter table news_items add column utility smallint check (utility between 0 and 100);
-- Detalhes das previsões (evidências, motivos), para auditoria.
alter table news_items add column ml jsonb;
create index news_items_scope_idx on news_items (location_scope);

-- Vínculo previsto pelo modelo (sem o nome do bairro no texto), com a confiança.
alter table news_item_bairros drop constraint news_item_bairros_method_check;
alter table news_item_bairros add constraint news_item_bairros_method_check check (method in ('detectado', 'manual', 'referencia', 'previsto'));
alter table news_item_bairros add column confidence real;
