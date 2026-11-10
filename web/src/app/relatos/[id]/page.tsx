'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Flag, Link2, MapPin, Phone, Share2, ShieldCheck } from 'lucide-react';
import { ConfirmButton, ListenButton } from '@/components/cards';
import { CaseInline } from '@/components/case-progress';
import { Comments } from '@/components/comments';
import { ReportDialog, ShareRelatoDialog } from '@/components/dialogs';
import { MediaMock } from '@/components/media';
import { CityMap } from '@/components/city-map';
import { TriagePanel } from '@/components/triage';
import { PageHeader } from '@/components/shell-parts';
import { Button, fmtDate, InformalNotice, Modal, NotFoundState, PageState, StatusSeal, Field } from '@/components/ui';
import { canAssume, canAudit, canDecide, canSeeContact, relatoSpeech, STATUS_LABEL, TOPIC_LABEL } from '@/domain/rules';
import { bairroName, isHidden, userById } from '@/domain/selectors';
import type { Relato } from '@/domain/types';
import { act, actorId, api, usePageLoad, useDb, useMe } from '@/store';

function Contact({ relato }: { relato: Relato }) {
  const me = useMe();
  if (!canSeeContact(me)) return null;
  const c = api.getRelatoContact(me.id, relato.id);
  if (!c) return <p className="muted">O autor apagou os dados de contato.</p>;
  return (
    <section className="desk-box" aria-label="Dados de contato do autor">
      <h3><Phone size={18} aria-hidden />Contato do autor (só redação)</h3>
      <dl className="dl"><dt>Nome</dt><dd>{c.fullName}</dd><dt>Idade</dt><dd>{c.age}</dd><dt>Telefone</dt><dd>{c.phone}</dd><dt>Endereço</dt><dd>{c.address}</dd><dt>Aceita contato</dt><dd>{c.acceptsContact ? 'Sim' : 'Não. Respeite a decisão do autor.'}</dd></dl>
    </section>
  );
}

function Desk({ relato }: { relato: Relato }) {
  const db = useDb();
  const me = useMe();
  const [mode, setMode] = useState<'confirmado' | 'falso' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!canAudit(me)) return null;
  const assume = canAssume(me, relato);
  const decide = canDecide(me, relato);
  const submit = async () => {
    if (note.trim().length < 15) { setError('Escreva pelo menos 15 letras para o público entender a decisão.'); return; }
    setBusy(true);
    const done = await act(async () => { await api.decideRelato(actorId(), relato.id, mode!, note); return true; }, mode === 'confirmado' ? 'Relato confirmado. Post oficial publicado e seguidores avisados.' : 'Relato marcado como falso e retirado das listagens.');
    setBusy(false);
    if (done) { setMode(null); setNote(''); setError(''); }
  };
  return (
    <section className="desk-box" aria-label="Apuração">
      <h3><ShieldCheck size={18} aria-hidden />Apuração da redação</h3>
      <p className="muted">A decisão é sempre de um jornalista. Nenhuma automação marca um relato como verdadeiro. Responsável: {userById(db, relato.assigneeId)?.name ?? 'ninguém ainda'}.</p>
      <div className="row">
        {assume.ok && <Button variant="primary" onClick={() => act(() => api.assumeRelato(actorId(), relato.id), 'Apuração assumida.')}>Assumir apuração</Button>}
        {decide.ok && <><Button variant="success" onClick={() => setMode('confirmado')}>Confirmar</Button><Button variant="danger" onClick={() => setMode('falso')}>Marcar como falso</Button></>}
        {!assume.ok && !decide.ok && <p className="muted">{relato.status === 'apuracao' ? decide.ok === false && decide.reason : 'Apuração concluída.'}</p>}
      </div>
      <Modal open={!!mode} onClose={() => setMode(null)} title={mode === 'confirmado' ? 'Confirmar pela redação' : 'Marcar como falso ou não confirmado'}>
        <p className="muted">{mode === 'confirmado' ? 'O relato vira post oficial com selo verde e link para a origem. Quem segue o bairro será avisado.' : 'O relato sai das listagens e continua acessível só pelo link, com esta explicação.'}</p>
        <Field id="note" label="Nota da redação" error={error}><textarea id="note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="row end"><Button variant="ghost" onClick={() => setMode(null)}>Cancelar</Button><Button variant={mode === 'confirmado' ? 'success' : 'danger'} busy={busy} onClick={submit}>{mode === 'confirmado' ? 'Confirmar e publicar' : 'Marcar como falso'}</Button></div>
      </Modal>
    </section>
  );
}

