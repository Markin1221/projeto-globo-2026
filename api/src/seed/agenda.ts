// Agenda de exemplo: reportagens planejadas para os próximos dias, a partir de hoje (horário do Recife).
import type { PoolClient } from 'pg';
import { q } from '../db';

const ITEMS: [number, string | null, 'g1' | 'ne1' | 'ne2', string, string | null, string?][] = [
  [-2, 'casa-amarela', 'ne1', 'O buraco da Rua Alto do Céu', '12:10', 'Equipe volta à rua para mostrar como ficou depois do reparo.'],
  [0, 'casa-amarela', 'ne1', 'Série: as obras de drenagem do Recife', '12:20', 'Primeiro episódio, nos morros de Casa Amarela.'],
  [1, 'varzea', 'g1', 'Especial: a falta de água na Várzea', null, 'Reportagem com mapa das ruas mais afetadas.'],
  [2, 'boa-vista', 'ne2', 'O comércio da Boa Vista à noite', '19:15'],
  [3, 'torre', 'ne1', 'Como está a ponte de pedestres da Torre', '12:30'],
  [5, null, 'g1', 'Guia do período de chuvas no Recife', null, 'Onde pedir ajuda, áreas de risco e telefones úteis.'],
  [7, 'ibura', 'ne2', 'Mutirão de limpeza do canal do Ibura', '19:20'],
  [9, null, 'ne1', 'Mobilidade: os ônibus da Zona Norte', '12:15'],
  [12, 'espinheiro', 'g1', 'Calçadas do Espinheiro depois do tapa-buraco', null],
];

/** Cria a agenda de exemplo. Só bairros que existirem no banco. */
export async function seedAgenda(c?: PoolClient) {
  const run = (sql: string, p: unknown[]) => (c ? c.query(sql, p).then((r) => r.rows) : q(sql, p));
  const bairros = new Set(((await run('select id from bairros', [])) as { id: string }[]).map((r) => r.id));
  for (const [days, bairro, outlet, title, time, note] of ITEMS) {
    if (bairro && !bairros.has(bairro)) continue;
    await run("insert into agenda (title, note, starts_on, at_time, outlet, city_id, bairro_id) values ($1, $2, (now() at time zone 'America/Recife')::date + $3::int, $4, $5, 'recife', $6)",
      [title, note ?? null, days, time, outlet, bairro]);
  }
}
