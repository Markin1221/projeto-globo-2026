'use client';
// Acompanhamento de casos: progresso (problema -> em andamento -> resolvido) e linha do tempo.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, CircleDot, Hammer, Route, RotateCcw } from 'lucide-react';
import { canEditCases, TOPIC_LABEL } from '@/domain/rules';
import { bairroName, caseHref, caseOf } from '@/domain/selectors';
import type { Case, CaseItem, CaseItemKind, CaseStage } from '@/domain/types';
import { act, api, useDb, useMe } from '@/store';
import { Button, agoText } from './ui';

export const STAGE_LABEL: Record<CaseStage, string> = { problema: 'Problema relatado', andamento: 'Em andamento', resolvido: 'Resolvido' };
const STAGE_SHORT: Record<CaseStage, string> = { problema: 'Problema', andamento: 'Em andamento', resolvido: 'Resolvido' };
const ORDER: CaseStage[] = ['problema', 'andamento', 'resolvido'];
const ICON = { problema: AlertTriangle, andamento: Hammer, resolvido: CheckCircle2 };
const day = (ts: number) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Texto do estado atual, para leitores de tela e para o "Ouvir". */
export function caseStatusText(c: Case) {
  if (c.reopened) return 'Voltou a ser problema depois de uma solução.';
  return `${STAGE_LABEL[c.stage]}, segundo as fontes oficiais.`;
}

export function CaseStepper({ c, compact }: { c: Case; compact?: boolean }) {
  const cur = ORDER.indexOf(c.stage);
  return (
    <div className={`case-steps cur-${c.stage} ${compact ? 'case-steps-compact' : ''} ${c.reopened ? 'is-reopened' : ''}`}>
      <ol aria-label={`Progresso do caso: ${caseStatusText(c)}`}>
        {ORDER.map((s, i) => {
          const I = ICON[s];
          const state = i < cur ? 'done' : i === cur ? 'now' : 'todo';
          const at = c.reached[s];
          return (
            <li key={s} className={`case-step st-${s} is-${state}`} aria-current={i === cur ? 'step' : undefined}>
              <span className="case-dot" aria-hidden><I size={compact ? 13 : 16} /></span>
              <span className="case-step-label">{STAGE_SHORT[s]}</span>
              {!compact && <small>{at !== undefined && (state !== 'todo' || c.reopened) ? day(at) : state === 'todo' ? 'ainda não' : ''}</small>}
            </li>
          );
        })}
      </ol>
      {c.reopened && <p className="case-reopened"><RotateCcw size={14} aria-hidden />Voltou a ser problema depois de {c.reached.resolvido !== undefined ? 'ser resolvido' : 'começar a ser resolvido'}</p>}
    </div>
  );
}

function ItemRow({ it, staff }: { it: CaseItem; staff: boolean }) {
  const I = ICON[it.stage];
  const origin = it.kind === 'relato' ? 'Relato de morador, não verificado' : it.kind === 'segment' ? 'Telejornal' : 'Notícia';
  const setStage = (v: string) => act(() => api.setCaseStage(it.kind, it.id, v === 'auto' ? null : (v as CaseStage)), 'Etapa atualizada.');
  return (
    <li className={`case-item st-${it.stage} ${it.official ? '' : 'is-informal'}`}>
      <span className="case-dot" aria-hidden><I size={14} /></span>
      <div className="case-item-body">
        <p className="case-item-meta"><time dateTime={new Date(it.at).toISOString()}>{day(it.at)}</time><span className={`case-tag st-${it.stage}`}>{STAGE_SHORT[it.stage]}</span><span className={it.official ? 'muted' : 'case-informal'}>{origin}</span></p>
        <Link href={caseHref(it.kind, it.id)}>{it.title}</Link>
        {it.stageBy === 'redacao' && <small className="muted">Etapa definida pela redação</small>}
        {staff && (
          <div className="case-item-tools">
            <label>Etapa{' '}
              <select value={it.stageBy === 'redacao' ? it.stage : 'auto'} onChange={(e) => setStage(e.target.value)}>
                <option value="auto">Automática ({STAGE_SHORT[it.stage]})</option>
                {ORDER.map((s) => <option key={s} value={s}>{STAGE_SHORT[s]}</option>)}
              </select>
            </label>
            <button type="button" className="link-btn" onClick={() => act(() => api.setCaseLink(it.kind, it.id, null), 'Item retirado do caso.')}>Tirar do caso</button>
          </div>
        )}
      </div>
    </li>
  );
}

