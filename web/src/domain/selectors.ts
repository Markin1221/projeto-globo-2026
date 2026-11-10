// Consultas puras sobre o banco. No back, viram queries SQL/repositórios.
import type { Alert, Article, Bairro, ContentKey, Db, FeedEntry, Relato, Segment, Topic, User, Case, CaseItemKind } from './types';
import { normalize, TOPIC_LABEL } from './rules';

const DAY = 864e5;
export const isHidden = (db: Db, key: ContentKey) => db.hiddenContent.includes(key);
export const bairroById = (db: Db, id: string) => db.bairros.find((b) => b.id === id);
export const bairroName = (db: Db, id: string) => bairroById(db, id)?.name ?? 'Bairro';
export const programById = (db: Db, id: string) => db.programs.find((p) => p.id === id);
export const userById = (db: Db, id?: string) => db.users.find((u) => u.id === id);

export function officialFeed(db: Db, bairroIds?: string[]): FeedEntry[] {
  const inScope = (ids: string[]) => !bairroIds || ids.some((id) => bairroIds.includes(id));
  const segs: FeedEntry[] = db.segments.filter((s) => inScope(s.bairroIds) && !isHidden(db, `segment:${s.id}`))
    .map((item) => ({ kind: 'segment', at: item.airedAt, item }));
  // Sem filtro de bairro, mostra só o que é do Recife e da Região Metropolitana (ou sem local definido).
  const local = (a: Article) => !!bairroIds || (a.locationScope !== 'pe' && a.locationScope !== 'fora');
  const arts: FeedEntry[] = db.articles.filter((a) => inScope(a.bairroIds) && local(a) && !isHidden(db, `article:${a.id}`))
    .map((item) => ({ kind: 'article', at: item.publishedAt, item }));
  return [...segs, ...arts].sort((a, b) => b.at - a.at);
}

