// Casos: liga notícias, trechos e relatos sobre o mesmo problema e acompanha a etapa
// (problema -> em andamento -> resolvido). A ligação e a etapa automáticas são sugestões:
// a redação pode confirmar o caso, tirar itens e corrigir a etapa.
import type { Article, Bairro, Case, CaseItem, CaseItemKind, CaseStage, Relato, Segment, Topic } from '../../../shared/domain/types';
import { lower, tokens } from './text';

const DAY = 864e5;
const WINDOW = 60 * DAY;   // itens ligados automaticamente precisam estar a até 60 dias um do outro
const MIN_COS = 0.28;      // parecença mínima de texto
const MIN_COS_SAME = 0.12; // mesmo tema e perto no tempo: basta um pouco de texto em comum
const NEAR = 10 * DAY;
const LINK = 0.42;         // nota final mínima (texto + mesmo tema)

// Ordem importa: "não resolve" e "volta a ceder" vencem "resolv" e "obra".
const REOPEN = /\b(nao resolv\w*|nao foi resolvid\w*|volt\w* a (ceder|abrir|piorar|alagar|faltar|acumular|preocupar|aparecer|vazar|quebrar)|cresce\w*|piora\w*|de novo|novamente|reabriu|continua\w*|segue sem|ainda sem)\b/;
// Promessa ou previsão ("deve normalizar até sexta") ainda não é solução.
const PROMISE = /\b(promete\w*|previsao|prev(e|ista|isto)|deve(m|ra|rao)? (ser|voltar|normalizar|ficar|estar|terminar|concluir)|vai (ser|voltar|normalizar)|sera (feito|concluid\w*|normalizad\w*|liberad\w*)|ate (sexta|amanha|segunda|o fim))\b/;
// Falta de algo ("sem sinalização", "sem luz") é problema, mesmo com palavra de ação no meio.
const LACK = /\b(sem (sinaliz\w*|luz|energia|agua|onibus|coleta|iluminacao|atendimento|remedio\w*)|apagad[oa]s?|queimad[oa]s?|desligad[oa]s?)\b/;
const RESOLVED = /\b(consertad\w*|consertaram|ajeitad\w*|ajeitaram|arrumad\w*|arrumaram|resolvid\w*|resolveram|resolve o|conclu(i|iu|ida|ido|idas|idos|ido)\b|concluem|finaliz\w*|terminad\w*|terminaram|terminou|liberad\w*|reabert\w*|normaliz\w*|restabelec\w*|volt\w* a funcionar|voltou ao normal|volta ao normal|tapad\w*|taparam|entregue\w*|inaugur\w*|recuperad\w*|substituid\w*|trocad[oa]s?|religad\w*)\b/;
const PROGRESS = /\b(inici\w*|obras?|reparos?|conserto|consertando|ajeitando|arrumando|trabalhando|equipes?|manutencao|rodizio|mutirao|vistoria|avali\w*|interdit\w*|paliativ\w*|remendo|tapa.buraco|andamento|recape\w*|limpeza|coleta|anunci\w*|promete\w*|prev(e|ista|isto)|licitacao|cronograma|maquinas?|operacao|isol\w*|tapumes?|cercad\w*|cercou|sinaliz\w*)\b/;
const PROBLEM = /\b(abriu|abre|surgiu|surge|apareceu|aparece|cedeu|cede|rompeu|estour\w*|registram|reclam\w*|denunci\w*|pedem|cobra\w*|sem agua|falta|faltando|alagad\w*|alagamento|buracos?|cratera|acumulad\w*|transbord\w*|riscos?|preocup\w*|barrenta|vazamento|quebrad\w*|caid[oa]|desabou|rachadura|seca|irregular|sem (luz|energia|onibus|coleta))\b/;

function classify(s: string): CaseStage | null {
  const t = lower(s);
  if (REOPEN.test(t)) return 'problema';
  if (PROMISE.test(t)) return 'andamento';
  if (RESOLVED.test(t)) return 'resolvido';
  if (LACK.test(t)) return 'problema';
  if (PROGRESS.test(t)) return 'andamento';
  if (PROBLEM.test(t)) return 'problema';
  return null;
}

