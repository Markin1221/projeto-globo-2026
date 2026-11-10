// Importa limites reais de bairros (GeoJSON) para o banco.
//
// Uso (dentro de api/):
//   node scripts/importar-limites.mjs <arquivo.geojson> --cidade recife --campo EBAIRRNOMEOF [--criar]
//
// --cidade  id da cidade no banco (recife, olinda, jaboatao...)
// --campo   propriedade do GeoJSON que tem o nome do bairro (veja abrindo o arquivo)
// --criar   cria os bairros que ainda não existem (sem isso, só atualiza os existentes)
//
// O arquivo de bairros do Recife está no portal de dados abertos da prefeitura (dados.recife.pe.gov.br).
// Use coordenadas em WGS84 (EPSG:4326). Se vier em outra projeção, converta antes (ex.: ogr2ogr -t_srs EPSG:4326).
import { readFileSync } from 'node:fs';
import pg from 'pg';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const cityId = opt('cidade') ?? 'recife';
const field = opt('campo');
const create = args.includes('--criar');
if (!file || !field) {
  console.error('Uso: node scripts/importar-limites.mjs <arquivo.geojson> --cidade recife --campo NOME_DO_CAMPO [--criar]');
  process.exit(1);
}

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-');
const title = (s) => String(s).toLowerCase().replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

/** Centro aproximado: média dos vértices do anel externo. */
function center(geom) {
  const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.type === 'MultiPolygon' ? geom.coordinates.map((p) => p[0]) : [];
  const pts = rings.flat();
  if (!pts.length) return null;
  const [lng, lat] = pts.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]).map((v) => v / pts.length);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Coordenadas fora de WGS84. Converta o arquivo para EPSG:4326.');
  return { lat, lng };
}

const geo = JSON.parse(readFileSync(file, 'utf8'));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://bairro:bairro@localhost:5432/bairro' });
await client.connect();
const { rows: city } = await client.query('select id from cities where id = $1', [cityId]);
if (!city.length) { console.error(`Cidade "${cityId}" não existe no banco.`); process.exit(1); }
const { rows: existing } = await client.query('select id, name from bairros where city_id = $1', [cityId]);
const byName = new Map(existing.map((b) => [norm(b.name), b.id]));

let updated = 0, created = 0, skipped = [];
for (const f of geo.features ?? []) {
  const raw = f.properties?.[field];
  if (!raw || !f.geometry) continue;
  const c = center(f.geometry);
  if (!c) continue;
  const id = byName.get(norm(raw));
  if (id) {
    await client.query('update bairros set boundary = $2, lat = $3, lng = $4 where id = $1', [id, f.geometry, c.lat, c.lng]);
    updated++;
  } else if (create) {
    const name = title(raw);
    const newId = cityId === 'recife' ? slug(name) : `${cityId}-${slug(name)}`;
    await client.query('insert into bairros (id, city_id, name, lat, lng, boundary) values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing', [newId, cityId, name, c.lat, c.lng, f.geometry]);
    created++;
  } else skipped.push(raw);
}
await client.end();
console.log(`Atualizados: ${updated}. Criados: ${created}. Sem correspondência: ${skipped.length}${skipped.length ? ` (${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '...' : ''}). Use --criar para incluí-los.` : '.'}`);
