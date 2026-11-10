'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ExternalLink, Link2 } from 'lucide-react';
import { BairroChips, ListenButton, SaveButton } from '@/components/cards';
import { CaseInline } from '@/components/case-progress';
import { Comments } from '@/components/comments';
import { PostImage } from '@/components/media';
import { PageHeader } from '@/components/shell-parts';
import { Avatar, ConfirmedSeal, fmtDate, NotFoundState, OfficialSeal, PageState, SourceSeal } from '@/components/ui';
import { TOPIC_LABEL } from '@/domain/rules';
import { bairroName, isHidden, programById, userById } from '@/domain/selectors';
import { usePageLoad, useDb } from '@/store';

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { state, retry } = usePageLoad(`materia-${id}`);
  const a = db.articles.find((x) => x.id === id);
  if (!a || isHidden(db, `article:${id}`)) return <><PageHeader title="Matéria" back /><NotFoundState what="Conteúdo" /></>;
  const author = userById(db, a.authorId);
  return (
    <>
      <PageHeader title={a.kind === 'post' ? 'Post oficial' : 'Matéria'} back />
      <PageState state={state} retry={retry} rows={2}>
        <article className="detail">
          <div className="post-meta">{a.originRelatoId ? <ConfirmedSeal /> : a.url && programById(db, a.sourceId ?? '') ? <SourceSeal name={programById(db, a.sourceId ?? '')!.name} /> : <OfficialSeal />}<span className="muted">{TOPIC_LABEL[a.topic]}</span>{!a.url && <span className="sample">Exemplo</span>}</div>
          <h2 className="detail-title">{a.title}</h2>
          <p className="detail-lead">{a.lead}</p>
          <p className="byline">{author ? <><Avatar user={author} size={32} /><Link href={`/perfil/${a.authorId}`}>{author.name}</Link></> : <strong>{a.authorName ?? programById(db, a.sourceId ?? '')?.name ?? 'Redação'}</strong>}<span className="muted">{fmtDate(a.publishedAt)}</span></p>
          <BairroChips ids={a.bairroIds} estimated={a.estimated} />
          {!!a.estimated?.length && <p className="loc-note">Localização estimada pelo sistema: {a.estimated.map((e) => `${bairroName(db, e.bairroId)} (${e.reason.replace(/^Ponto de referência: /, 'por citar ')})`).join('; ')}.</p>}
          <PostImage topic={a.topic} seed={a.id} src={a.imageUrl} alt={a.title} />
          <div className="actions"><ListenButton id={`article:${a.id}`} text={`${a.title}. ${a.lead} ${a.body.join(' ')}`} /><SaveButton target={`article:${a.id}`} /></div>
          <CaseInline kind="article" id={a.id} bairroIds={a.bairroIds} />
          {a.body.map((p) => <p key={p}>{p}</p>)}
          {a.url && <a className="origin-link" href={a.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden />Ler na fonte original</a>}
          {a.originRelatoId && <Link className="origin-link" href={`/relatos/${a.originRelatoId}`}><Link2 size={15} aria-hidden />Ver o relato de origem do morador</Link>}
        </article>
        <Comments target={`article:${a.id}`} />
      </PageState>
    </>
  );
}
