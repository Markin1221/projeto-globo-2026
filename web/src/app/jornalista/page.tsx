'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Hand } from 'lucide-react';
import { PageHeader, RoleGate } from '@/components/shell-parts';
import { Button, EmptyState, Field, PageState, StatusSeal, Tabs, agoText } from '@/components/ui';
import { TriageChips } from '@/components/triage';
import { RelatoGroups, SummaryCard } from '@/components/relato-groups';
import { canAudit, TOPIC_LABEL } from '@/domain/rules';
import { bairroName, journalistQueue, userById } from '@/domain/selectors';
import type { Relato, Topic } from '@/domain/types';
import { act, actorId, api, usePageLoad, useDb, useMe } from '@/store';

function Row({ r }: { r: Relato }) {
  const db = useDb();
  return (
    <li className="queue-item">
      <div className="queue-n" aria-label={`${r.confirmations.length} confirmações`}><Hand size={16} aria-hidden />{r.confirmations.length}</div>
      <div className="queue-body">
        <div className="post-meta"><StatusSeal status={r.status} /><span className="muted">{bairroName(db, r.bairroId)}, {TOPIC_LABEL[r.category]}, {agoText(r.createdAt)}</span></div>
        <Link href={`/relatos/${r.id}`}><strong>{r.title}</strong></Link>
        <small className="muted">{r.assigneeId ? `Com ${userById(db, r.assigneeId)?.name}` : 'Sem responsável'}</small>
        <TriageChips t={db.triage?.[r.id]} />
      </div>
      <div className="queue-acts">
        {r.status === 'enviado' && <Button variant="primary" onClick={() => act(() => api.assumeRelato(actorId(), r.id), 'Apuração assumida.')}>Assumir</Button>}
        <Link className="btn btn-outline" href={`/relatos/${r.id}`}>Abrir</Link>
      </div>
    </li>
  );
}

function Publish() {
  const db = useDb();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [lead, setLead] = useState('');
  const [bairroId, setBairro] = useState('casa-amarela');
  const [topic, setTopic] = useState<Topic>('obras');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const a = await act(() => api.publishOfficial(actorId(), { title, lead, bairroId, topic }), 'Post oficial publicado.');
    setBusy(false);
    if (a) router.push(`/materia/${a.id}`);
  };
  return (
    <form className="form pad" onSubmit={submit}>
      <Field id="p-title" label="Título"><input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field id="p-lead" label="Texto"><textarea id="p-lead" rows={4} value={lead} onChange={(e) => setLead(e.target.value)} /></Field>
      <div className="grid2">
        <Field id="p-b" label="Bairro"><select id="p-b" value={bairroId} onChange={(e) => setBairro(e.target.value)}>{db.bairros.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field id="p-t" label="Tema"><select id="p-t" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>{Object.entries(TOPIC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <div className="row end"><Button type="submit" variant="primary" busy={busy}>Publicar post oficial</Button></div>
    </form>
  );
}

export default function JournalistPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('jornalista');
  const [tab, setTab] = useState<'fila' | 'assuntos' | 'minhas' | 'publicar' | 'concluidos'>('fila');
  const [order, setOrder] = useState<'confirmacoes' | 'prioridade' | 'risco'>('confirmacoes');
  const base = journalistQueue(db);
  const queue = order === 'confirmacoes' ? base : [...base].sort((a, b) => order === 'prioridade' ? (db.triage?.[b.id]?.priority ?? 0) - (db.triage?.[a.id]?.priority ?? 0) : (db.triage?.[b.id]?.risk ?? 0) - (db.triage?.[a.id]?.risk ?? 0));
  const mine = queue.filter((r) => r.assigneeId === me.id);
  const done = db.relatos.filter((r) => r.status === 'confirmado' || r.status === 'falso').sort((a, b) => b.history[b.history.length - 1].at - a.history[a.history.length - 1].at);
  return (
    <>
      <PageHeader title="Painel do Jornalista" />
      <RoleGate allow={canAudit(me)}>
        <Tabs label="Painel" value={tab} onChange={setTab} tabs={[{ id: 'fila', label: 'Fila', count: queue.length }, { id: 'assuntos', label: 'Por assunto', count: db.relatoGroups.length }, { id: 'minhas', label: 'Minhas', count: mine.length }, { id: 'concluidos', label: 'Concluídos', count: done.length }, { id: 'publicar', label: 'Publicar' }]} />
        <PageState state={state} retry={retry} rows={3}>
          {tab === 'fila' && <>{<div className="pad"><label className="order-select">Ordenar a fila por<select value={order} onChange={(e) => setOrder(e.target.value as typeof order)}><option value="confirmacoes">Confirmações e recência (padrão)</option><option value="prioridade">Prioridade sugerida pela triagem</option><option value="risco">Maior risco de boato</option></select></label><p className="muted">{order === 'confirmacoes' ? 'Mais confirmações primeiro; em empate, o mais recente. Confirmações priorizam a apuração, não provam o fato.' : 'A triagem automática só sugere a ordem. Os sinais de cada relato aparecem ao abrir.'}</p></div>}{queue.length ? <ol className="queue">{queue.map((r) => <Row key={r.id} r={r} />)}</ol> : <EmptyState title="Fila vazia" text="Nenhum relato aguardando apuração." />}</>}
          {tab === 'minhas' && (mine.length ? <ol className="queue">{mine.map((r) => <Row key={r.id} r={r} />)}</ol> : <EmptyState title="Nenhuma apuração com você" text="Assuma um relato na fila." />)}
          {tab === 'concluidos' && <ol className="queue">{done.map((r) => <Row key={r.id} r={r} />)}</ol>}
          {tab === 'publicar' && <Publish />}
          {tab === 'assuntos' && <div className="pad"><SummaryCard label="Resumir tudo o que chegou nos últimos 7 dias" /><p className="muted">Relatos do mesmo assunto ficam juntos: dá para apurar de uma vez e ver o que pode ser urgente.</p><RelatoGroups staff /></div>}
        </PageState>
      </RoleGate>
    </>
  );
}
