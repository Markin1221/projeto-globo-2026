'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, LocateFixed, MapPin } from 'lucide-react';
import { distanceKm, INFORMAL_SEAL, INFORMAL_WARNING, nearestBairro, relatoShareText, searchPlaces, STATUS_LABEL, type PlaceCandidate } from '@/domain/rules';
import { bairroName } from '@/domain/selectors';
import type { Bairro, ContentKey, Relato } from '@/domain/types';
import { act, actorId, api, toast, useDb } from '@/store';
import { Button, EmptyState, Field, InformalNotice, Modal, StatusSeal } from './ui';

/** GPS do aparelho; se não houver permissão ou sinal, usa um ponto de exemplo em Casa Amarela. */
export async function locate(bairros: Bairro[]): Promise<{ lat: number; lng: number; simulated: boolean; bairro?: Bairro }> {
  const real = await new Promise<GeolocationPosition | null>((res) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { res(null); return; }
    navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 });
  });
  const p = real ? { lat: real.coords.latitude, lng: real.coords.longitude } : { lat: -8.0262, lng: -34.9168 };
  const near = nearestBairro(p, bairros);
  // Longe de qualquer bairro cadastrado (mais de 6 km): trata como fora da área.
  if (near && distanceKm(p, near) > 6) return { ...p, simulated: !real };
  return { ...p, simulated: !real, bairro: near };
}

const REASONS = ['Informação possivelmente falsa', 'Ofensa ou discurso de ódio', 'Dados pessoais expostos', 'Spam ou propaganda', 'Outro motivo'];

