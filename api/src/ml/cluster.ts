// Agrupa relatos que falam do mesmo assunto: texto parecido, mesma categoria, mesmo bairro (ou vizinho) e perto no tempo.
import { distanceKm, TOPIC_LABEL } from '../../../shared/domain/rules';
import type { Bairro, Relato, RelatoGroup } from '../../../shared/domain/types';
import { tokens } from './text';

const WINDOW_MS = 72 * 3600e3;
// Mesmo bairro + mesma categoria já basta (0,45); bairros vizinhos ou categorias diferentes precisam de texto parecido.
const LINK = 0.45;

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
const cosine = (a: Map<string, number>, b: Map<string, number>) => { let s = 0; for (const [t, w] of a) s += w * (b.get(t) ?? 0); return s; };

export function clusterRelatos(relatos: Relato[], bairros: Bairro[]): RelatoGroup[] {
  const list = [...relatos].sort((a, b) => a.createdAt - b.createdAt);
  const vecs = tfidf(list.map((r) => tokens(`${r.title} ${r.description}`, false)));
  const pos = new Map(bairros.map((b) => [b.id, b]));
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(a.createdAt - b.createdAt) > WINDOW_MS) continue;
      const ba = pos.get(a.bairroId), bb = pos.get(b.bairroId);
      const near = a.bairroId === b.bairroId ? 1 : ba && bb && distanceKm(ba, bb) < 2 ? 0.5 : 0;
      if (!near) continue;
      const sim = 0.55 * cosine(vecs[i], vecs[j]) + 0.25 * (a.category === b.category ? 1 : 0) + 0.2 * near;
      if (sim >= LINK) parent[find(j)] = find(i);
    }
  }

  const groups = new Map<number, number[]>();
  list.forEach((_, i) => { const root = find(i); groups.set(root, [...(groups.get(root) ?? []), i]); });

  return [...groups.values()].filter((idx) => idx.length >= 2).map((idx) => {
    const members = idx.map((i) => list[i]);
    const cats = new Map<string, number>();
    for (const r of members) cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
    const category = [...cats].sort((a, b) => b[1] - a[1])[0][0] as RelatoGroup['category'];
    const bairroIds = [...new Set(members.map((r) => r.bairroId))];
    // Palavras que mais caracterizam o grupo.
    const weight = new Map<string, number>();
    for (const i of idx) for (const [t, w] of vecs[i]) weight.set(t, (weight.get(t) ?? 0) + w);
    const keywords = [...weight].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    const names = bairroIds.map((id) => pos.get(id)?.name ?? id);
    return {
      id: members[0].id,
      relatoIds: [...members].sort((a, b) => b.createdAt - a.createdAt).map((r) => r.id),
      category, bairroIds, keywords,
      title: `${TOPIC_LABEL[category]}: ${names.join(' e ')}`,
      firstAt: members[0].createdAt,
      lastAt: members[members.length - 1].createdAt,
      confirmations: members.reduce((n, r) => n + r.confirmations.length, 0),
    };
  }).sort((a, b) => b.lastAt - a.lastAt);
}
