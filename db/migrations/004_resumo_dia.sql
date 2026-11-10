-- Resumo do dia por bairro também fica no cache de resumos.
alter table ai_summaries drop constraint ai_summaries_scope_check;
alter table ai_summaries add constraint ai_summaries_scope_check check (scope in ('grupo', 'geral', 'dia'));
