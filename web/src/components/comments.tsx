'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { EyeOff, Flag, Lock, LockOpen, Reply } from 'lucide-react';
import { canModerate, isGuest, validateGuest } from '@/domain/rules';
import { commentsFor, isHidden, userById } from '@/domain/selectors';
import type { Comment, ContentKey } from '@/domain/types';
import { act, actorId, api, useDb, useMe } from '@/store';
import { ReportDialog } from './dialogs';
import { Avatar, Button, EmptyState, Field, timeAgo } from './ui';

function Composer({ target, parentId, onDone }: { target: ContentKey; parentId?: string; onDone?: () => void }) {
  const me = useMe();
  const [text, setText] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const idp = parentId ?? 'root';
  if (me.blocked) return <p className="locked"><Lock size={16} aria-hidden />Esta conta está bloqueada e não pode comentar.</p>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = isGuest(me) ? validateGuest(fullName, age) : {};
    if (!text.trim()) errs.text = 'Escreva seu comentário.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const ok = await act(() => api.addComment(actorId(), { target, parentId, text, guest: isGuest(me) ? { fullName, age } : undefined }).then(() => true), 'Comentário publicado.');
    setBusy(false);
    if (ok) { setText(''); onDone?.(); }
  };
  return (
    <form className="composer" onSubmit={submit} noValidate>
      {isGuest(me) && (
        <div className="grid2">
          <Field id={`g-name-${idp}`} label="Nome completo" error={errors.fullName}><input id={`g-name-${idp}`} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></Field>
          <Field id={`g-age-${idp}`} label="Idade" error={errors.age} hint="Mínimo de 13 anos."><input id={`g-age-${idp}`} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></Field>
        </div>
      )}
      <Field id={`c-text-${idp}`} label={parentId ? 'Sua resposta' : 'Seu comentário'} error={errors.text}><textarea id={`c-text-${idp}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <div className="row end"><Button type="submit" variant="primary" busy={busy}>{parentId ? 'Responder' : 'Comentar'}</Button></div>
    </form>
  );
}

function Item({ c, all, target, locked }: { c: Comment; all: Comment[]; target: ContentKey; locked: boolean }) {
  const db = useDb();
  const me = useMe();
  const [replying, setReplying] = useState(false);
  const [report, setReport] = useState(false);
  const author = userById(db, c.authorId);
  const key: ContentKey = `comment:${c.id}`;
  const hidden = isHidden(db, key);
  const name = author?.name ?? c.guest?.fullName ?? 'Conta removida';
  const kids = all.filter((x) => x.parentId === c.id);
  return (
    <li className={`comment ${hidden ? 'is-hidden' : ''}`}>
      <Avatar user={author ?? { name, hue: 210 }} size={34} />
      <div className="comment-in">
        <p className="comment-head">
          {author ? <Link href={`/perfil/${author.id}`}>{name}</Link> : <strong>{name}</strong>}
          {!author && <span className="sample">Sem conta</span>}
          {author && ['jornalista', 'moderador', 'admin'].includes(author.role) && <span className="sample">Equipe</span>}
          <time className="muted">{timeAgo(c.createdAt)}</time>
          {hidden && <span className="sample">Oculto</span>}
        </p>
        <p>{c.text}</p>
        <div className="comment-acts">
          {!locked && <button type="button" className="act" onClick={() => setReplying((r) => !r)}><Reply size={15} aria-hidden /><span>Responder</span></button>}
          <button type="button" className="act" aria-label="Denunciar comentário" onClick={() => setReport(true)}><Flag size={15} aria-hidden /></button>
          {canModerate(me) && <button type="button" className="act" onClick={() => act(() => api.setHidden(actorId(), key, !hidden), hidden ? 'Comentário reexibido.' : 'Comentário oculto.')}><EyeOff size={15} aria-hidden /><span>{hidden ? 'Reexibir' : 'Ocultar'}</span></button>}
        </div>
        <ReportDialog target={key} open={report} onClose={() => setReport(false)} />
        {replying && !locked && <Composer target={target} parentId={c.id} onDone={() => setReplying(false)} />}
        {kids.length > 0 && <ul className="thread">{kids.map((k) => <Item key={k.id} c={k} all={all} target={target} locked={locked} />)}</ul>}
      </div>
    </li>
  );
}

export function Comments({ target }: { target: ContentKey }) {
  const db = useDb();
  const me = useMe();
  const all = commentsFor(db, target, me);
  const locked = db.lockedThreads.includes(target);
  const roots = all.filter((c) => !c.parentId);
  return (
    <section id="comentarios" className="comments" aria-labelledby="comments-title">
      <div className="row between">
        <h2 id="comments-title">Comentários ({all.length})</h2>
        {canModerate(me) && <Button onClick={() => act(() => api.setThreadLocked(actorId(), target, !locked), locked ? 'Thread reaberta.' : 'Thread encerrada.')}>{locked ? <LockOpen size={16} aria-hidden /> : <Lock size={16} aria-hidden />}{locked ? 'Reabrir thread' : 'Encerrar thread'}</Button>}
      </div>
      {locked ? <p className="locked"><Lock size={16} aria-hidden />Thread encerrada pela moderação. Não aceita novas respostas.</p> : <Composer target={target} />}
      {roots.length ? <ul className="thread root">{roots.map((c) => <Item key={c.id} c={c} all={all} target={target} locked={locked} />)}</ul> : <EmptyState title="Ainda sem comentários" text={locked ? undefined : 'Seja a primeira pessoa a comentar.'} />}
    </section>
  );
}