/** Etapa pelo texto: o título manda; se ele não diz nada, olha a linha fina/descrição. */
export function stageOf(title: string, lead = ''): CaseStage {
  return classify(title) ?? classify(lead) ?? 'problema';
}

interface Node {
  kind: CaseItemKind; id: string; at: number; title: string; text: string; topic: Topic;
  bairroIds: string[]; official: boolean; issue?: { key: string; label: string };
  stage: CaseStage; stageBy: 'texto' | 'redacao'; unlinked: boolean; linkTo?: string;
}

function tfidf(docs: string[][]) {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, n] of tf) { const w = n * Math.log(1 + N / (df.get(t) ?? 1)); v.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  });
}
const cosine = (a: Map<string, number>, b: Map<string, number>) => {
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let x = 0; for (const [t, w] of s) x += w * (l.get(t) ?? 0); return x;
};

// Palavras genéricas de notícia local que não dizem qual é o problema.
const GENERIC = new Set('moradores morador bairro rua ruas avenida prefeitura recife cidade regiao local trecho comunidade vizinhos vizinhanca pessoas'.split(' '));

let memo: { key: string; value: Case[] } | null = null;

export function buildCases(segments: Segment[], articles: Article[], relatos: Relato[], bairros: Bairro[]): Case[] {
  const nodes: Node[] = [
    ...segments.map((s): Node => ({ kind: 'segment', id: s.id, at: s.airedAt, title: s.title, text: `${s.title} ${s.summary}`, topic: s.topic, bairroIds: s.bairroIds, official: true, issue: s.issue, stage: s.caseStage ?? stageOf(s.title, s.summary), stageBy: s.caseStage ? 'redacao' : 'texto', unlinked: !!s.caseUnlinked })),
    ...articles.map((a): Node => ({ kind: 'article', id: a.id, at: a.publishedAt, title: a.title, text: `${a.title} ${a.lead}`, topic: a.topic, bairroIds: a.bairroIds, official: true, issue: a.issue, stage: a.caseStage ?? stageOf(a.title, a.lead), stageBy: a.caseStage ? 'redacao' : 'texto', unlinked: !!a.caseUnlinked })),
    ...relatos.filter((r) => r.status !== 'falso').map((r): Node => ({ kind: 'relato', id: r.id, at: r.createdAt, title: r.title, text: `${r.title} ${r.description}`, topic: r.category, bairroIds: [r.bairroId], official: false, issue: r.issue, stage: r.caseStage ?? stageOf(r.title, r.description), stageBy: r.caseStage ? 'redacao' : 'texto', unlinked: !!r.caseUnlinked, linkTo: r.officialArticleId })),
  ];
  const key = nodes.map((n) => `${n.id}${n.at}${n.stage}${n.stageBy}${n.issue?.key ?? ''}${n.unlinked ? 1 : 0}${n.bairroIds.join()}`).join('|');
  if (memo?.key === key) return memo.value;

  // Nome de bairro não ajuda a separar assuntos (todas as notícias de Casa Amarela dizem "Casa Amarela").
  const placeWords = new Set(bairros.flatMap((b) => lower(b.name).match(/[a-z0-9]{3,}/g) ?? []));
  const vecs = tfidf(nodes.map((n) => tokens(n.text, false).filter((t) => !placeWords.has(t) && !GENERIC.has(t))));

  const parent = nodes.map((_, i) => i);
  const issueOf = nodes.map((n) => n.issue?.key ?? null);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => {
    const a = find(i), b = find(j);
    if (a === b) return;
    if (issueOf[a] && issueOf[b] && issueOf[a] !== issueOf[b]) return; // dois casos confirmados diferentes nunca se juntam
    parent[b] = a;
    issueOf[a] = issueOf[a] ?? issueOf[b];
  };

  // 1) Ligações feitas pela redação.
  const byIssue = new Map<string, number>();
  const byId = new Map(nodes.map((n, i) => [`${n.kind}:${n.id}`, i]));
  nodes.forEach((n, i) => { if (n.issue) { const f = byIssue.get(n.issue.key); if (f === undefined) byIssue.set(n.issue.key, i); else union(f, i); } });
  // 2) Relato que virou matéria.
  nodes.forEach((n, i) => { if (n.linkTo) { const j = byId.get(`article:${n.linkTo}`); if (j !== undefined) union(j, i); } });
  // 3) Automático: mesmo bairro, perto no tempo, texto parecido.
  const byBairro = new Map<string, number[]>();
  nodes.forEach((n, i) => { if (!n.unlinked && !n.issue) for (const b of n.bairroIds) byBairro.set(b, [...(byBairro.get(b) ?? []), i]); });
  // Itens já confirmados num caso também servem de âncora para novos itens parecidos.
  nodes.forEach((n, i) => { if (n.issue) for (const b of n.bairroIds) byBairro.set(b, [...(byBairro.get(b) ?? []), i]); });
  for (const list of byBairro.values()) {
    const idx = [...new Set(list)].sort((a, b) => nodes[a].at - nodes[b].at);
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const i = idx[x], j = idx[y];
        if (nodes[j].at - nodes[i].at > WINDOW) break;
        if (nodes[i].issue && nodes[j].issue) continue;
        const cos = cosine(vecs[i], vecs[j]);
        const same = nodes[i].topic === nodes[j].topic;
        const near = nodes[j].at - nodes[i].at <= NEAR;
        if (cos < (same && near ? MIN_COS_SAME : MIN_COS)) continue;
        if (0.7 * cos + 0.3 * (same ? 1 : 0) + (same && near ? 0.08 : 0) >= LINK) union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  nodes.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });

  const cases: Case[] = [];
  for (const [root, idx] of groups) {
    if (idx.length < 2) continue;
    const members = idx.map((i) => nodes[i]).sort((a, b) => a.at - b.at);
    const official = members.filter((m) => m.official);
    const issueKey = issueOf[root];
    if (!official.length && !issueKey) continue; // só relatos: isso já aparece em "relatos por assunto"
    // Relato + a matéria que o confirmou, sem mudança de etapa, não é acompanhamento.
    if (!issueKey && members.length < 3 && new Set(members.map((m) => m.stage)).size < 2) continue;
    const items: CaseItem[] = members.map((m) => ({ kind: m.kind, id: m.id, at: m.at, title: m.title, stage: m.stage, stageBy: m.stageBy, official: m.official }));

    const ref = official.length ? official : members;
    const stage = ref[ref.length - 1].stage;
    const reached: Case['reached'] = {};
    let reopened = false, best = 0;
    const rank = { problema: 0, andamento: 1, resolvido: 2 } as const;
    for (const m of ref) {
      if (reached[m.stage] === undefined) reached[m.stage] = m.at;
      if (rank[m.stage] < best) reopened = true;
      best = Math.max(best, rank[m.stage]);
    }
    if (reached.problema === undefined) reached.problema = members[0].at;
    const lastOfficial = official.length ? official[official.length - 1].at : 0;
    const newer = members.filter((m) => !m.official && m.at > lastOfficial);
    const topics = new Map<Topic, number>();
    for (const m of members) topics.set(m.topic, (topics.get(m.topic) ?? 0) + 1);
    const label = issueKey ? members.find((m) => m.issue?.key === issueKey)?.issue?.label : undefined;
    cases.push({
      id: issueKey ?? `auto-${members[0].id}`,
      title: label ?? (official[0] ?? members[0]).title,
      confirmed: !!issueKey,
      bairroIds: [...new Set(members.flatMap((m) => m.bairroIds))],
      topic: [...topics].sort((a, b) => b[1] - a[1])[0][0],
      items, stage, reopened: reopened && stage === 'problema',
      newerInformal: official.length && newer.length ? { count: newer.length, stage: newer[newer.length - 1].stage } : null,
      reached, firstAt: members[0].at, lastAt: members[members.length - 1].at,
    });
  }
  cases.sort((a, b) => b.lastAt - a.lastAt);
  memo = { key, value: cases };
  return cases;
}