export function CaseTimeline({ c }: { c: Case }) {
  const me = useMe();
  const staff = canEditCases(me);
  const lastOfficial = [...c.items].reverse().find((i) => i.official);
  return (
    <div className="case-timeline">
      {c.newerInformal && (
        <p className="case-newer" role="note">
          <AlertTriangle size={15} aria-hidden />
          Depois da última notícia oficial{lastOfficial ? ` (${day(lastOfficial.at)})` : ''}, {c.newerInformal.count === 1 ? 'um morador relatou' : `${c.newerInformal.count} moradores relataram`}: {STAGE_SHORT[c.newerInformal.stage].toLowerCase()}. Ainda não verificado pela redação.
        </p>
      )}
      <ol className="case-items">{c.items.map((it) => <ItemRow key={`${it.kind}:${it.id}`} it={it} staff={staff} />)}</ol>
    </div>
  );
}

export function CaseCard({ c }: { c: Case }) {
  const db = useDb();
  const informal = c.items.filter((i) => !i.official).length;
  return (
    <li className="case-card">
      <Link href={`/casos/${c.id}`} className="case-card-link">
        <h3>{c.title}</h3>
        <p className="muted">{c.bairroIds.map((b) => bairroName(db, b)).join(', ')}, {TOPIC_LABEL[c.topic]}. {c.items.length - informal} {c.items.length - informal === 1 ? 'notícia' : 'notícias'}{informal ? ` e ${informal} ${informal === 1 ? 'relato' : 'relatos'}` : ''}, atualizado {agoText(c.lastAt)}{c.confirmed ? '' : '. Ligação automática'}</p>
      </Link>
      <CaseStepper c={c} compact />
    </li>
  );
}

/** Caixa nas páginas de matéria, trecho e relato: mostra o caso, ou deixa a redação ligar a um. */
export function CaseInline({ kind, id, bairroIds }: { kind: CaseItemKind; id: string; bairroIds: string[] }) {
  const db = useDb();
  const me = useMe();
  const c = caseOf(db, kind, id);
  const [pick, setPick] = useState('');
  if (c) {
    return (
      <section className="case-inline" aria-label="Acompanhamento do caso">
        <p className="case-inline-head"><Route size={16} aria-hidden />Este assunto tem acompanhamento</p>
        <strong>{c.title}</strong>
        <CaseStepper c={c} compact />
        <Link className="origin-link" href={`/casos/${c.id}`}>Ver a linha do tempo ({c.items.length} {c.items.length === 1 ? 'item' : 'itens'})</Link>
      </section>
    );
  }
  if (!canEditCases(me)) return null;
  const options = db.cases.filter((x) => x.bairroIds.some((b) => bairroIds.includes(b)));
  if (!options.length) return null;
  return (
    <section className="case-inline case-inline-staff" aria-label="Ligar a um caso">
      <p className="case-inline-head"><CircleDot size={16} aria-hidden />Faz parte de um caso que a redação acompanha?</p>
      <div className="row">
        <select aria-label="Caso" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Escolha o caso</option>
          {options.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <Button disabled={!pick} onClick={() => act(() => api.setCaseLink(kind, id, pick), 'Item ligado ao caso.')}>Ligar</Button>
      </div>
    </section>
  );
}

/** Confirmar (ou renomear) um caso. Ao confirmar um automático, o endereço muda para a chave nova. */
export function CaseConfirm({ c }: { c: Case }) {
  const me = useMe();
  const router = useRouter();
  const [label, setLabel] = useState(c.title);
  const [busy, setBusy] = useState(false);
  if (!canEditCases(me)) return null;
  const save = async () => {
    setBusy(true);
    const out = await act(() => api.confirmCase(c.id, label), c.confirmed ? 'Nome do caso atualizado.' : 'Caso confirmado. Novas notícias parecidas entram nele automaticamente.');
    setBusy(false);
    if (out && typeof out === 'object' && out.key !== c.id) router.replace(`/casos/${out.key}`);
  };
  return (
    <section className="case-confirm" aria-label="Redação">
      <p className="muted">{c.confirmed ? 'Caso confirmado pela redação.' : 'Ligação feita automaticamente pelo sistema. Confira os itens e confirme o caso para fixar a ligação.'}</p>
      <div className="row">
        <input aria-label="Nome do caso" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
        <Button variant={c.confirmed ? 'outline' : 'primary'} busy={busy} onClick={save}>{c.confirmed ? 'Renomear' : 'Confirmar caso'}</Button>
      </div>
    </section>
  );
}
