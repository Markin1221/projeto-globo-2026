// Calcula a triagem de todos os relatos em aberto para a equipe da redação.
import { canAudit, canModerate } from '../../../shared/domain/rules';
import type { Db, Triage, User } from '../../../shared/domain/types';
import { detectFor } from '../ingest';
import { getTriageModel, mlStats } from './models';
import { triage } from './triage';

export function withTriage(db: Db, viewer: User | null): Db {
  if (!viewer || !(canAudit(viewer) || canModerate(viewer) || viewer.role === 'admin')) return db;
  const hist = new Map<string, { falsos: number; confirmados: number }>();
  for (const r of db.relatos) {
    const h = hist.get(r.authorId) ?? { falsos: 0, confirmados: 0 };
    if (r.status === 'falso') h.falsos++;
    if (r.status === 'confirmado') h.confirmados++;
    hist.set(r.authorId, h);
  }
  const ctx = {
    bairros: db.bairros, relatos: db.relatos, articles: db.articles, segments: db.segments,
    authorHistory: (id: string) => hist.get(id) ?? { falsos: 0, confirmados: 0 },
    mentioned: (text: string) => [...detectFor(text, db.bairros.filter((b) => b.active)).keys()],
    model: getTriageModel(), decisions: mlStats().triage.decisions,
  };
  const out: Record<string, Triage> = {};
  for (const r of db.relatos) if (r.status === 'enviado' || r.status === 'apuracao') out[r.id] = triage(r, ctx);
  return { ...db, triage: out, ...(viewer.role === 'admin' ? { ml: mlStats() } : {}) };
}
