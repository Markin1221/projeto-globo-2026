'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, RoleGate } from '@/components/shell-parts';
import { Button, EmptyState, Modal, PageState, Tabs, agoText } from '@/components/ui';
import { canModerate, ROLE_LABEL } from '@/domain/rules';
import { resolveContent, userById } from '@/domain/selectors';
import type { ContentKey, Report } from '@/domain/types';
import { act, actorId, api, usePageLoad, useDb, useMe } from '@/store';

function threadOf(db: ReturnType<typeof useDb>, key: ContentKey): ContentKey {
  if (!key.startsWith('comment:')) return key;
  return db.comments.find((c) => `comment:${c.id}` === key)?.target ?? key;
}

function ReportRow({ r }: { r: Report }) {
  const db = useDb();
  const [block, setBlock] = useState<string | null>(null);
  const c = resolveContent(db, r.target);
  const author = userById(db, c?.authorId);
  const hidden = db.hiddenContent.includes(r.target);
  const thread = threadOf(db, r.target);
  const locked = db.lockedThreads.includes(thread);
  const open = r.status === 'aberta';
  const falseCount = author ? db.relatos.filter((x) => x.authorId === author.id && x.status === 'falso').length : 0;
  return (
    <li className="mod-item">
      <div className="post-meta"><span className="seal seal-neutral">{r.reason}</span><span className="muted">{agoText(r.createdAt)}, por {userById(db, r.reporterId)?.name}</span>{!open && <span className="sample">{r.status === 'procedente' ? 'Procedente' : 'Improcedente'}</span>}</div>
      <p>{c ? <Link href={c.href}>{c.title}</Link> : 'Conteúdo removido'}</p>
      {r.detail && <p className="muted">“{r.detail}”</p>}
      {author && <p className="muted">Autor: {author.name}{falseCount ? `, ${falseCount} relatos falsos` : ''}{author.blocked ? ', bloqueado' : ''}</p>}
      <div className="row">
        <Button onClick={() => act(async () => { await api.setHidden(actorId(), r.target, !hidden); if (open) await api.resolveReport(actorId(), r.id, 'procedente'); }, hidden ? 'Conteúdo reexibido.' : 'Conteúdo oculto.')}>{hidden ? 'Reexibir' : 'Ocultar'}</Button>
        <Button onClick={() => act(() => api.setThreadLocked(actorId(), thread, !locked), locked ? 'Thread reaberta.' : 'Thread encerrada.')}>{locked ? 'Reabrir thread' : 'Encerrar thread'}</Button>
        {author && !author.blocked && !['jornalista', 'admin', 'moderador'].includes(author.role) && <Button variant="danger" onClick={() => setBlock(author.id)}>Bloquear autor</Button>}
        {open && <Button variant="ghost" onClick={() => act(() => api.resolveReport(actorId(), r.id, 'improcedente'), 'Denúncia arquivada.')}>Arquivar</Button>}
      </div>
      <Modal open={!!block} onClose={() => setBlock(null)} title="Bloquear conta?">
        <p>{author?.name} não poderá publicar relatos, comentar nem confirmar. Use em casos de informação falsa recorrente.</p>
        <div className="row end"><Button variant="ghost" onClick={() => setBlock(null)}>Cancelar</Button><Button variant="danger" onClick={() => { act(() => api.setBlocked(actorId(), block!, true), 'Conta bloqueada.'); setBlock(null); }}>Bloquear</Button></div>
      </Modal>
    </li>
  );
}

export default function ModerationPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('moderacao');
  const [tab, setTab] = useState<'abertas' | 'tratadas' | 'ocultos' | 'contas'>('abertas');
  const open = db.reports.filter((r) => r.status === 'aberta');
  const done = db.reports.filter((r) => r.status !== 'aberta');
  const accounts = db.users.filter((u) => u.role === 'morador' && !u.deleted).map((u) => ({ u, falsos: db.relatos.filter((r) => r.authorId === u.id && r.status === 'falso').length })).sort((a, b) => b.falsos - a.falsos);
  return (
    <>
      <PageHeader title="Moderação" />
      <RoleGate allow={canModerate(me)}>
        <Tabs label="Moderação" value={tab} onChange={setTab} tabs={[{ id: 'abertas', label: 'Denúncias', count: open.length }, { id: 'tratadas', label: 'Tratadas', count: done.length }, { id: 'ocultos', label: 'Ocultos', count: db.hiddenContent.length }, { id: 'contas', label: 'Contas' }]} />
        <PageState state={state} retry={retry} rows={3}>
          {tab === 'abertas' && (open.length ? <ul className="mods">{open.map((r) => <ReportRow key={r.id} r={r} />)}</ul> : <EmptyState title="Nenhuma denúncia aberta" />)}
          {tab === 'tratadas' && (done.length ? <ul className="mods">{done.map((r) => <ReportRow key={r.id} r={r} />)}</ul> : <EmptyState title="Nenhuma denúncia tratada ainda" />)}
          {tab === 'ocultos' && (db.hiddenContent.length ? <ul className="mods">{db.hiddenContent.map((k) => <li className="mod-item" key={k}><p>{resolveContent(db, k)?.title}</p><Button onClick={() => act(() => api.setHidden(actorId(), k, false), 'Conteúdo reexibido.')}>Reexibir</Button></li>)}</ul> : <EmptyState title="Nenhum conteúdo oculto" />)}
          {tab === 'contas' && <ul className="mods">{accounts.map(({ u, falsos }) => <li className="mod-item row between" key={u.id}><div><strong>{u.name}</strong><p className="muted">{ROLE_LABEL[u.role]}, {falsos} relatos falsos{u.blocked ? ', bloqueada' : ''}</p></div><Button variant={u.blocked ? 'outline' : 'danger'} onClick={() => act(() => api.setBlocked(actorId(), u.id, !u.blocked), u.blocked ? 'Conta desbloqueada.' : 'Conta bloqueada.')}>{u.blocked ? 'Desbloquear' : 'Bloquear'}</Button></li>)}</ul>}
        </PageState>
      </RoleGate>
    </>
  );
}
