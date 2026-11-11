'use client';
// Modo Simples: feed enxuto com filtro por bairro, letras grandes e leitura em voz alta.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Headphones, LocateFixed, Megaphone, Mic, Newspaper, Pause, Play, RotateCcw, Square, Users, Volume2 } from 'lucide-react';
import { AUTHOR_ACK, canPublishRelato, CONTACT_NOTICE, relatoSpeech, TOPIC_LABEL, validateRelato } from '@/domain/rules';
import { bairroName, caseOf, entrySpeech, listedRelatos, officialFeed, programById } from '@/domain/selectors';
import type { Case, FeedEntry, Relato, RelatoDraft, Topic } from '@/domain/types';
import { act, actorId, api, setFont, setPrefs, speak, stopSpeaking, toast, useDb, useMe, useUi } from '@/store';
import { ConfirmButton } from './cards';
import { locate } from './dialogs';
import { emptyDraft } from './relato-form';
import { Button, ConfirmedSeal, Field, InformalNotice, OfficialSeal, ProgramSeal, StatusSeal, SuccessState, agoText } from './ui';
import { LiveBanner, ProfileSwitcher } from './shell-parts';

type Tab = 'noticias' | 'vizinhos' | 'contar';

/** Filtro por bairro: "Meus bairros", cada bairro seguido, "Todos" e qualquer outro pela lista. */
function BairroFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const db = useDb();
  const me = useMe();
  const chips = [...(me.followed.length ? [{ id: 'meus', label: 'Meus bairros' }] : []), ...me.followed.map((id) => ({ id, label: bairroName(db, id) })), { id: 'todos', label: 'Todos' }];
  const other = !chips.some((c) => c.id === value);
  return (
    <div className="s-filter" role="group" aria-label="Filtrar por bairro">
      <div className="s-chips">
        {chips.map((c) => <button key={c.id} type="button" className={`s-chip ${value === c.id ? 'on' : ''}`} aria-pressed={value === c.id} onClick={() => onChange(c.id)}>{c.label}</button>)}
      </div>
      <label className="s-other">
        <span>Outro bairro</span>
        <select value={other ? value : ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
          <option value="">Escolher outro bairro</option>
          {db.cities.map((city) => (
            <optgroup key={city.id} label={city.name}>
              {db.bairros.filter((b) => b.active && b.cityId === city.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}

function useScope(filter: string) {
  const me = useMe();
  if (filter === 'todos') return undefined;
  if (filter === 'meus') return me.followed.length ? me.followed : undefined;
  return [filter];
}

function newsBody(e: FeedEntry) { return e.kind === 'segment' ? e.item.summary : e.item.lead; }

function NewsSeal({ e }: { e: FeedEntry }) {
  const db = useDb();
  if (e.kind === 'segment') return <ProgramSeal name={programById(db, e.item.programId)?.name ?? 'Telejornal'} />;
  return e.item.originRelatoId ? <ConfirmedSeal /> : <OfficialSeal />;
}

function ListenBig({ id, text, label = 'Ouvir' }: { id: string; text: string; label?: string }) {
  const { speaking } = useUi();
  const on = speaking?.id === id;
  return (
    <Button big variant={on ? 'primary' : 'outline'} className="s-listen" aria-pressed={on} onClick={() => speak(id, text)}>
      {on ? <Square size={24} aria-hidden /> : <Volume2 size={24} aria-hidden />}{on ? (speaking?.loading ? 'Preparando' : 'Parar') : label}
    </Button>
  );
}

const CASE_WORD = { problema: 'ainda sem solução', andamento: 'em andamento', resolvido: 'resolvido' } as const;
/** Situação do problema, em palavras simples (o caso segue só as notícias oficiais). */
const caseLine = (c?: Case) => (c ? (c.reopened ? 'Situação do problema: voltou a acontecer.' : `Situação do problema: ${CASE_WORD[c.stage]}.`) : '');

/** Lê a lista inteira, um item por vez, passando sozinho para o próximo. */
function Sequence({ items, start, onClose }: { items: { id: string; title: string; place: string; seal: React.ReactNode; text: string; speech: string; relato?: Relato; status?: string }[]; start: number; onClose: () => void }) {
  const { speaking } = useUi();
  const [i, setI] = useState(start);
  const [auto, setAuto] = useState(true);
  const it = items[Math.min(i, items.length - 1)];
  const play = (k: number) => {
    const x = items[k];
    if (!x) return;
    setI(k);
    speak(x.id, x.speech, { restart: true, onEnd: () => { if (auto && k + 1 < items.length) setTimeout(() => play(k + 1), 600); } });
  };
  const on = speaking?.id === it?.id;
  if (!it) return null;
  return (
    <section className="s-seq" aria-label="Ouvir em sequência">
      <div className="row between"><p className="s-pos" aria-live="polite">{i + 1} de {items.length}</p><Button big onClick={() => { stopSpeaking(); onClose(); }}>Voltar à lista</Button></div>
      <article className={`s-card ${it.relato ? 's-relato' : ''}`}>
        {it.relato && <InformalNotice />}
        <div className="post-meta">{it.seal}</div>
        <p className="s-place">{it.place}</p>
        <h2>{it.title}</h2>
        <p className="s-text">{it.text}</p>
        {it.status && <p className="s-case">{it.status}</p>}
        {it.relato && it.relato.status !== 'falso' && <ConfirmButton relato={it.relato} big />}
      </article>
      <div className="s-controls">
        <Button big variant="primary" className="s-main" aria-pressed={on} onClick={() => (on ? stopSpeaking() : play(i))}>{on ? <Pause size={30} aria-hidden /> : <Play size={30} aria-hidden />}{on ? 'Pausar' : 'Ouvir'}</Button>
        <div className="s-nav">
          <Button big onClick={() => play(i)}><RotateCcw size={24} aria-hidden />Repetir</Button>
          <Button big disabled={i >= items.length - 1} onClick={() => play(i + 1)}>Próxima<ChevronRight size={24} aria-hidden /></Button>
        </div>
        <div className="s-nav">
          <Button big disabled={i === 0} onClick={() => play(i - 1)}><ChevronLeft size={24} aria-hidden />Anterior</Button>
          <label className="check s-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Passar sozinho</label>
        </div>
      </div>
    </section>
  );
}

function NewsFeed({ filter, jump }: { filter: string; jump: string | null }) {
  const db = useDb();
  const scope = useScope(filter);
  const feed = useMemo(() => officialFeed(db, scope).slice(0, 60), [db, scope]);
  const [seq, setSeq] = useState<number | null>(null);
  const [usedJump, setUsedJump] = useState(false);
  const jumpIndex = jump && !usedJump ? feed.findIndex((e) => e.item.id === jump) : -1;
  const items = feed.map((e) => { const status = caseLine(caseOf(db, e.kind, e.item.id)); return {
    status, id: `simple:${e.kind}:${e.item.id}`, title: e.item.title, place: e.item.bairroIds.map((b) => bairroName(db, b)).join(' e '), seal: <><NewsSeal e={e} /><span className="s-when">{agoText(e.at)}</span></>,
    text: newsBody(e), speech: `${entrySpeech(e, e.kind === 'segment' ? programById(db, e.item.programId)?.name : undefined)}${status ? ` ${status}` : ''}`,
  }; });
  const startAt = seq ?? (jumpIndex >= 0 ? jumpIndex : null);
  if (startAt !== null && items.length) return <Sequence key={startAt} items={items} start={startAt} onClose={() => { setSeq(null); setUsedJump(true); }} />;
  if (!items.length) return <p className="s-text s-empty">Ainda não há notícias deste bairro. Escolha “Todos” para ver as outras.</p>;
  return (
    <>
      <Button big variant="primary" className="s-all" onClick={() => setSeq(0)}><Headphones size={28} aria-hidden />Ouvir todas, uma por vez</Button>
      <ul className="s-list">
        {items.map((it, k) => (
          <li key={it.id} className="s-item">
            <div className="post-meta">{it.seal}</div>
            <p className="s-place">{it.place}</p>
            <h2>{it.title}</h2>
            <p className="s-text s-clip">{it.text}</p>
            {it.status && <p className="s-case">{it.status}</p>}
            <div className="s-item-acts"><ListenBig id={it.id} text={it.speech} /><Button big onClick={() => setSeq(k)}>Abrir</Button></div>
          </li>
        ))}
      </ul>
    </>
  );
}

function NeighborsFeed({ filter }: { filter: string }) {
  const db = useDb();
  const scope = useScope(filter);
  const list = listedRelatos(db, scope).slice(0, 40);
  const [seq, setSeq] = useState<number | null>(null);
  const items = list.map((r) => ({
    id: `simple:relato:${r.id}`, title: r.title, place: bairroName(db, r.bairroId), relato: r,
    seal: <><StatusSeal status={r.status} /><span className="s-when">{agoText(r.createdAt)}</span></>, text: r.description, speech: relatoSpeech(r, bairroName(db, r.bairroId)),
  }));
  if (seq !== null && items.length) return <Sequence key={seq} items={items} start={seq} onClose={() => setSeq(null)} />;
  return (
    <>
      <div className="s-warn"><InformalNotice /></div>
      {!items.length ? <p className="s-text s-empty">Nenhum relato dos vizinhos neste filtro.</p> : (
        <ul className="s-list">
          {items.map((it, k) => (
            <li key={it.id} className="s-item s-relato">
              <InformalNotice />
              <div className="post-meta">{it.seal}</div>
              <p className="s-place">{it.place}</p>
              <h2>{it.title}</h2>
              <p className="s-text s-clip">{it.text}</p>
              <ConfirmButton relato={it.relato} big />
              <div className="s-item-acts"><ListenBig id={it.id} text={it.speech} /><Button big onClick={() => setSeq(k)}>Abrir</Button></div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const CATS: Topic[] = ['alagamento', 'transito', 'obras', 'agua', 'seguranca', 'saude'];

function Report({ onExit }: { onExit: () => void }) {
  const db = useDb();
  const me = useMe();
  const [step, setStep] = useState(1);
  const [d, setD] = useState<RelatoDraft>(() => emptyDraft(me.followed[0] ?? me.bairroId ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = <K extends keyof RelatoDraft>(k: K, v: RelatoDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const verdict = canPublishRelato(me);
  if (!verdict.ok) return <p className="s-text">{verdict.reason}</p>;
  if (done) return <SuccessState title="Recebemos o que você viu" text="Seu relato aparece como não verificado até um jornalista conferir."><Button big variant="primary" onClick={onExit}>Voltar ao início</Button></SuccessState>;

  const dictate = () => {
    type Rec = { lang: string; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onerror: () => void; onend: () => void; start: () => void };
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    setListening(true);
    const fallback = () => { setD((p) => ({ ...p, title: p.title || 'Água subindo na minha rua', description: 'Choveu forte e a água já está chegando na porta das casas da minha rua.' })); setListening(false); toast('Fala simulada: confira o texto.', 'info'); };
    if (!Ctor) { setTimeout(fallback, 900); return; }
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.onresult = (e) => { const t = e.results[0][0].transcript; setD((p) => ({ ...p, description: t, title: p.title || t.slice(0, 60) })); };
    rec.onerror = fallback;
    rec.onend = () => setListening(false);
    rec.start();
  };
  const groups: Record<number, (keyof RelatoDraft)[]> = { 1: ['title', 'category', 'description'], 2: ['bairroId', 'street', 'reference'], 3: ['fullName', 'age', 'phone', 'address', 'ackUnverified'] };
  const next = async () => {
    const all = validateRelato(d);
    const errs = Object.fromEntries(Object.entries(all).filter(([k]) => groups[step].includes(k as keyof RelatoDraft)));
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (step < 3) { setStep(step + 1); return; }
    setBusy(true);
    const ok = await act(() => api.createRelato(actorId(), d).then(() => true));
    setBusy(false);
    if (ok) setDone(true);
  };
  const txt = (k: 'title' | 'street' | 'reference' | 'fullName' | 'age' | 'phone' | 'address', label: string) => (
    <Field id={`s-${k}`} label={label} error={errors[k]}><input id={`s-${k}`} value={d[k]} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  return (
    <div className="s-card">
      <p className="s-step" aria-live="polite">Passo {step} de 3</p>
      <div className="s-progress" aria-hidden><i style={{ width: `${(step / 3) * 100}%` }} /></div>
      {step === 1 && <>
        <h2>O que você viu?</h2>
        <Button big variant={listening ? 'primary' : 'outline'} busy={listening} onClick={dictate}><Mic size={26} aria-hidden />{listening ? 'Ouvindo' : 'Falar em vez de escrever'}</Button>
        {txt('title', 'Dê um título')}
        <Field id="s-desc" label="Conte o que aconteceu" error={errors.description}><textarea id="s-desc" rows={4} value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <fieldset className="s-cats"><legend>Sobre o que é?</legend>{CATS.map((c) => <button key={c} type="button" aria-pressed={d.category === c} className={`btn btn-big ${d.category === c ? 'sel' : 'btn-outline'}`} onClick={() => set('category', c)}>{TOPIC_LABEL[c]}</button>)}</fieldset>
        {errors.category && <small className="err" role="alert">{errors.category}</small>}
      </>}
      {step === 2 && <>
        <h2>Onde foi?</h2>
        <Button big onClick={async () => { const loc = await locate(db.bairros); if (!loc.bairro) { toast('Não achamos um bairro perto de você. Escolha na lista.', 'info'); return; } setD((p) => ({ ...p, bairroId: loc.bairro!.id, pin: { lat: loc.lat, lng: loc.lng } })); toast(loc.simulated ? `Sem GPS: usamos um ponto de exemplo em ${loc.bairro.name}.` : `Você está perto de ${loc.bairro.name}.`, 'info'); }}><LocateFixed size={26} aria-hidden />Usar minha localização</Button>
        <Field id="s-bairro" label="Bairro" error={errors.bairroId}><select id="s-bairro" value={d.bairroId} onChange={(e) => set('bairroId', e.target.value)}><option value="">Escolha</option>{db.bairros.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        {txt('street', 'Rua')}{txt('reference', 'Ponto de referência')}
      </>}
      {step === 3 && <>
        <h2>Seus dados</h2>
        <p className="contact-notice">{CONTACT_NOTICE}</p>
        {txt('fullName', 'Nome completo')}{txt('age', 'Idade')}{txt('phone', 'Telefone ou WhatsApp')}{txt('address', 'Endereço')}
        <label className="check"><input type="checkbox" checked={d.acceptsContact} onChange={(e) => set('acceptsContact', e.target.checked)} />Aceito ser procurado por um repórter.</label>
        <label className="check check-ack"><input type="checkbox" checked={d.ackUnverified} onChange={(e) => set('ackUnverified', e.target.checked)} />{AUTHOR_ACK}</label>
        {errors.ackUnverified && <small className="err" role="alert">{errors.ackUnverified}</small>}
      </>}
      <div className="s-nav">
        <Button big onClick={() => (step === 1 ? onExit() : setStep(step - 1))}><ChevronLeft size={24} aria-hidden />Voltar</Button>
        <Button big variant="primary" busy={busy} onClick={next}>{step === 3 ? 'Enviar' : 'Continuar'}<ChevronRight size={24} aria-hidden /></Button>
      </div>
    </div>
  );
}

export function SimpleMode() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>('noticias');
  const [filter, setFilter] = useState(me.followed.length ? 'meus' : 'todos');
  const [jump, setJump] = useState<string | null>(null);
  const go = (t: Tab) => { stopSpeaking(); setJump(null); setTab(t); window.scrollTo(0, 0); };
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'noticias', label: 'Notícias', icon: <Newspaper size={26} aria-hidden /> },
    { id: 'vizinhos', label: 'Vizinhos', icon: <Users size={26} aria-hidden /> },
    { id: 'contar', label: 'Contar o que vi', icon: <Megaphone size={26} aria-hidden /> },
  ];
  return (
    <div className="simple">
      <header className="s-top">
        <span className="brand-sm">Amigo da Vizinhança</span>
        <div className="s-top-acts">
          <Button big aria-label="Aumentar a letra" onClick={() => setFont(0.1)}>A+<span className="s-top-hint">Letra maior</span></Button>
          <Button big onClick={() => { stopSpeaking(); setPrefs({ simple: false }); }}>Modo completo</Button>
        </div>
      </header>
      <nav className="s-tabs" aria-label="Seções">
        {TABS.map((t) => <button key={t.id} type="button" className={`s-tab ${tab === t.id ? 'on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>{t.icon}<span>{t.label}</span></button>)}
      </nav>
      <main id="conteudo" className="s-main-area">
        {tab !== 'contar' && <BairroFilter value={filter} onChange={(v) => { stopSpeaking(); setJump(null); setFilter(v); }} />}
        {tab === 'noticias' && <NewsFeed key={filter} filter={filter} jump={jump} />}
        {tab === 'vizinhos' && <NeighborsFeed key={filter} filter={filter} />}
        {tab === 'contar' && <Report onExit={() => go('noticias')} />}
      </main>
      <LiveBanner onOpen={(id) => { stopSpeaking(); setFilter('todos'); setTab('noticias'); setJump(id); window.scrollTo(0, 0); }} />
      <div className="s-profile"><ProfileSwitcher /></div>
    </div>
  );
}
