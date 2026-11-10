// Ingestão de notícias de fontes externas (ex.: o scraper do G1). Idempotente por URL.
import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { classifyTopic, detectBairros, normalize, stripAccents, TOPIC_LABEL } from '../../shared/domain/rules';
import type { Bairro, Street } from '../../shared/domain/types';
import { pool, q, tx, type Conn } from './db';
import { getLocationModel, retrainSoon } from './ml/models';
import { locate } from './ml/location';
import type { Scope } from './ml/places';
import { newsUtility } from './ml/utility';
import { loadBairros } from './repo';
import { emit } from './service';

export interface IngestItem {
  url: string;
  title: string;
  summary?: string;
  body?: string;
  publishedAt: string | number;
  externalId?: string;
  imageUrl?: string;
  authorName?: string;
  /** Força bairros além dos detectados no texto. */
  bairroIds?: string[];
  topic?: string;
  /** 'materia' (padrão) ou 'trecho' (vídeo de telejornal com transcrição). */
  kind?: 'materia' | 'trecho';
  durationSec?: number;
  transcript?: { t: number; speaker?: string; text: string }[];
  /** Texto usado só para detectar bairros e tema. Não é guardado nem exibido (ex.: corpo da matéria sem autorização de reprodução). */
  detectText?: string;
  raw?: unknown;
}
/** force: reprocessa mesmo sem mudança no conteúdo (refaz bairros e tema depois de ajustar a detecção). */
export interface IngestBody { sourceId: string; items: IngestItem[]; force?: boolean }

const MAX_ITEMS = 200;

/** Nomes de bairro que também são palavras comuns: exigem letra maiúscula e contexto de lugar. */
const COMMON_WORDS = new Set(['torre', 'pina', 'gracas', 'madalena', 'varzea', 'prazeres', 'carmo', 'cavaleiro', 'piedade', 'ibura', 'boa vista']);
/** "Maria das Graças", "Nossa Senhora do Carmo", "Igreja da Madalena": nome de pessoa, santa ou instituição, não o bairro. */
const NAME_BEFORE = /(maria|jose|joao|ana|senhora|santa|santo|sao|igreja|paroquia|capela|convento|colegio|escola|hospital|instituto|fundacao|clube|edificio|condominio|shopping)\s+(d[aeo]s?\s+)?$/i;
/** Expressões comuns: "graças a", "graças à", "a torre de", "torre de energia". */
const COMMON_PHRASE: Record<string, RegExp> = {
  gracas: /^gracas\s+(a|ao|aos|as|a\s|por|pela|pelo|de deus)\b/i,
  torre: /^torre\s+(de|da|do|eiffel)\b/i,
  piedade: /^piedade\s+(de|da|do|com|para)\b/i,
  'boa vista': /^boa vista\s*(\(rr\)|,?\s*-?\s*(rr|roraima)\b)/i,
  prazeres: /^prazeres\b(?!\s*,?\s*(em|no|na)?\s*jaboatao)/i,
};

export function detectFor(text: string, bairros: Bairro[]) {
  const plain = stripAccents(text);
  const lower = plain.toLowerCase();
  const out = new Map<string, string>();
  for (const d of detectBairros(text, bairros)) {
    if (d.kind !== 'bairro' || out.has(d.bairroId)) continue;
    const key = normalize(d.match);
    if (COMMON_WORDS.has(key)) {
      const original = plain.slice(d.index, d.index + d.match.length);
      if (original[0] !== original[0].toUpperCase()) continue; // "torre de energia"
      if (NAME_BEFORE.test(lower.slice(Math.max(0, d.index - 30), d.index))) continue;
      if (COMMON_PHRASE[key]?.test(lower.slice(d.index))) continue;
      // No começo de frase a maiúscula não prova nada: exige preposição de lugar antes ("na Torre", "das Graças").
      const before = lower.slice(Math.max(0, d.index - 12), d.index);
      if (!/\b(n|d)[aeo]s?\s+$|\b(em|bairro|bairro d[aeo]s?)\s+$/.test(before)) continue;
    }
    // Guarda o trecho em volta para a redação conferir por que o bairro foi marcado.
    const from = Math.max(0, d.index - 60);
    const src = text.length === plain.length ? text : plain; // com acentos, quando as posições batem
    out.set(d.bairroId, `${from > 0 ? '…' : ''}${src.slice(from, d.index + d.match.length + 60).replace(/\s+/g, ' ').trim()}…`);
  }
  return out;
}

const hash = (i: IngestItem) => createHash('sha256').update([i.title, i.summary ?? '', i.body ?? '', i.detectText ?? '', (i.transcript ?? []).map((l) => l.text).join(' ')].join('\u0001')).digest('hex');

interface AnalyzeCtx { bairros: Bairro[]; streets: Street[]; cityScope: (cityId: string) => Scope }

export async function analyzeContext(): Promise<AnalyzeCtx> {
  const [bairros, streets] = await Promise.all([loadBairros(), q<{ name: string; bairro_id: string }>('select name, bairro_id from streets')]);
  return { bairros, streets: streets.map((s) => ({ name: s.name, bairroId: s.bairro_id })), cityScope: (id) => (id === 'recife' ? 'recife' : 'rmr') };
}