export function ReportDialog({ target, open, onClose }: { target: ContentKey; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const r = await act(() => api.createReport(actorId(), { target, reason, detail }).then(() => true), 'Denúncia enviada para a moderação.');
    setBusy(false);
    if (r) { setReason(''); setDetail(''); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Denunciar conteúdo">
      <fieldset className="radio-group"><legend>Qual é o problema?</legend>
        {REASONS.map((r) => <label key={r} className="radio"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />{r}</label>)}
      </fieldset>
      <Field id="report-detail" label="Conte mais (opcional)"><textarea id="report-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
      <div className="row end"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" busy={busy} disabled={!reason} onClick={submit}>Enviar denúncia</Button></div>
    </Modal>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = '', yy = y;
  for (const w of text.split(' ')) {
    if (ctx.measureText(line + w).width > max && line) { ctx.fillText(line.trim(), x, yy); yy += lh; line = ''; }
    line += `${w} `;
  }
  ctx.fillText(line.trim(), x, yy);
  return yy + lh;
}

/** O selo e o aviso fazem parte da própria imagem: não dá para compartilhar sem eles. */
function drawShareCard(c: HTMLCanvasElement, r: Relato, bairro: string) {
  c.width = 1080; c.height = 1080;
  const x = c.getContext('2d');
  if (!x) return;
  x.fillStyle = '#FFF7DB'; x.fillRect(0, 0, 1080, 1080);
  x.fillStyle = '#FFD23F'; x.fillRect(0, 0, 1080, 150);
  x.fillStyle = '#1B1400'; x.font = '700 42px "Barlow Condensed", sans-serif';
  x.fillText(`⚠ ${INFORMAL_SEAL}`, 60, 92);
  x.font = '700 62px "Barlow Condensed", sans-serif';
  let y = wrap(x, r.title, 60, 250, 960, 70);
  x.font = '400 34px "Atkinson Hyperlegible Next", sans-serif';
  x.fillStyle = '#4A3C00'; y = wrap(x, `${bairro}. Status: ${STATUS_LABEL[r.status]}`, 60, y + 10, 960, 46);
  x.fillStyle = '#1B1400'; y = wrap(x, r.description, 60, y + 24, 960, 46);
  x.fillStyle = '#1B1400'; x.fillRect(0, 830, 1080, 250);
  x.fillStyle = '#FFD23F'; x.font = '700 36px "Atkinson Hyperlegible Next", sans-serif';
  wrap(x, INFORMAL_WARNING, 60, 890, 960, 48);
  x.fillStyle = '#FFFFFF'; x.font = '400 28px "Atkinson Hyperlegible Next", sans-serif';
  x.fillText('Amigo da Vizinhança. Conteúdo de exemplo.', 60, 1044);
}

export function ShareRelatoDialog({ relato, open, onClose }: { relato: Relato; open: boolean; onClose: () => void }) {
  const db = useDb();
  const name = bairroName(db, relato.bairroId);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/relatos/${relato.id}` : '';
  const text = relatoShareText(relato, name, url);
  useEffect(() => { if (open) { const t = setTimeout(() => setMounted((m) => !m), 30); return () => clearTimeout(t); } }, [open]);
  useEffect(() => { if (open && canvas.current) drawShareCard(canvas.current, relato, name); }, [open, mounted, relato, name]);
  const download = () => {
    const a = document.createElement('a');
    a.href = canvas.current!.toDataURL('image/png');
    a.download = `relato-${relato.id}-nao-verificado.png`;
    a.click();
    toast('Imagem baixada com o selo e o aviso.');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('Texto copiado com o selo e o aviso.'); }
    catch { toast('O navegador bloqueou a cópia. Selecione o texto na caixa.', 'erro'); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Compartilhar relato não verificado">
      <p className="muted">O selo e o aviso vão junto na imagem e no texto. Não é possível removê-los.</p>
      <canvas ref={canvas} className="share-canvas" role="img" aria-label={`Imagem do relato com o selo ${INFORMAL_SEAL} e o aviso de que pode ser falso`} />
      <Field id="share-text" label="Texto para compartilhar"><textarea id="share-text" rows={7} readOnly value={text} /></Field>
      <div className="row end">
        <Button onClick={copy}><Copy size={16} aria-hidden />Copiar texto</Button>
        <Button variant="primary" onClick={download}><Download size={16} aria-hidden />Baixar imagem</Button>
      </div>
    </Modal>
  );
}

export function shareOfficial(title: string, path: string) {
  const url = `${window.location.origin}${path}`;
  if (navigator.share) { navigator.share({ title, url }).catch(() => undefined); return; }
  navigator.clipboard?.writeText(`${title}\n${url}`).then(() => toast('Link copiado.'), () => toast('Não foi possível copiar o link.', 'erro'));
}

/** Escolha de bairro por GPS simulado ou busca, sempre confirmando quando há nomes parecidos. */
export function BairroPicker({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: (bairroId: string) => void }) {
  const db = useDb();
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<PlaceCandidate | null>(null);
  const [gps, setGps] = useState<'idle' | 'asking' | 'locating'>('idle');
  const results = searchPlaces(q, db.bairros, db.streets);
  const close = () => { setQ(''); setPending(null); setGps('idle'); onClose(); };
  const choose = (c: PlaceCandidate) => { if (c.confirm) setPending(c); else follow(c.bairroId); };
  const follow = async (bairroId: string) => {
    const ok = await act(() => api.followBairro(actorId(), bairroId).then(() => true), `Agora você segue ${bairroName(db, bairroId)}.`);
    if (ok) { onDone?.(bairroId); close(); }
  };
  const allowGps = async () => {
    setGps('locating');
    const loc = await locate(db.bairros);
    setGps('idle');
    if (!loc.bairro) { toast('Sua localização está fora dos bairros cadastrados. Procure pelo nome.', 'info'); return; }
    const b = loc.bairro;
    act(() => api.setLocation(actorId(), true, `${b.name}${loc.simulated ? ' (simulado)' : ''}`));
    const twins = b.confusableWith.map((id) => db.bairros.find((x) => x.id === id)?.name).filter(Boolean);
    setPending({ key: 'gps', kind: 'bairro', label: b.name, detail: 'Localização', bairroId: b.id,
      confirm: `${loc.simulated ? 'Não conseguimos usar o GPS, então usamos um ponto de exemplo. ' : ''}Sua localização aponta para ${b.name}${twins.length ? `, que não é ${twins.join(' nem ')}` : ''}. ${b.name} é o seu bairro?` });
  };
  return (
    <Modal open={open} onClose={close} title={pending ? 'Confirme o bairro' : 'Seguir um bairro'}>
      {pending ? (
        <div className="stack">
          <p className="lead-text"><MapPin size={18} aria-hidden /> {pending.confirm}</p>
          <div className="row end">
            <Button variant="ghost" onClick={() => setPending(null)}>Não, escolher outro</Button>
            <Button variant="primary" onClick={() => follow(pending.bairroId)}><Check size={16} aria-hidden />Sim, seguir {db.bairros.find((b) => b.id === pending.bairroId)?.name}</Button>
          </div>
        </div>
      ) : gps === 'asking' ? (
        <div className="stack">
          <p>Vamos usar sua localização só para sugerir o bairro. Você pode apagá-la em Configurações.</p>
          <div className="row end"><Button variant="ghost" onClick={() => setGps('idle')}>Agora não</Button><Button variant="primary" onClick={allowGps}>Permitir localização</Button></div>
        </div>
      ) : (
        <div className="stack">
          <Button busy={gps === 'locating'} onClick={() => setGps('asking')}><LocateFixed size={16} aria-hidden />{gps === 'locating' ? 'Localizando' : 'Usar minha localização'}</Button>
          <Field id="picker-q" label="Procurar bairro ou rua" hint="Tente “Boa V” ou “Casa”, e veja a confirmação de nomes parecidos.">
            <input id="picker-q" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </Field>
          {q.length >= 2 && (results.length ? (
            <ul className="pick-list">
              {results.map((c) => (
                <li key={c.key}><button type="button" onClick={() => choose(c)}><strong>{c.label}</strong><span className={`kind kind-${c.kind}`}>{c.kind === 'bairro' ? 'Bairro' : 'Rua'}</span><small>{c.detail}</small></button></li>
              ))}
            </ul>
          ) : <EmptyState title="Nada encontrado" text="Confira o nome ou procure por uma rua do bairro." />)}
        </div>
      )}
    </Modal>
  );
}

export { StatusSeal, InformalNotice };