export default function RelatoDetail() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad(`relato-${id}`);
  const [share, setShare] = useState(false);
  const [report, setReport] = useState(false);
  const r = db.relatos.find((x) => x.id === id);
  const hidden = isHidden(db, `relato:${id}`);
  if (!r || (hidden && me.role !== 'moderador')) return <><PageHeader title="Relato" back /><NotFoundState what="Relato" /></>;
  const name = bairroName(db, r.bairroId);
  const author = userById(db, r.authorId);
  const steps: Relato['status'][] = ['enviado', 'apuracao', r.status === 'falso' ? 'falso' : 'confirmado'];
  const reached = (s: Relato['status']) => r.history.find((h) => h.status === s);
  return (
    <>
      <PageHeader title="Relato de morador" back />
      <PageState state={state} retry={retry} rows={2}>
        <article className={`detail relato-detail ${r.status === 'falso' ? 'is-false' : ''}`}>
          <InformalNotice />
          {r.status === 'falso' && <div className="false-box" role="alert"><h3>A redação concluiu que este relato é falso ou não pôde ser confirmado</h3><p>{r.newsroomNote}</p><small>Ele saiu das listagens e não recebe confirmações. Esta página continua disponível só por link direto.</small></div>}
          {hidden && <p className="locked">Conteúdo oculto pela moderação.</p>}
          <div className="post-meta"><StatusSeal status={r.status} /><span className="muted-relato">{TOPIC_LABEL[r.category]}</span><span className="sample">Exemplo</span></div>
          <h2 className="detail-title">{r.title}</h2>
          <p>{r.description}</p>
          <p className="relato-by">Enviado por <Link href={`/perfil/${r.authorId}`}>{author?.name}</Link> em {fmtDate(r.createdAt)}. Fato em {fmtDate(r.occurredAt)}.</p>
          {r.media && <MediaMock media={r.media} />}
          <section aria-label="Status da apuração"><h3>Status da apuração</h3>
            <ol className="status-track">{steps.map((s) => { const h = reached(s); return <li key={s} className={h ? `on st-${s}` : ''}><b>{STATUS_LABEL[s]}</b><small>{h ? fmtDate(h.at) : 'Pendente'}</small></li>; })}</ol>
          </section>
          {r.status === 'confirmado' && <div className="confirm-box"><h3>Nota da redação</h3><p>{r.newsroomNote}</p>{r.officialArticleId && <Link className="origin-link" href={`/materia/${r.officialArticleId}`}><Link2 size={15} aria-hidden />Ler o post oficial</Link>}</div>}
          <section className="relato-where"><h3><MapPin size={18} aria-hidden />Onde foi</h3><p>{r.street}, <Link href={`/bairro/${r.bairroId}`}>{name}</Link>. Referência: {r.reference}.</p><div className="map-box"><CityMap db={db} height={220} mode={{ kind: 'show', pin: r.pin, selected: r.bairroId }} label={`Mapa com o local aproximado do relato, em ${name}`} /></div></section>
          {r.status !== 'falso' && <ConfirmButton relato={r} />}
          <div className="actions">
            <ListenButton id={`relato:${r.id}`} text={relatoSpeech(r, name)} />
            <button type="button" className="act" onClick={() => setShare(true)}><Share2 size={18} aria-hidden /><span>Compartilhar</span></button>
            <button type="button" className="act" onClick={() => setReport(true)}><Flag size={18} aria-hidden /><span>Denunciar</span></button>
          </div>
          <Contact relato={r} />
          {r.status !== 'falso' && <CaseInline kind="relato" id={r.id} bairroIds={[r.bairroId]} />}
          <TriagePanel t={db.triage?.[r.id]} />
          <Desk relato={r} />
        </article>
        <Comments target={`relato:${r.id}`} />
        <ShareRelatoDialog relato={r} open={share} onClose={() => setShare(false)} />
        <ReportDialog target={`relato:${r.id}`} open={report} onClose={() => setReport(false)} />
      </PageState>
    </>
  );
}
