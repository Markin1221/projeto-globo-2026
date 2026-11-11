// Limites oficiais dos bairros (GeoJSON em db/limites/). Fonte: Portal de Dados Abertos da Prefeitura do Recife (ODbL).
// Os contornos entram no banco sozinhos: na carga dos dados de exemplo e em toda subida, para bairros ainda sem limite.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { q } from './db';

const DIR = process.env.LIMITS_DIR ?? resolve(process.env.MIGRATIONS_DIR ?? resolve(__dirname, '../../../../db/migrations'), '../limites');
const FILES: Record<string, string> = { recife: 'recife-bairros.geojson' };
// Nome oficial diferente do nome usado no app.
const ALIAS: Record<string, string> = { 'bairro do recife': 'recife' };

export interface LimitFeature { type: 'Feature'; properties: { nome: string }; geometry: unknown }
const cache = new Map<string, { type: 'FeatureCollection'; features: LimitFeature[] } | null>();
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** O GeoJSON de uma cidade (todos os bairros), ou null se não houver arquivo. */
export function cityLimits(cityId: string) {
  if (!cache.has(cityId)) {
    const file = FILES[cityId] ? resolve(DIR, FILES[cityId]) : '';
    cache.set(cityId, file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
  }
  return cache.get(cityId) ?? null;
}

/** Grava o contorno oficial nos bairros que ainda não têm. Devolve quantos foram atualizados. */
export async function applyLimits(c?: PoolClient) {
  const run = <T extends Record<string, unknown>>(sql: string, p: unknown[]) => (c ? c.query(sql, p).then((r) => r.rows as T[]) : q<T>(sql, p));
  let n = 0;
  for (const cityId of Object.keys(FILES)) {
    const geo = cityLimits(cityId);
    if (!geo) continue;
    const byName = new Map(geo.features.map((f) => [norm(f.properties.nome), f.geometry]));
    const rows = await run<{ id: string; name: string }>('select id, name from bairros where city_id = $1 and boundary is null', [cityId]);
    for (const b of rows) {
      const key = norm(b.name);
      const geom = byName.get(ALIAS[key] ?? key);
      if (!geom) continue;
      await run('update bairros set boundary = $2 where id = $1', [b.id, JSON.stringify(geom)]);
      n++;
    }
  }
  return n;
}
