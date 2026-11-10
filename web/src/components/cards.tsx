'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bookmark, Flag, Hand, Link2, MapPin, MessageCircle, Share2, Square, Users, Volume2, AlertTriangle, Construction, Droplets, ShieldAlert, CloudRain, Syringe, Car } from 'lucide-react';
import { canConfirm, NEIGHBOR_NOTE, relatoSpeech, TOPIC_LABEL } from '@/domain/rules';
import { bairroName, commentCount, entrySpeech, listedRelatos, programById, userById } from '@/domain/selectors';
import type { Alert, AlertType, ContentKey, FeedEntry, Relato } from '@/domain/types';
import { act, actorId, api, speak, toast, useDb, useMe, useUi } from '@/store';
import { ReportDialog, shareOfficial, ShareRelatoDialog } from './dialogs';
import { MediaMock, PostImage } from './media';
import { Avatar, Button, ConfirmedSeal, InformalNotice, OfficialSeal, SourceSeal, ProgramSeal, StatusSeal, timeAgo, agoText } from './ui';

export function ListenButton({ id, text, label = 'Ouvir' }: { id: string; text: string; label?: string }) {
  const { speaking } = useUi();
  const on = speaking?.id === id;
  return (
    <button type="button" className={`act ${on ? 'act-on' : ''}`} aria-pressed={on} aria-label={on ? 'Parar leitura' : `${label} em voz alta`} onClick={() => speak(id, text)}>
      {on ? <Square size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}<span>{on ? 'Parar' : label}</span>
    </button>
  );
}

export function SaveButton({ target }: { target: ContentKey }) {
  const me = useMe();
  const saved = me.saved.includes(target);
  return (
    <button type="button" className={`act ${saved ? 'act-on' : ''}`} aria-pressed={saved} onClick={() => act(async () => { const s = await api.toggleSave(actorId(), target); toast(s ? 'Salvo.' : 'Removido dos salvos.'); })}>
      <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden /><span>{saved ? 'Salvo' : 'Salvar'}</span>
    </button>
  );
}

function ActionBar({ target, speech, href, title, onShare }: { target: ContentKey; speech: string; href: string; title: string; onShare?: () => void }) {
  const db = useDb();
  const [report, setReport] = useState(false);
  return (
    <div className="actions">
      <ListenButton id={target} text={speech} />
      <Link className="act" href={`${href}#comentarios`} aria-label={`Comentários: ${commentCount(db, target)}`}><MessageCircle size={18} aria-hidden /><span>{commentCount(db, target)}</span></Link>
      <SaveButton target={target} />
      <button type="button" className="act" aria-label="Compartilhar" onClick={() => (onShare ? onShare() : shareOfficial(title, href))}><Share2 size={18} aria-hidden /><span className="hide-sm">Compartilhar</span></button>
      <button type="button" className="act" aria-label="Denunciar" onClick={() => setReport(true)}><Flag size={18} aria-hidden /></button>
      <ReportDialog target={target} open={report} onClose={() => setReport(false)} />
    </div>
  );
}

export function BairroChips({ ids, estimated = [] }: { ids: string[]; estimated?: { bairroId: string; reason: string }[] }) {
  const db = useDb();
  return <span className="chips">{ids.map((id) => { const est = estimated.find((e) => e.bairroId === id); return <Link key={id} className={`chip ${est ? 'chip-est' : ''}`} href={`/bairro/${id}`} title={est ? `Bairro estimado. ${est.reason}` : undefined}><MapPin size={13} aria-hidden />{bairroName(db, id)}{est && <span className="est"> (estimado)</span>}</Link>; })}</span>;
}

export function EntryCard({ entry }: { entry: FeedEntry }) {
  const db = useDb();
  if (entry.kind === 'segment') {
    const s = entry.item;
    const program = programById(db, s.programId)?.name ?? 'Telejornal';
    const href = `/trecho/${s.id}`;
    return (
      <article className="post">
        <span className="post-mark program-mark" aria-hidden>{programById(db, s.programId)?.short}</span>
        <div className="post-main">
          <div className="post-meta"><ProgramSeal name={program} />{s.live && <span className="seal seal-live"><b className="live-dot" />Ao vivo</span>}<time className="muted" dateTime={new Date(s.airedAt).toISOString()}>{timeAgo(s.airedAt)}</time><span className="sample">Exemplo</span></div>
          <h3 className="post-title"><Link href={href}>{s.title}</Link></h3>
          <p className="post-text">{s.summary}</p>
          <BairroChips ids={s.bairroIds} />
          <Link href={href} aria-label={`Assistir: ${s.title}`} tabIndex={-1}><PostImage topic={s.topic} seed={s.id} program={program} play live={s.live} /></Link>
          <ActionBar target={`segment:${s.id}`} speech={entrySpeech(entry, program)} href={href} title={s.title} />
        </div>
      </article>
    );
  }
  const a = entry.item;
  const author = userById(db, a.authorId);
  const source = programById(db, a.sourceId ?? '');
  const byline = author?.name ?? a.authorName ?? source?.name ?? 'Redação';
  const href = `/materia/${a.id}`;
  return (
    <article className="post">
      <span className="post-mark">{author ? <Avatar user={author} size={44} /> : <span className="program-mark source-mark" aria-hidden>{source?.short ?? 'WEB'}</span>}</span>
      <div className="post-main">
        <div className="post-meta">{a.originRelatoId ? <ConfirmedSeal /> : a.url && source ? <SourceSeal name={source.name} /> : <OfficialSeal />}<span className="muted">{a.url && source && byline === source.name ? '' : byline}</span><time className="muted" dateTime={new Date(a.publishedAt).toISOString()}>{timeAgo(a.publishedAt)}</time>{!a.url && <span className="sample">Exemplo</span>}</div>
        <h3 className="post-title"><Link href={href}>{a.title}</Link></h3>
        <p className="post-text">{a.lead}</p>
        <BairroChips ids={a.bairroIds} estimated={a.estimated} />
        {a.kind === 'materia' && <Link href={href} aria-label={`Abrir matéria: ${a.title}`} tabIndex={-1}><PostImage topic={a.topic} seed={a.id} src={a.imageUrl} alt={a.title} /></Link>}
        {a.originRelatoId && <Link className="origin-link" href={`/relatos/${a.originRelatoId}`}><Link2 size={15} aria-hidden />Ver o relato de origem</Link>}
        <ActionBar target={`article:${a.id}`} speech={entrySpeech(entry)} href={href} title={a.title} />
      </div>
    </article>
  );
}

