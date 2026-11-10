// Treina e guarda em memória os modelos. Retreina ao iniciar, depois de cada ingestão e de cada decisão da redação.
import type { MlStats } from '../../../shared/domain/types';
import { q } from '../db';
import { NaiveBayes, holdoutAccuracy } from './bayes';
import { escapeRe, strip } from './text';

export type { MlStats };

let locationModel: NaiveBayes | null = null;
let triageModel: NaiveBayes | null = null;
let stats: MlStats = {
  location: { docs: 0, bairros: 0, accuracy: null, tested: 0, trainedAt: 0 },
  triage: { decisions: 0, falsos: 0, confirmados: 0, accuracy: null, trainedAt: 0 },
};

export const getLocationModel = () => locationModel;
export const getTriageModel = () => triageModel;
export const mlStats = () => stats;

/**
 * Modelo de bairro: aprende com notícias já localizadas por nome de bairro ou por jornalista.
 * Os nomes dos bairros são apagados do texto de treino para o modelo aprender o contexto
 * (ruas, lugares, instituições) e servir justamente quando o nome não aparece.
 */
export async function trainLocation() {
  const rows = await q<{ text: string; bairro_id: string }>(`
    select n.title || '. ' || n.summary || ' ' || left(n.body, 3000) as text, nb.bairro_id
    from news_item_bairros nb join news_items n on n.id = nb.news_item_id
    where nb.method in ('detectado', 'manual')`);
  const names = await q<{ name: string }>('select name from bairros union select alias from bairro_aliases');
  const mask = names.length ? new RegExp(`(?<![\\p{L}])(${names.map((n) => escapeRe(strip(n.name))).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}])`, 'giu') : null;
  const samples = rows.map((r) => ({ text: mask ? strip(r.text).replace(mask, ' ') : r.text, label: r.bairro_id }));
  const nb = new NaiveBayes();
  for (const s of samples) nb.add(s.text, s.label);
  const ev = holdoutAccuracy(samples, 3);
  locationModel = samples.length >= 20 ? nb : null;
  stats = { ...stats, location: { docs: samples.length, bairros: nb.labels.length, accuracy: ev ? Math.round(ev.accuracy * 100) / 100 : null, tested: ev?.tested ?? 0, trainedAt: Date.now() } };
}

/** Modelo de triagem: aprende com os relatos que a redação já confirmou ou marcou como falsos. */
export async function trainTriage() {
  const rows = await q<{ text: string; status: string }>("select title || '. ' || description as text, status from relatos where status in ('confirmado', 'falso')");
  const nb = new NaiveBayes();
  for (const r of rows) nb.add(r.text, r.status);
  const ev = holdoutAccuracy(rows.map((r) => ({ text: r.text, label: r.status })), 3);
  triageModel = nb;
  stats = { ...stats, triage: { decisions: rows.length, falsos: nb.docsOf('falso'), confirmados: nb.docsOf('confirmado'), accuracy: ev ? Math.round(ev.accuracy * 100) / 100 : null, trainedAt: Date.now() } };
}

let pending: NodeJS.Timeout | null = null;
/** Retreina em segundo plano, agrupando chamadas próximas. */
export function retrainSoon() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    Promise.all([trainLocation(), trainTriage()]).catch((e) => console.error('treino dos modelos:', e));
  }, 1500);
}

export async function trainAll() { await Promise.all([trainLocation(), trainTriage()]); }