/**
 * Localiza a notícia e mede a utilidade. Ordem de confiança dos bairros:
 * 'manual' (veio da fonte) > 'detectado' (nome no texto) > 'referencia' (ponto conhecido) > 'previsto' (modelo).
 */
export async function analyzeNews(c: Conn, id: string, item: Pick<IngestItem, 'title' | 'summary' | 'body' | 'detectText' | 'transcript' | 'bairroIds'>, ctx: AnalyzeCtx, opts: { keepDetected?: boolean } = {}) {
  const bairros = ctx.bairros.filter((b) => b.active);
  const text = [item.title, item.summary, item.body, item.detectText, ...(item.transcript ?? []).map((l) => l.text)].filter(Boolean).join('\n');
  const found = detectFor(text, bairros);
  await q(`delete from news_item_bairros where news_item_id = $1 and method in (${opts.keepDetected ? "'referencia', 'previsto'" : "'detectado', 'referencia', 'previsto'"})`, [id], c);
  for (const [bairroId, match] of found) {
    await q("insert into news_item_bairros (news_item_id, bairro_id, method, matched_text) values ($1,$2,'detectado',$3) on conflict do nothing", [id, bairroId, match], c);
  }
  const valid = new Set(bairros.map((b) => b.id));
  for (const b of item.bairroIds ?? []) {
    if (valid.has(b)) await q("insert into news_item_bairros (news_item_id, bairro_id, method) values ($1,$2,'manual') on conflict (news_item_id, bairro_id) do update set method = 'manual'", [id, b], c);
  }
  const manual = (await q<{ bairro_id: string }>("select bairro_id from news_item_bairros where news_item_id = $1 and method in ('manual', 'detectado')", [id], c)).map((r) => r.bairro_id);
  const detected = [...new Set([...found.keys(), ...manual])];
  const body = [item.body, item.detectText, ...(item.transcript ?? []).map((l) => l.text)].filter(Boolean).join('\n');
  const loc = locate({ title: item.title, summary: item.summary, text: body }, { ...ctx, bairros, detected, model: getLocationModel() });
  // Fora da Região Metropolitana, pontos de referência e previsões do modelo não valem.
  const local = loc.scope === 'recife' || loc.scope === 'rmr' || loc.scope === 'indefinido';
  if (local) {
    for (const l of loc.landmarks) await q("insert into news_item_bairros (news_item_id, bairro_id, method, matched_text, confidence) values ($1,$2,'referencia',$3,0.85) on conflict do nothing", [id, l.bairroId, `Ponto de referência: ${l.name}`], c);
    if (loc.predicted) await q("insert into news_item_bairros (news_item_id, bairro_id, method, matched_text, confidence) values ($1,$2,'previsto',$3,$4) on conflict do nothing",
      [id, loc.predicted.bairroId, `Previsto pelo modelo${loc.predicted.words.length ? ` (palavras: ${loc.predicted.words.join(', ').replace(/_/g, ' ')})` : ''}`, loc.predicted.p], c);
  }
  const util = newsUtility(item.title, item.summary ?? '', body);
  await q('update news_items set location_scope = $2, location_city = $3, utility = $4, ml = $5 where id = $1', [id, loc.scope, loc.city ?? null, util.score,
    JSON.stringify({ location: { scope: loc.scope, city: loc.city, confidence: loc.confidence, evidence: loc.evidence, landmarks: loc.landmarks, predicted: loc.predicted }, utility: util })], c);
  return [...new Set([...detected, ...(local ? loc.landmarks.map((l) => l.bairroId) : []), ...(local && loc.predicted ? [loc.predicted.bairroId] : [])])];
}

/** Recalcula localização e utilidade de todas as notícias com o texto que está no banco. */
export async function recomputeAll() {
  const ctx = await analyzeContext();
  const rows = await q("select id, title, summary, body from news_items where kind <> 'post' or origin_relato_id is null");
  for (const r of rows) {
    const lines = (await q<{ text: string }>('select text from transcript_lines where news_item_id = $1 order by t_sec', [r.id])).map((x) => ({ t: 0, text: x.text }));
    // Sem o texto completo (g1), mantém os bairros já detectados e só soma o que a análise achar agora.
    await analyzeNews(pool, r.id, { title: r.title, summary: r.summary, body: r.body, transcript: lines }, ctx, { keepDetected: true });
  }
  return { updated: rows.length };
}

