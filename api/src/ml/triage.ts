// Triagem de relatos para a redação. É APOIO À DECISÃO: mostra sinais e uma prioridade sugerida.
// Nunca muda o status de um relato e nunca aparece para o público: quem decide é o jornalista (regra do produto).
import { classifyTopic, distanceKm, TOPIC_LABEL } from '../../../shared/domain/rules';
import type { Article, Bairro, Relato, Segment, Topic, Triage, TriageSignal as Signal } from '../../../shared/domain/types';
import { NaiveBayes } from './bayes';
import { jaccard, lower } from './text';

type Level = Triage['riskLevel'];
export type { Triage };

const HEARSAY = /me disseram|estao dizendo|dizem que|ouvi dizer|falaram que|vi (no|num|em um|em uma) grupo|grupo d[oa] (zap|whats|rua|bairro)|mensagem encaminhad|foi encaminhad|audio que (circula|ta circulando)|esta circulando|ta circulando|corrente|compartilh(em|e) (antes|com todos)|repassando|nao sei se e verdade/;
const ALARM = /urgente|alerta maximo|socorro|absurdo|ninguem (faz|fala|ta falando)|a midia (esconde|nao mostra)|o governo esconde/;
const EXAGGERATION = /(dezenas|centenas|milhares) de (mortos|pessoas|feridos|casos|assaltos|roubos|tiros|vitimas)|todo mundo|todos os moradores|nunca (vi|aconteceu)/;
const SPAM = /https?:\/\/|www\.|compre|promoc|desconto|clique|siga (o|a|@)|seguidores|ganhe|pix\b|sorteio|\(?\d{2}\)?\s?9?\d{4}-?\d{4}/;
const VAGUE = /^(ta|esta|tudo|aqui) (tudo )?(ruim|pessimo|horrivel|abandonado)|^(isso|aqui) e um absurdo/;
const URGENT_TOPICS: Topic[] = ['alagamento', 'seguranca', 'agua', 'saude'];

export interface TriageContext {
  bairros: Bairro[];
  relatos: Relato[];
  articles: Article[];
  segments: Segment[];
  authorHistory: (authorId: string) => { falsos: number; confirmados: number };
  /** Bairros citados no texto do relato (mesma detecção da ingestão). */
  mentioned: (text: string) => string[];
  model: NaiveBayes | null;
  decisions: number;
}

const level = (v: number, lo: number, hi: number): Level => (v >= hi ? 'alto' : v >= lo ? 'medio' : 'baixo');