/** Listagens públicas: relato falso e relato oculto ficam acessíveis só pelo link. */
export function listedRelatos(db: Db, bairroIds?: string[]): Relato[] {
  return db.relatos.filter((r) => r.status !== 'falso' && !isHidden(db, `relato:${r.id}`) && (!bairroIds || bairroIds.includes(r.bairroId)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Fila do jornalista: mais confirmações primeiro; empate, o mais recente. */
export function journalistQueue(db: Db): Relato[] {
  return db.relatos.filter((r) => (r.status === 'enviado' || r.status === 'apuracao') && !isHidden(db, `relato:${r.id}`))
    .sort((a, b) => b.confirmations.length - a.confirmations.length || b.createdAt - a.createdAt);
}

export const activeAlerts = (db: Db, bairroIds?: string[]): Alert[] =>
  db.alerts.filter((a) => a.active && (!bairroIds || bairroIds.includes(a.bairroId))).sort((a, b) => b.createdAt - a.createdAt);

export const newsVolume = (db: Db, bairroId: string) =>
  db.segments.filter((s) => s.bairroIds.includes(bairroId)).length + db.articles.filter((a) => a.bairroIds.includes(bairroId)).length;

export function trendingBairros(db: Db, days = 14) {
  const since = Date.now() - days * DAY;
  return db.bairros.filter((b) => b.active).map((b) => {
    const news = officialFeed(db, [b.id]).filter((e) => e.at >= since).length;
    const reports = listedRelatos(db, [b.id]).filter((r) => r.createdAt >= since).length;
    return { bairro: b, news, reports, score: news * 2 + reports };
  }).filter((t) => t.score > 0).sort((a, b) => b.score - a.score);
}

export function trendingTopics(db: Db, days = 14) {
  const since = Date.now() - days * DAY;
  const tally = new Map<Topic, number>();
  for (const e of officialFeed(db)) if (e.at >= since) tally.set(e.item.topic, (tally.get(e.item.topic) ?? 0) + 1);
  return [...tally].map(([topic, count]) => ({ topic, label: TOPIC_LABEL[topic], count })).sort((a, b) => b.count - a.count);
}

const excerpt = (s: string) => s.replace(/\.$/, '');

/** Mock do "Resumo do dia por IA": no produto real, viria do serviço de sumarização. */
export function dailySummary(db: Db, bairroId: string): string[] {
  const name = bairroName(db, bairroId);
  const feed = officialFeed(db, [bairroId]);
  const seg = feed.find((e) => e.kind === 'segment');
  // No portal: entre as notícias dos últimos 3 dias, a mais útil para o dia a dia.
  const recentArts = feed.filter((e) => e.kind === 'article' && e.at > Date.now() - 3 * 864e5);
  const art = [...recentArts].sort((a, b) => (b.item.utility ?? 50) - (a.item.utility ?? 50))[0] ?? feed.find((e) => e.kind === 'article');
  const alert = activeAlerts(db, [bairroId])[0];
  return [
    seg ? `Na TV: ${excerpt(seg.item.title)}.` : `${name} não apareceu nos telejornais recentes.`,
    alert ? `Alerta prático: ${excerpt(alert.title)}. ${alert.detail}` : 'Nenhum alerta prático ativo para o bairro.',
    art ? `No portal: ${excerpt(art.item.title)}.` : 'Nenhuma matéria recente no portal.',
  ];
}

export function engagement(db: Db, bairroId: string) {
  const followers = db.users.filter((u) => u.followed.includes(bairroId)).length;
  const rel = db.relatos.filter((r) => r.bairroId === bairroId);
  const confirmations = rel.reduce((n, r) => n + r.confirmations.length, 0);
  const keys = new Set<string>([
    ...rel.map((r) => `relato:${r.id}`),
    ...db.segments.filter((s) => s.bairroIds.includes(bairroId)).map((s) => `segment:${s.id}`),
    ...db.articles.filter((a) => a.bairroIds.includes(bairroId)).map((a) => `article:${a.id}`),
  ]);
  const comments = db.comments.filter((c) => keys.has(c.target)).length;
  return { followers, confirmations, comments, total: followers * 3 + confirmations + comments * 2 };
}

export function newsroomMetrics(db: Db) {
  const coverage = db.bairros.filter((b) => b.active).map((b) => ({ bairro: b, volume: newsVolume(db, b.id), engagement: engagement(db, b.id) }))
    .sort((a, b) => b.volume - a.volume);
  const became = db.relatos.filter((r) => r.status === 'confirmado');
  const decided = db.relatos.filter((r) => r.status === 'confirmado' || r.status === 'falso').length;
  return {
    coverage,
    top: coverage.slice(0, 5),
    invisible: [...coverage].sort((a, b) => a.volume - b.volume).slice(0, 5),
    topics: trendingTopics(db, 60),
    became,
    decided,
    inQueue: journalistQueue(db).length,
    falseCount: db.relatos.filter((r) => r.status === 'falso').length,
    engagementRank: [...coverage].sort((a, b) => b.engagement.total - a.engagement.total).slice(0, 6),
  };
}

export interface SearchResults { bairros: Bairro[]; entries: FeedEntry[]; relatos: Relato[]; topics: Topic[] }

export function search(db: Db, query: string): SearchResults {
  const q = normalize(query);
  const has = (...f: string[]) => f.some((v) => normalize(v).includes(q));
  if (q.length < 2) return { bairros: [], entries: [], relatos: [], topics: [] };
  const matchesBairro = (ids: string[]) => ids.some((id) => has(bairroName(db, id)));
  return {
    bairros: db.bairros.filter((b) => b.active && has(b.name, ...b.aliases)),
    topics: (Object.keys(TOPIC_LABEL) as Topic[]).filter((t) => has(TOPIC_LABEL[t])),
    entries: officialFeed(db).filter((e) => has(e.item.title, TOPIC_LABEL[e.item.topic], e.kind === 'segment' ? e.item.summary : e.item.lead) || matchesBairro(e.item.bairroIds)),
    relatos: listedRelatos(db).filter((r) => has(r.title, r.description, TOPIC_LABEL[r.category], bairroName(db, r.bairroId))),
  };
}

export const commentsFor = (db: Db, key: ContentKey, viewer?: User) =>
  db.comments.filter((c) => c.target === key && (viewer?.role === 'moderador' || !isHidden(db, `comment:${c.id}`))).sort((a, b) => a.createdAt - b.createdAt);

export const commentCount = (db: Db, key: ContentKey) => db.comments.filter((c) => c.target === key && !isHidden(db, `comment:${c.id}`)).length;

export function resolveContent(db: Db, key: ContentKey): { title: string; href: string; authorId?: string } | null {
  const [type, id] = key.split(':');
  if (type === 'segment') { const s = db.segments.find((x) => x.id === id); return s ? { title: s.title, href: `/trecho/${id}` } : null; }
  if (type === 'article') { const a = db.articles.find((x) => x.id === id); return a ? { title: a.title, href: `/materia/${id}`, authorId: a.authorId } : null; }
  if (type === 'relato') { const r = db.relatos.find((x) => x.id === id); return r ? { title: r.title, href: `/relatos/${id}`, authorId: r.authorId } : null; }
  const c = db.comments.find((x) => x.id === id);
  if (!c) return null;
  const parent = resolveContent(db, c.target);
  return { title: `Comentário: “${c.text}”`, href: parent?.href ?? '/', authorId: c.authorId };
}

export function savedEntries(db: Db, user: User) {
  return user.saved.map((key) => ({ key, content: resolveContent(db, key) })).filter((s) => s.content && !isHidden(db, s.key));
}

export const entrySpeech = (e: FeedEntry, programName?: string) =>
  e.kind === 'segment' ? `${programName ?? 'Telejornal'}. ${(e.item as Segment).title}. ${(e.item as Segment).summary}` : `${(e.item as Article).title}. ${(e.item as Article).lead}`;

/** Caso (acompanhamento) do qual um item faz parte. */
export function caseOf(db: Db, kind: CaseItemKind, id: string): Case | undefined {
  return db.cases.find((c) => c.items.some((i) => i.kind === kind && i.id === id));
}
export const caseHref = (kind: CaseItemKind, id: string) => (kind === 'relato' ? `/relatos/${id}` : kind === 'segment' ? `/trecho/${id}` : `/materia/${id}`);
