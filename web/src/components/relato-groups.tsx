'use client';
// Grupos de relatos do mesmo assunto e o resumo "o que tem neste bloco".
import { useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, ChevronDown, ChevronUp, Layers, Sparkles } from 'lucide-react';
import { canEditCases, INFORMAL_SEAL, SPEECH_PREFIX } from '@/domain/rules';
import { bairroName } from '@/domain/selectors';
import type { RelatoGroup, RelatoSummary } from '@/domain/types';
import { api, useDb, useMe } from '@/store';
import { ListenButton, RelatoCard } from './cards';
import { TriageChips } from './triage';
import { Button, EmptyState, InformalSeal, agoText } from './ui';

const UTIL_LABEL = { alta: 'Útil', media: 'Média', baixa: 'Pouco útil' } as const;
const SUMMARY_PREFIX = 'Atenção: resumo de relatos de moradores, ainda não verificados e que podem ser falsos.';

/** Botão + cartão de resumo. groupId: resume um grupo. Sem groupId: resumo geral (opcionalmente de alguns bairros). */
export function SummaryCard({ groupId, bairroIds, label, compact, noNote }: { groupId?: string; bairroIds?: string[]; label: string; compact?: boolean; noNote?: boolean }) {
  const db = useDb();
  const staff = canEditCases(useMe());
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [data, setData] = useState<RelatoSummary | null>(null);
  const run = async () => {
    setState('loading'); setError('');
    try { setData(await api.summarize({ groupId, bairroIds })); setState('idle'); }
    catch (e) { setError((e as Error).message); setState('error'); }
  };
  const titleOf = (id: string) => db.relatos.find((r) => r.id === id)?.title;
  if (!data) {
    return (
      <div className={`sum-cta ${compact ? 'sum-cta-compact' : ''}`}>
        <Button variant={compact ? 'outline' : 'primary'} busy={state === 'loading'} onClick={run}>
          <Sparkles size={16} aria-hidden />{state === 'loading' ? 'Resumindo' : label}
        </Button>
        {!compact && !noNote && <small className="muted">{staff ? 'Versão da redação: todos os relatos, com a utilidade de cada um.' : 'Um resumo curto do que os vizinhos estão dizendo.'} {db.meta.ai ? 'Feito por IA.' : 'Automático.'} Os relatos não foram verificados.</small>}
        {state === 'error' && <small className="err" role="alert">{error}</small>}
      </div>
    );
  }
  const speech = [SUMMARY_PREFIX, data.title + '.', data.summary, ...data.points, ...(data.items ?? []).map((i) => `${i.text}. Utilidade ${i.util}.`), ...(data.checks ?? []), ...data.urgent.map((u) => `Pode ser urgente: ${u.text}. ${u.reason}`), data.advice ?? ''].join(' ');
  return (
    <section className="sum-card" aria-label={`Resumo: ${data.title}`}>
      <div className="sum-head">
        <span className="sum-badge"><Sparkles size={14} aria-hidden />{data.engine === 'ia' ? 'Resumo com IA' : 'Resumo automático'}</span>
        <InformalSeal />
      </div>
      <h3>{data.title}</h3>
      <p>{data.summary}</p>
      {data.points.length > 0 && <ul className="sum-points">{data.points.map((p) => <li key={p}>{p}</li>)}</ul>}
      {data.urgent.length > 0 && (
        <div className="sum-urgent" role="note">
          <h4><AlertOctagon size={17} aria-hidden />Pode ser urgente</h4>
          <ul>{data.urgent.map((u) => (
            <li key={u.text}><strong>{u.text}</strong> {u.reason}
              {u.relatoIds.length > 0 && <span className="sum-links"> {u.relatoIds.map((id) => <Link key={id} href={`/relatos/${id}`}>{titleOf(id) ?? 'ver relato'}</Link>)}</span>}
            </li>
          ))}</ul>
        </div>
      )}
      {data.items && data.items.length > 0 && (
        <div className="sum-items">
          <h4>Relato por relato <small className="muted">(utilidade para a apuração, não é verdade)</small></h4>
          <ul>{data.items.map((it) => (
            <li key={it.relatoId}>
              <span className={`tri util-${it.util}`}>{UTIL_LABEL[it.util]}</span>
              <span><Link href={`/relatos/${it.relatoId}`}>{it.text}</Link> <small className="muted">{it.why}</small></span>
            </li>
          ))}</ul>
        </div>
      )}
      {data.checks && data.checks.length > 0 && (
        <div className="sum-checks"><h4>O que checar antes de publicar</h4><ul>{data.checks.map((c) => <li key={c}>{c}</li>)}</ul></div>
      )}
      {data.advice && <p className="sum-advice">{data.advice}</p>}
      <p className="sum-foot">Baseado em {data.relatoCount} {data.relatoCount === 1 ? 'relato' : 'relatos'} de moradores, {INFORMAL_SEAL.toLowerCase()}. {data.engine === 'ia' ? 'Texto gerado por IA: pode conter erros.' : ''} {data.note ?? ''}</p>
      <div className="row between">
        <ListenButton id={`summary:${groupId ?? (bairroIds ?? []).join(',')}`} text={speech} label="Ouvir resumo" />
        <Button variant="ghost" onClick={() => setData(null)}>Fechar resumo</Button>
      </div>
    </section>
  );
}

