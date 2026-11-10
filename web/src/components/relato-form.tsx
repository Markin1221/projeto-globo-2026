'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Camera, LocateFixed, Mic, Sparkles, Video } from 'lucide-react';
import { AUTHOR_ACK, canPublishRelato, CONTACT_NOTICE, TOPIC_LABEL, validateRelato } from '@/domain/rules';
import type { MediaAttachment, RelatoDraft, Topic } from '@/domain/types';
import { act, actorId, api, toast, useDb, useMe } from '@/store';
import { CityMap } from './city-map';
import { locate } from './dialogs';
import { RelatoCard } from './cards';
import { Button, EmptyState, Field, InformalNotice, SuccessState } from './ui';

export const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
export const emptyDraft = (bairroId = ''): RelatoDraft => ({ title: '', category: '', description: '', bairroId, street: '', reference: '', occurredAt: nowLocal(), fullName: '', age: '', phone: '', address: '', acceptsContact: false, ackUnverified: false });
const SAMPLE = { fullName: 'Lúcia Barbosa de Lima', age: '52', phone: '(81) 90000-0101', address: 'Rua de exemplo, 10, Casa Amarela' };

export function RelatoForm() {
  const db = useDb();
  const me = useMe();
  const [d, setD] = useState<RelatoDraft>(() => emptyDraft(me.bairroId ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const set = <K extends keyof RelatoDraft>(k: K, v: RelatoDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const verdict = canPublishRelato(me);

  if (!verdict.ok) return <EmptyState title="Você não pode publicar relatos agora" text={verdict.reason} action={<Link className="btn btn-primary" href="/relatos">Ver relatos dos moradores</Link>} />;
  if (created) {
    const live = db.relatos.find((r) => r.id === created.id);
    if (!live) return <SuccessState title="Relato publicado" />;
    return (
      <div>
        <SuccessState title="Relato publicado como não verificado" text="A redação foi avisada. Enquanto um jornalista não apurar, ele aparece com o selo de que pode ser falso.">
          <div className="row"><Link className="btn btn-primary" href={`/relatos/${live.id}`}>Acompanhar a apuração</Link><Button onClick={() => { setCreated(null); setD(emptyDraft(me.bairroId ?? '')); }}>Enviar outro relato</Button></div>
        </SuccessState>
        <RelatoCard relato={live} />
      </div>
    );
  }

  const input = (k: 'title' | 'street' | 'reference' | 'fullName' | 'age' | 'phone' | 'address', extra: object = {}) => (
    <input id={`f-${k}`} value={d[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `f-${k}-err` : undefined} {...extra} />
  );
  const media = (type: MediaAttachment['type'], name: string) => { set('media', d.media?.type === type ? undefined : { type, name }); };
  const useLocation = async () => {
    setLocating(true);
    const loc = await locate(db.bairros);
    setLocating(false);
    if (!loc.bairro) { toast('Não encontramos um bairro perto de você. Escolha na lista.', 'info'); return; }
    setD((p) => ({ ...p, bairroId: loc.bairro!.id, pin: { lat: loc.lat, lng: loc.lng } }));
    const nm = loc.bairro.name;
    act(() => api.setLocation(actorId(), true, `${nm}${loc.simulated ? ' (simulado)' : ''}`));
    toast(loc.simulated ? `Não foi possível usar o GPS. Usamos um ponto de exemplo em ${nm}. Confira no mapa.` : `Você está perto de ${nm}. Confira no mapa.`, 'info');
  };
  const fillSample = () => setD((p) => ({
    ...p, title: 'Água descendo forte na ladeira da Rua Alto do Céu', category: 'alagamento', description: 'A chuva começou e em poucos minutos a água já estava entrando nas garagens da ladeira.',
    bairroId: 'casa-amarela', street: 'Rua Alto do Céu', reference: 'Depois do mercadinho', pin: { lat: -8.0262, lng: -34.9168 }, ...SAMPLE, media: { type: 'foto', name: 'ladeira.jpg' },
  }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateRelato(d);
    setErrors(errs);
    if (Object.keys(errs).length) { summary.current?.focus(); return; }
    setBusy(true);
    const r = await act(() => api.createRelato(actorId(), d), 'Relato publicado como não verificado.');
    setBusy(false);
    if (r) { setCreated(r); window.scrollTo(0, 0); }
  };
  const count = Object.keys(errors).length;

  return (
    <form className="form" onSubmit={submit} noValidate>
      <InformalNotice />
      <div className="row between"><p className="muted">Todos os campos são obrigatórios, exceto o anexo e o aceite de contato.</p><Button onClick={fillSample}><Sparkles size={16} aria-hidden />Preencher exemplo</Button></div>
      <div ref={summary} tabIndex={-1} className={count ? 'error-summary' : 'sr-only'} role={count ? 'alert' : undefined}>{count ? `Corrija ${count === 1 ? '1 campo' : `${count} campos`} antes de publicar.` : ''}</div>

      <fieldset><legend>O que aconteceu</legend>
        <Field id="f-title" label="Título" error={errors.title}>{input('title')}</Field>
        <Field id="f-category" label="Categoria" error={errors.category}>
          <select id="f-category" value={d.category} onChange={(e) => set('category', e.target.value as Topic)}><option value="">Escolha</option>{Object.entries(TOPIC_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field id="f-description" label="Descrição" error={errors.description}><textarea id="f-description" rows={4} value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="field"><span className="label-like">Foto, vídeo ou áudio (simulado)</span>
          <div className="row">
            <Button aria-pressed={d.media?.type === 'foto'} className={d.media?.type === 'foto' ? 'sel' : ''} onClick={() => media('foto', 'foto-do-local.jpg')}><Camera size={16} aria-hidden />Foto</Button>
            <Button aria-pressed={d.media?.type === 'video'} className={d.media?.type === 'video' ? 'sel' : ''} onClick={() => media('video', 'video-do-local.mp4')}><Video size={16} aria-hidden />Vídeo</Button>
            <Button aria-pressed={d.media?.type === 'audio'} className={d.media?.type === 'audio' ? 'sel' : ''} onClick={() => media('audio', 'audio-do-local.m4a')}><Mic size={16} aria-hidden />Áudio</Button>
          </div>
          {d.media && <small>Anexado: {d.media.name}</small>}
        </div>
      </fieldset>

      <fieldset><legend>Onde e quando</legend>
        <Button busy={locating} onClick={useLocation}><LocateFixed size={16} aria-hidden />Usar minha localização</Button>
        <Field id="f-bairro" label="Bairro" error={errors.bairroId}>
          <select id="f-bairro" value={d.bairroId} onChange={(e) => set('bairroId', e.target.value)}><option value="">Escolha</option>{db.bairros.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.cityId === 'recife' ? b.region : db.cities.find((c) => c.id === b.cityId)?.name})</option>)}</select>
        </Field>
        <div className="map-box"><CityMap db={db} height={260} mode={{ kind: 'pick', pin: d.pin, selected: d.bairroId, onPick: (p) => setD((x) => ({ ...x, bairroId: p.bairroId, pin: { lat: p.lat, lng: p.lng } })) }} label="Mapa: toque no local do fato para marcar" /><small>Toque no mapa para marcar o local. O bairro mais próximo é escolhido, e você pode trocar acima.</small></div>
        <div className="grid2">
          <Field id="f-street" label="Rua" error={errors.street}>{input('street')}</Field>
          <Field id="f-reference" label="Ponto de referência" error={errors.reference}>{input('reference')}</Field>
        </div>
        <Field id="f-when" label="Data e hora" error={errors.occurredAt}><input id="f-when" type="datetime-local" value={d.occurredAt} max={nowLocal()} onChange={(e) => set('occurredAt', e.target.value)} /></Field>
      </fieldset>

      <fieldset><legend>Seus dados</legend>
        <p className="contact-notice">{CONTACT_NOTICE}</p>
        <Field id="f-fullName" label="Nome completo" error={errors.fullName}>{input('fullName', { autoComplete: 'name' })}</Field>
        <div className="grid2">
          <Field id="f-age" label="Idade" error={errors.age}>{input('age', { inputMode: 'numeric' })}</Field>
          <Field id="f-phone" label="Telefone ou WhatsApp" error={errors.phone}>{input('phone', { inputMode: 'tel', autoComplete: 'tel' })}</Field>
        </div>
        <Field id="f-address" label="Endereço" error={errors.address}>{input('address', { autoComplete: 'street-address' })}</Field>
        <label className="check"><input type="checkbox" checked={d.acceptsContact} onChange={(e) => set('acceptsContact', e.target.checked)} />Aceito ser procurado por um repórter.</label>
        <label className={`check check-ack ${errors.ackUnverified ? 'field-error' : ''}`}><input type="checkbox" checked={d.ackUnverified} onChange={(e) => set('ackUnverified', e.target.checked)} />{AUTHOR_ACK}</label>
        {errors.ackUnverified && <small className="err" role="alert">{errors.ackUnverified}</small>}
      </fieldset>
      <div className="row end"><Button type="submit" variant="primary" busy={busy}>Publicar relato</Button></div>
    </form>
  );
}