export async function ingestNews(apiKey: string | undefined, body: IngestBody) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) throw new ForbiddenException('Ingestão desativada: defina INGEST_API_KEY no servidor.');
  if (apiKey !== expected) throw new ForbiddenException('Chave de ingestão inválida.');
  const [source] = await q('select * from sources where id = $1', [body?.sourceId]);
  if (!source) throw new BadRequestException('sourceId desconhecido. Cadastre a fonte no Admin primeiro.');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > MAX_ITEMS) throw new BadRequestException(`Envie de 1 a ${MAX_ITEMS} itens por lote.`);

  const actx = await analyzeContext();
  const bairros = actx.bairros;
  const report: { url: string; status: 'criado' | 'atualizado' | 'igual' | 'erro'; id?: string; bairroIds?: string[]; error?: string }[] = [];
  const recentNotify: { id: string; title: string; bairroIds: string[] }[] = [];

  const runId = await tx(async (c) => {
    const [run] = await q<{ id: string }>('insert into ingest_runs (source_id, received) values ($1,$2) returning id', [source.id, items.length], c);
    for (const item of items) {
      const url = String(item?.url ?? '').trim();
      const published = new Date(typeof item?.publishedAt === 'number' ? item.publishedAt : String(item?.publishedAt ?? ''));
      if (!/^https?:\/\//.test(url) || !String(item?.title ?? '').trim() || Number.isNaN(published.getTime())) {
        report.push({ url, status: 'erro', error: 'url, title e publishedAt são obrigatórios.' });
        continue;
      }
      const kind = item.kind === 'trecho' ? 'trecho' : 'materia';
      const topic = item.topic && item.topic in TOPIC_LABEL ? item.topic : classifyTopic(`${item.title} ${item.summary ?? ''} ${item.body ?? ''} ${(item.detectText ?? '').slice(0, 3000)}`);
      const h = hash(item);
      const [existing] = await q('select id, content_hash from news_items where url = $1', [url], c);
      if (existing && existing.content_hash === h && !body.force) { report.push({ url, status: 'igual', id: existing.id }); continue; }
      const values = [kind, source.id, item.title.trim(), String(item.summary ?? '').trim(), String(item.body ?? '').trim(), topic, item.authorName ?? null, published, url,
        item.externalId ?? null, h, item.imageUrl ?? null, item.durationSec ?? null, run.id, item.raw ? JSON.stringify(item.raw) : null];
      let id: string;
      if (existing) {
        id = existing.id;
        await q(`update news_items set kind=$1, source_id=$2, title=$3, summary=$4, body=$5, topic_id=$6, author_name=$7, published_at=$8, url=$9, external_id=$10,
          content_hash=$11, image_url=$12, duration_sec=$13, ingest_run_id=$14, raw=$15, updated_at=now() where id = $16`, [...values, id], c);
      } else {
        [{ id }] = await q<{ id: string }>(`insert into news_items (kind, source_id, title, summary, body, topic_id, author_name, published_at, url, external_id, content_hash, image_url, duration_sec, ingest_run_id, raw)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`, values, c);
      }
      if (item.transcript) {
        await q('delete from transcript_lines where news_item_id = $1', [id], c);
        for (const l of item.transcript) await q('insert into transcript_lines (news_item_id, t_sec, speaker, text) values ($1,$2,$3,$4)', [id, Math.max(0, Math.round(l.t)), l.speaker ?? '', l.text], c);
      }
      const bairroIds = await analyzeNews(c, id, item, actx);
      report.push({ url, status: existing ? 'atualizado' : 'criado', id, bairroIds });
      if (!existing && Date.now() - published.getTime() < 6 * 3600e3 && bairroIds.length) recentNotify.push({ id, title: item.title.trim(), bairroIds });
    }
    const count = (s: string) => report.filter((r) => r.status === s).length;
    await q('update ingest_runs set finished_at = now(), created = $2, updated = $3, skipped = $4 where id = $1', [run.id, count('criado'), count('atualizado'), count('igual') + count('erro')], c);

    // Avisa quem segue os bairros citados em notícias recentes.
    for (const n of recentNotify) {
      const names = bairros.filter((b) => n.bairroIds.includes(b.id)).map((b) => b.name).join(', ');
      await q(`insert into notifications (user_id, kind, title, body, href)
        select distinct f.user_id, 'redacao', $2, $3, $4 from user_follows f join users u on u.id = f.user_id where f.bairro_id = any($1) and u.deleted_at is null`,
      [n.bairroIds, `${names} foi pauta em ${source.name}`, n.title, `/materia/${n.id}`]);
    }
    return run.id;
  });
  emit();
  retrainSoon();
  return { runId, report };
}

function checkKey(apiKey: string | undefined) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) throw new ForbiddenException('Ingestão desativada: defina INGEST_API_KEY no servidor.');
  if (apiKey !== expected) throw new ForbiddenException('Chave de ingestão inválida.');
}

/** Quais destas URLs já estão no banco. O scraper usa para não baixar de novo o que já tem. */
export async function knownUrls(apiKey: string | undefined, urls: unknown) {
  checkKey(apiKey);
  const list = (Array.isArray(urls) ? urls : []).map(String).slice(0, 1000);
  const rows = await q<{ url: string }>('select url from news_items where url = any($1)', [list]);
  return { known: rows.map((r) => r.url) };
}

export async function ingestRuns() {
  return q('select r.*, s.name as source_name from ingest_runs r join sources s on s.id = r.source_id order by started_at desc limit 20');
}