function GroupCard({ g, staff }: { g: RelatoGroup; staff?: boolean }) {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const relatos = g.relatoIds.map((id) => db.relatos.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <li className="group-card">
      <div className="group-top">
        <span className="group-icon" aria-hidden><Layers size={20} /></span>
        <div className="group-main">
          <h3>{g.title}</h3>
          <p className="muted">{g.relatoIds.length} relatos, {g.confirmations} confirmações de vizinhos, último {agoText(g.lastAt)}</p>
          {g.keywords.length > 0 && <p className="group-kw">{g.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</p>}
        </div>
      </div>
      <SummaryCard groupId={g.id} label="Resumir este grupo" compact />
      <button type="button" className="group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}{open ? 'Esconder os relatos' : `Ver os ${relatos.length} relatos`}
      </button>
      {open && (staff
        ? <ul className="group-staff">{relatos.map((r) => <li key={r.id}><Link href={`/relatos/${r.id}`}>{r.title}</Link><small className="muted">{bairroName(db, r.bairroId)}, {r.confirmations.length} confirmações</small><TriageChips t={db.triage?.[r.id]} /></li>)}</ul>
        : <div className="group-relatos">{relatos.map((r) => <RelatoCard key={r.id} relato={r} />)}</div>)}
    </li>
  );
}

/** Lista de grupos. Relatos sem par aparecem em "Outros relatos". */
export function RelatoGroups({ bairroIds, staff }: { bairroIds?: string[]; staff?: boolean }) {
  const db = useDb();
  const groups = db.relatoGroups.filter((g) => !bairroIds || g.bairroIds.some((b) => bairroIds.includes(b)));
  const grouped = new Set(groups.flatMap((g) => g.relatoIds));
  const loose = db.relatos.filter((r) => r.status !== 'falso' && !grouped.has(r.id) && (!bairroIds || bairroIds.includes(r.bairroId)) && !db.relatoGroups.some((g) => g.relatoIds.includes(r.id)));
  return (
    <div className="groups">
      {groups.length ? <ul className="group-list">{groups.map((g) => <GroupCard key={g.id} g={g} staff={staff} />)}</ul>
        : <EmptyState title="Nenhum assunto com mais de um relato" text="Quando vizinhos relatarem a mesma coisa, os relatos aparecem juntos aqui." />}
      {loose.length > 0 && (
        <details className="loose">
          <summary>Outros relatos, sem assunto em comum ({loose.length})</summary>
          {staff
            ? <ul className="group-staff">{loose.map((r) => <li key={r.id}><Link href={`/relatos/${r.id}`}>{r.title}</Link><small className="muted">{bairroName(db, r.bairroId)}</small><TriageChips t={db.triage?.[r.id]} /></li>)}</ul>
            : <div className="group-relatos">{loose.slice(0, 20).map((r) => <RelatoCard key={r.id} relato={r} />)}</div>}
        </details>
      )}
    </div>
  );
}

export { SPEECH_PREFIX };