export function ConfirmButton({ relato, big }: { relato: Relato; big?: boolean }) {
  const me = useMe();
  const [pop, setPop] = useState(false);
  const verdict = canConfirm(me, relato);
  const already = relato.confirmations.includes(me.id);
  const label = already ? 'Você também viu' : 'Eu também vi';
  const click = async () => {
    if (!verdict.ok) { toast(verdict.reason, 'info'); return; }
    const ok = await act(() => api.confirmRelato(actorId(), relato.id).then(() => true), 'Confirmação registrada. Ela ajuda a priorizar a apuração, mas não torna o relato verdadeiro.');
    if (ok) { setPop(true); setTimeout(() => setPop(false), 500); }
  };
  return (
    <div className="confirm-wrap">
      <Button big={big} className={`confirm ${already ? 'confirmed' : ''} ${pop ? 'pop' : ''}`} aria-disabled={!verdict.ok} aria-pressed={already} onClick={click}>
        <Hand size={big ? 24 : 16} aria-hidden />{label}<span className="confirm-n">{relato.confirmations.length}</span>
      </Button>
      <small className="confirm-note">{NEIGHBOR_NOTE}</small>
    </div>
  );
}

export function RelatoCard({ relato }: { relato: Relato }) {
  const db = useDb();
  const author = userById(db, relato.authorId);
  const [share, setShare] = useState(false);
  const name = bairroName(db, relato.bairroId);
  const href = `/relatos/${relato.id}`;
  return (
    <article className="relato">
      <InformalNotice />
      <div className="relato-in">
        <div className="post-meta"><StatusSeal status={relato.status} /><span className="muted-relato">{TOPIC_LABEL[relato.category]}</span><time className="muted-relato">{timeAgo(relato.createdAt)}</time><span className="sample">Exemplo</span></div>
        <h3 className="post-title"><Link href={href}>{relato.title}</Link></h3>
        <p className="post-text">{relato.description}</p>
        <p className="relato-by"><Avatar user={author} size={24} /> Enviado por <Link href={`/perfil/${relato.authorId}`}>{author?.name}</Link>, sobre <Link href={`/bairro/${relato.bairroId}`}>{name}</Link></p>
        {relato.media && <MediaMock media={relato.media} />}
        {relato.officialArticleId && <Link className="origin-link" href={`/materia/${relato.officialArticleId}`}><Link2 size={15} aria-hidden />Ler o post oficial da redação</Link>}
        <ConfirmButton relato={relato} />
        <ActionBar target={`relato:${relato.id}`} speech={relatoSpeech(relato, name)} href={href} title={relato.title} onShare={() => setShare(true)} />
      </div>
      <ShareRelatoDialog relato={relato} open={share} onClose={() => setShare(false)} />
    </article>
  );
}

/** Único formato em que relatos aparecem no feed principal: bloco separado, com aviso. */
export function ResidentsBlock({ bairroIds }: { bairroIds?: string[] }) {
  const db = useDb();
  const items = listedRelatos(db, bairroIds).filter((r) => r.status !== 'confirmado').slice(0, 2);
  if (!items.length) return null;
  return (
    <section className="residents" aria-labelledby="residents-title">
      <h2 id="residents-title"><Users size={18} aria-hidden />O que os moradores estão dizendo</h2>
      <InformalNotice />
      <ul>
        {items.map((r) => <li key={r.id}><Link href={`/relatos/${r.id}`}><strong>{r.title}</strong></Link><span>{bairroName(db, r.bairroId)}, {r.confirmations.length} disseram que viram</span></li>)}
      </ul>
      <Link className="more-link" href="/relatos">Abrir relatos dos moradores</Link>
    </section>
  );
}

export const ALERT_ICON: Record<AlertType, typeof Car> = { transito: Car, obras: Construction, agua: Droplets, seguranca: ShieldAlert, alagamento: CloudRain, vacinacao: Syringe };

export function AlertRow({ alert, compact }: { alert: Alert; compact?: boolean }) {
  const db = useDb();
  const Icon = ALERT_ICON[alert.type] ?? AlertTriangle;
  return (
    <div className={`alert alert-${alert.severity}`}>
      <Icon size={compact ? 18 : 22} aria-hidden />
      <div>
        <strong>{alert.title}</strong>
        {!compact && <p>{alert.detail}</p>}
        <small><Link href={`/bairro/${alert.bairroId}`}>{bairroName(db, alert.bairroId)}</Link>{compact ? '' : `, fonte: ${alert.source}`}, {agoText(alert.createdAt)}</small>
      </div>
      {!compact && <ListenButton id={`alert:${alert.id}`} text={`Alerta para ${bairroName(db, alert.bairroId)}. ${alert.title}. ${alert.detail}`} />}
    </div>
  );
}
