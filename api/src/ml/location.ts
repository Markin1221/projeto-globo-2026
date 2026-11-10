// Localização de uma notícia: Recife, Região Metropolitana, interior de PE ou fora do estado; e quais bairros.
// Três camadas, da mais confiável para a menos:
//   1. nomes de bairro no texto (detecção com regras, em ingest.ts)
//   2. pontos de referência e vias conhecidas ("Instituto Ricardo Brennand" -> Várzea)
//   3. classificador Naive Bayes treinado com as notícias já localizadas (só quando 1 e 2 não acham nada)
import type { Bairro, Street } from '../../../shared/domain/types';
import { NaiveBayes } from './bayes';
import { LANDMARKS, PLACES, UF_OUTSIDE, type Scope } from './places';
import { escapeRe, strip } from './text';

export type LocationScope = Scope | 'indefinido';
export interface Evidence { scope: Scope; place: string; field: 'titulo' | 'resumo' | 'texto' }
export interface LocationResult {
  scope: LocationScope;
  city?: string;
  confidence: number;
  evidence: Evidence[];
  landmarks: { bairroId: string; name: string }[];
  predicted?: { bairroId: string; p: number; words: string[] };
}

const WEIGHT = { titulo: 3, resumo: 2, texto: 1 } as const;
const PREP = /(?:^|[^\p{L}])(?:em|no|na|nos|nas|de|do|da|dos|das|para|pra|ate)\s+$/iu;

const compiled = PLACES.map((p) => ({ ...p, re: new RegExp(`(?<![\\p{L}])${escapeRe(strip(p.name))}(?![\\p{L}])`, 'gu') }));

function scan(text: string, field: Evidence['field']): Evidence[] {
  const plain = strip(text);
  const out: Evidence[] = [];
  const taken: [number, number][] = [];
  // Nomes mais longos primeiro: "Jaboatão dos Guararapes" antes de "Jaboatão", "Cabo de Santo Agostinho" antes de "Cabo".
  for (const p of [...compiled].sort((a, b) => b.name.length - a.name.length)) {
    for (const m of plain.matchAll(p.re)) {
      const s = m.index!, e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      if (p.ambiguous && !PREP.test(plain.slice(Math.max(0, s - 8), s))) continue;
      taken.push([s, e]);
      out.push({ scope: p.scope, place: p.name, field });
    }
  }
  for (const m of plain.matchAll(UF_OUTSIDE)) out.push({ scope: m[1] === 'PE' ? 'pe' : 'fora', place: `(${m[1]})`, field });
  if (/(?:^|\s)(?:em|de|no|do)\s+PE\b/.test(plain)) out.push({ scope: 'pe', place: 'PE', field });
  return out;
}

export function findLandmarks(text: string, bairros: Bairro[], streets: Street[]) {
  const plain = strip(text).toLowerCase();
  const ids = new Set(bairros.filter((b) => b.active).map((b) => b.id));
  const list = [...LANDMARKS, ...streets.map((s) => ({ name: s.name, bairroId: s.bairroId }))];
  const out = new Map<string, string>();
  for (const l of list) {
    if (!ids.has(l.bairroId) || out.has(l.bairroId)) continue;
    if (new RegExp(`(?<![\\p{L}])${escapeRe(strip(l.name).toLowerCase())}(?![\\p{L}])`, 'u').test(plain)) out.set(l.bairroId, l.name);
  }
  return [...out].map(([bairroId, name]) => ({ bairroId, name }));
}

/**
 * Decide o escopo pelo peso das menções (título vale 3, resumo 2, texto 1).
 * Bairros detectados contam como Recife ou como a cidade deles.
 */
export function locate(
  input: { title: string; summary?: string; text?: string },
  ctx: { bairros: Bairro[]; streets: Street[]; detected: string[]; model?: NaiveBayes | null; cityScope: (cityId: string) => Scope },
): LocationResult {
  const evidence = [...scan(input.title, 'titulo'), ...scan(input.summary ?? '', 'resumo'), ...scan(input.text ?? '', 'texto')];
  const all = [input.title, input.summary, input.text].filter(Boolean).join('\n');
  const landmarks = findLandmarks(all, ctx.bairros, ctx.streets).filter((l) => !ctx.detected.includes(l.bairroId));
  const score: Record<Scope, number> = { recife: 0, rmr: 0, pe: 0, fora: 0 };
  for (const e of evidence) score[e.scope] += WEIGHT[e.field];
  for (const id of [...ctx.detected, ...landmarks.map((l) => l.bairroId)]) {
    const b = ctx.bairros.find((x) => x.id === id);
    if (b) score[ctx.cityScope(b.cityId)] += 2;
  }
  // "Pernambuco" sozinho é fraco: quase toda notícia local cita o estado.
  const order: Scope[] = ['recife', 'rmr', 'pe', 'fora'];
  const total = order.reduce((a, s) => a + score[s], 0);
  let scope: LocationScope = 'indefinido';
  let best = 0;
  for (const s of order) if (score[s] > best) { best = score[s]; scope = s; }
  const city = evidence.filter((e) => e.scope === scope && e.place.length > 3 && !/^\(|^PE$|Pernambuco|Região|Grande Recife|Agreste|Sertão|Zona da Mata|Vale/.test(e.place))
    .sort((a, b) => WEIGHT[b.field] - WEIGHT[a.field])[0]?.place ?? (scope === 'recife' ? 'Recife' : undefined);

  let predicted: LocationResult['predicted'];
  if (ctx.model && !ctx.detected.length && !landmarks.length && (scope === 'recife' || scope === 'indefinido')) {
    const [top, second] = ctx.model.predict(all);
    if (top && top.p >= 0.6 && top.p - (second?.p ?? 0) >= 0.3 && ctx.model.docsOf(top.label) >= 3) {
      predicted = { bairroId: top.label, p: Math.round(top.p * 100) / 100, words: ctx.model.explain(all, top.label) };
    }
  }
  return { scope, city, confidence: total ? Math.round((best / total) * 100) / 100 : 0, evidence: evidence.slice(0, 12), landmarks, predicted };
}