export function triage(r: Relato, ctx: TriageContext): Triage {
  const text = `${r.title}. ${r.description}`;
  const t = lower(text);
  const signals: Signal[] = [];
  const add = (kind: Signal['kind'], weight: number, txt: string, link?: string) => signals.push({ kind, weight, text: txt, link });
  const bairro = ctx.bairros.find((b) => b.id === r.bairroId);

  // --- Risco de não se confirmar --------------------------------------------------------------
  if (HEARSAY.test(t)) add('risco', 25, 'Relato de segunda mão ("me disseram", "vi no grupo", mensagem encaminhada).');
  if (ALARM.test(t) || /!{3,}/.test(text)) add('risco', 10, 'Tom alarmista.');
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length > 20 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.5) add('risco', 8, 'Texto quase todo em maiúsculas.');
  if (EXAGGERATION.test(t)) add('risco', 10, 'Números ou generalizações difíceis de checar.');
  if (SPAM.test(t)) add('risco', 20, 'Parece propaganda ou contém link/telefone.');
  if (r.pin && bairro && distanceKm(r.pin, bairro) > 3) add('risco', 10, `Ponto no mapa a ${distanceKm(r.pin, bairro).toFixed(1)} km do centro de ${bairro.name}.`);
  const others = ctx.mentioned(text).filter((id) => id !== r.bairroId);
  if (others.length && bairro) {
    const names = others.map((id) => ctx.bairros.find((b) => b.id === id)?.name).filter(Boolean).join(', ');
    add('risco', 8, `O texto cita ${names}, mas o relato foi marcado em ${bairro.name}.`);
  }
  if (r.createdAt - r.occurredAt > 7 * 864e5) add('utilidade', -10, 'O fato aconteceu há mais de uma semana.');

  const hist = ctx.authorHistory(r.authorId);
  if (hist.falsos) add('risco', Math.min(30, 15 * hist.falsos), `O autor já teve ${hist.falsos} relato${hist.falsos > 1 ? 's' : ''} marcado${hist.falsos > 1 ? 's' : ''} como falso.`);
  if (hist.confirmados) add('confianca', -Math.min(20, 10 * hist.confirmados), `O autor tem ${hist.confirmados} relato${hist.confirmados > 1 ? 's' : ''} confirmado${hist.confirmados > 1 ? 's' : ''} pela redação.`);
  if (r.media) add('confianca', -5, `Tem anexo (${r.media.type}).`);

  // Corroboração: notícia oficial recente ou outros moradores relatando o mesmo.
  const since = r.createdAt - 3 * 864e5;
  const official = [...ctx.articles.map((a) => ({ id: a.id, at: a.publishedAt, topic: a.topic, bairroIds: a.bairroIds, title: a.title, path: 'materia' })),
    ...ctx.segments.map((s) => ({ id: s.id, at: s.airedAt, topic: s.topic, bairroIds: s.bairroIds, title: s.title, path: 'trecho' }))]
    .filter((x) => x.at >= since && x.at <= r.createdAt + 864e5 && x.bairroIds.includes(r.bairroId) && x.topic === r.category && x.id !== r.officialArticleId)
    .sort((a, b) => b.at - a.at)[0];
  if (official) add('confianca', -15, `Há notícia oficial recente sobre ${TOPIC_LABEL[r.category].toLowerCase()} no bairro: "${official.title}".`, `/${official.path}/${official.id}`);

  const peers = ctx.relatos.filter((x) => x.id !== r.id && x.bairroId === r.bairroId && x.status !== 'falso' && Math.abs(x.createdAt - r.createdAt) < 7 * 864e5);
  let duplicateOf: string | undefined;
  for (const p of peers) {
    const sim = jaccard(text, `${p.title}. ${p.description}`);
    if (sim >= 0.45 && p.createdAt < r.createdAt) { duplicateOf = p.id; add('utilidade', -15, `Parece repetir o relato "${p.title}". Vale juntar as apurações.`, `/relatos/${p.id}`); break; }
  }
  const similar = peers.filter((p) => p.authorId !== r.authorId && p.category === r.category && p.id !== duplicateOf && Math.abs(p.createdAt - r.createdAt) < 2 * 864e5);
  if (similar.length) add('confianca', -8, `${similar.length} outro${similar.length > 1 ? 's' : ''} morador${similar.length > 1 ? 'es' : ''} relatou algo parecido no bairro.`);

  // --- Utilidade ------------------------------------------------------------------------------
  let utility = 60;
  if (r.description.trim().length < 50) { utility -= 20; add('utilidade', -20, 'Descrição curta: faltam detalhes para apurar.'); }
  if (VAGUE.test(t)) { utility -= 20; add('utilidade', -20, 'Reclamação genérica, sem fato concreto.'); }
  if (/^(rua|perto|aqui|la)$/i.test(r.reference.trim()) || r.reference.trim().length < 4) { utility -= 10; add('utilidade', -10, 'Ponto de referência vago.'); }
  const guessed = classifyTopic(text);
  if (guessed !== 'geral' && guessed !== r.category) add('utilidade', 0, `Categoria pode estar errada: o texto parece ser sobre ${TOPIC_LABEL[guessed].toLowerCase()}.`);
  if (SPAM.test(t)) utility -= 30;
  if (duplicateOf) utility -= 15;

  // --- Modelo aprendido com as decisões da redação --------------------------------------------
  let model: Triage['model'];
  if (ctx.model && ctx.model.docsOf('falso') >= 3 && ctx.model.docsOf('confirmado') >= 3) {
    const pFalse = ctx.model.predict(text).find((x) => x.label === 'falso')?.p ?? 0.5;
    model = { pFalse: Math.round(pFalse * 100) / 100, decisions: ctx.decisions };
    // Com poucas decisões o modelo pesa menos (de 40% até 100% a partir de 30 decisões).
    const w = Math.round((pFalse - 0.5) * 30 * Math.min(1, 0.4 + ctx.decisions / 50));
    if (Math.abs(w) >= 5) {
      const words = ctx.model.explain(text, pFalse > 0.5 ? 'falso' : 'confirmado').map((x) => x.replace('_', ' '));
      add(w > 0 ? 'risco' : 'confianca', w, `Parecido com relatos que a redação ${w > 0 ? 'marcou como falsos' : 'confirmou'}${words.length ? ` (palavras: ${words.join(', ')})` : ''}.`);
    }
  }

  const risk = Math.max(0, Math.min(100, 30 + signals.filter((s) => s.kind === 'risco' || s.kind === 'confianca').reduce((a, s) => a + s.weight, 0)));

  // --- Prioridade de apuração: urgência, alcance e recência. Risco alto também pede checagem rápida.
  const ageH = (Date.now() - r.createdAt) / 36e5;
  let priority = 20 + Math.min(40, r.confirmations.length * 5) + (URGENT_TOPICS.includes(r.category) ? 15 : 0) + (ageH < 6 ? 15 : ageH < 24 ? 8 : 0);
  if (risk >= 60 && r.confirmations.length >= 3) { priority += 10; add('prioridade', 10, 'Boato com engajamento: vale checar logo para evitar que se espalhe.'); }
  if (duplicateOf) priority -= 15;
  priority = Math.max(0, Math.min(100, Math.round(priority + (utility - 60) / 4)));

  return { risk, riskLevel: level(risk, 35, 60), utility: level(Math.max(0, utility), 35, 55), priority, signals, duplicateOf, model };
}
