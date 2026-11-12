'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleHelp, Moon, Radio, Sun, X, Contrast, ListChecks } from 'lucide-react';
import { detectBairros, ROLE_LABEL } from '@/domain/rules';
import { activeAlerts, bairroName, programById, trendingBairros, trendingTopics } from '@/domain/selectors';
import { act, api, dismissLive, dismissToast, setFont, setGuideOpen, setPrefs, startLiveDemo, stopSpeaking, switchProfile, toast, useDb, useMe, useUi, type Theme } from '@/store';
import { AlertRow } from './cards';
import { Avatar, Button, Modal } from './ui';

export function ModeToggle() {
  const { prefs } = useUi();
  return (
    <label className="mode-toggle">
      <input type="checkbox" role="switch" checked={prefs.simple} onChange={(e) => { stopSpeaking(); setPrefs({ simple: e.target.checked }); }} />
      <span className="switch" aria-hidden /><span>Modo <span className="hide-sm">Simples</span><span className="show-sm">simples</span></span>
    </label>
  );
}

export const NEXT_THEME: Record<Theme, Theme> = { dark: 'light', light: 'contrast', contrast: 'dark' };
export const THEME_LABEL: Record<Theme, string> = { dark: 'escuro', light: 'claro', contrast: 'alto contraste' };

// O título permanece disponível para leitores de tela, sem repetir a navegação visual.
export function PageHeader({ title, back, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const router = useRouter();
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {(back || right) && <div className="page-context-actions">
        {back && <button type="button" className="icon-btn" aria-label="Voltar" onClick={() => router.back()}><ArrowLeft size={20} aria-hidden /></button>}
        {right && <div className="page-extra">{right}</div>}
      </div>}
    </>
  );
}

export function ProfileSwitcher() {
  const db = useDb();
  const me = useMe();
  const users = db.users.filter((u) => !u.deleted);
  if (!db.meta.demoMode) return null;
  return (
    <div className="profile-switch">
      <label htmlFor="demo-profile">Ver o app como</label>
      <select id="demo-profile" value={me.handle} onChange={(e) => switchProfile(e.target.value)}>
        <option value="visitante">Visitante (sem conta)</option>
        {users.map((u) => <option key={u.id} value={u.handle}>{u.name} ({ROLE_LABEL[u.role]})</option>)}
      </select>
    </div>
  );
}

export function SimulateLiveButton({ full }: { full?: boolean }) {
  const db = useDb();
  const running = !!db.live && !db.live.finished;
  if (!db.meta.demoMode) return null;
  return <Button variant="primary" className={full ? 'w100' : ''} disabled={running} onClick={startLiveDemo}><Radio size={16} aria-hidden />{running ? 'Telejornal no ar' : 'Simular telejornal ao vivo'}</Button>;
}

function highlight(text: string, names: string[]) {
  const pattern = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return text.split(new RegExp(`(${pattern})`, 'gi')).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

/** Tarja do telejornal ao vivo. Vira um carrossel: primeiro o trecho no ar, depois as outras notícias do mesmo telejornal. */
export function LiveBanner({ onOpen }: { onOpen?: (segmentId: string) => void }) {
  const db = useDb();
  const me = useMe();
  const { dismissedLive } = useUi();
  const live = db.live;
  const [, tick] = useState(0);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // Depois que o telejornal termina, a tarja fica 90 s na tela; o aviso continua nas notificações.
  useEffect(() => { if (!live?.finishedAt) return; const t = setTimeout(() => tick((x) => x + 1), Math.max(0, live.finishedAt + 90000 - Date.now()) + 50); return () => clearTimeout(t); }, [live?.finishedAt]);
  const others = live ? db.segments.filter((s) => s.programId === live.programId && s.id !== live.segmentId).sort((a, b) => b.airedAt - a.airedAt).slice(0, 5) : [];
  // No Modo Simples a tarja continua com um cartão só (menos coisa na tela).
  const count = onOpen ? 1 : 1 + others.length;
  // Passa sozinho a cada 7 s, menos com o mouse ou o foco em cima, ou com "reduzir movimento" ligado.
  useEffect(() => {
    if (count < 2 || paused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % count), 7000);
    return () => clearTimeout(t);
  }, [i, count, paused]);
  useEffect(() => { setI(0); }, [live?.segmentId]);
  if (!live?.detectedAt || dismissedLive === live.segmentId) return null;
  if (live.finishedAt && Date.now() - live.finishedAt > 90000) return null;
  const name = bairroName(db, live.bairroId);
  const program = programById(db, live.programId)?.name ?? 'Telejornal';
  const line = live.lines[live.shown - 1]?.text ?? '';
  const personal = me.followed.includes(live.bairroId);
  const cur = Math.min(i, count - 1);
  const other = cur > 0 ? others[cur - 1] : null;
  const go = (d: number) => setI((x) => (x + d + count) % count);
  return (
    <div className="tarja" role="region" aria-roledescription="carrossel" aria-label={`Notícias do ${program}`}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="tarja-program"><span className="live-chip"><b className="live-dot" />{live.finished ? 'Exibido' : 'Ao vivo'}</span><strong>{program}</strong></div>
      <div className="tarja-body" key={cur} aria-live={paused ? 'polite' : 'off'}>
        {other ? (
          <>
            <p className="tarja-kicker">Também no {program}, {bairroNames(db, other.bairroIds)}</p>
            <p className="tarja-title tarja-title-sm">{other.title}</p>
          </>
        ) : (
          <>
            <p className="tarja-title" role="alert">{personal ? 'Seu bairro está no ar agora' : `${name} está no ar agora`}: {name}</p>
            <p className="tarja-line" key={live.shown}>{highlight(line, [name])}</p>
          </>
        )}
        {count > 1 && (
          <div className="tarja-dots" role="group" aria-label="Escolher notícia">
            {Array.from({ length: count }, (_, k) => <button key={k} type="button" className={k === cur ? 'on' : ''} aria-label={`Notícia ${k + 1} de ${count}`} aria-current={k === cur ? 'true' : undefined} onClick={() => setI(k)} />)}
          </div>
        )}
      </div>
      <div className="tarja-acts">
        {count > 1 && <button type="button" className="icon-btn" aria-label="Notícia anterior" onClick={() => go(-1)}><ChevronLeft size={18} aria-hidden /></button>}
        {count > 1 && <button type="button" className="icon-btn" aria-label="Próxima notícia" onClick={() => go(1)}><ChevronRight size={18} aria-hidden /></button>}
        {onOpen ? <button type="button" className="tarja-link" onClick={() => onOpen(live.segmentId)}>Ouvir agora</button>
          : <Link className="tarja-link" href={`/trecho/${other ? other.id : live.segmentId}`}>Ver o trecho</Link>}
        {!onOpen && <Link className="tarja-all" href={`/telejornais/${live.programId}`}>Todas do {program}</Link>}
        <button type="button" className="icon-btn" aria-label="Fechar alerta" onClick={() => dismissLive(live.segmentId)}><X size={18} aria-hidden /></button>
      </div>
    </div>
  );
}
const bairroNames = (db: ReturnType<typeof useDb>, ids: string[]) => ids.map((b) => bairroName(db, b)).join(' e ');

export function Toasts() {
  const { toasts } = useUi();
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}><span>{t.text}</span><button type="button" aria-label="Fechar aviso" onClick={() => dismissToast(t.id)}><X size={15} aria-hidden /></button></div>)}</div>;
}

export function SpeechBar() {
  const { speaking } = useUi();
  if (!speaking) return null;
  return (
    <div className="speech-bar" role="status">
      <span className="eq" aria-hidden><i /><i /><i /></span>
      <p><strong>Lendo em voz alta:</strong> {speaking.text}</p>
      <button type="button" className="icon-btn" aria-label="Parar leitura" onClick={stopSpeaking}><X size={18} aria-hidden /></button>
    </div>
  );
}

export function RightRail() {
  const db = useDb();
  const me = useMe();
  const live = db.live;
  const alerts = activeAlerts(db, me.followed.length ? me.followed : undefined).slice(0, 3);
  return (
    <aside className="rail" aria-label="Destaques">
      <section className="rail-box on-air" aria-labelledby="onair">
        <h2 id="onair"><Radio size={18} aria-hidden />No ar agora</h2>
        {live && !live.finished ? (
          <div className="onair-live"><span className="live-chip"><b className="live-dot" />{programById(db, live.programId)?.name}</span><p>{live.lines[live.shown - 1]?.text}</p><Link href={`/trecho/${live.segmentId}`}>Abrir transcrição</Link>
            {detectBairros(live.lines[live.shown - 1]?.text ?? '', db.bairros).filter((d) => d.kind === 'rua').length > 0 && <small>Via com nome de bairro detectada: não gera alerta para esse bairro.</small>}
          </div>
        ) : <p className="muted">Nenhum telejornal no ar neste momento.</p>}
        <SimulateLiveButton full />
      </section>
      <section className="rail-box" aria-labelledby="ra"><h2 id="ra">Alertas</h2>{alerts.length ? alerts.map((a) => <AlertRow key={a.id} alert={a} compact />) : <p className="muted">Nenhum alerta para seus bairros.</p>}<Link className="more-link" href="/alertas">Ver todos os alertas</Link></section>
      <section className="rail-box" aria-labelledby="rt"><h2 id="rt">Em alta nos bairros</h2>
        <ol className="trend">{trendingBairros(db).slice(0, 4).map((t) => <li key={t.bairro.id}><Link href={`/bairro/${t.bairro.id}`}><strong>{t.bairro.name}</strong><small>{t.news} notícias, {t.reports} relatos</small></Link></li>)}</ol>
        <p className="topics">{trendingTopics(db).slice(0, 4).map((t) => <Link key={t.topic} href={`/busca?q=${encodeURIComponent(t.label)}`} className="chip">{t.label}</Link>)}</p>
        <Link className="more-link" href="/casos">Casos e agenda de reportagens</Link>
      </section>
    </aside>
  );
}

/** Roteiro da banca: leva a apresentação pelos 7 passos e marca o que já foi feito. */
export function DemoGuide() {
  const { guideOpen, prefs } = useUi();
  const db = useDb();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  if (!db.meta.demoMode) return null;
  const marina = db.users.find((u) => u.handle === 'marinadoalto');
  const after = db.meta.seededAt;
  const relato = db.relatos.find((r) => r.authorId === marina?.id && r.createdAt > after);
  const liveDone = db.segments.some((s) => s.airedAt > after && s.programId === 'ne2' && s.transcript.length > 1);
  const as = async (handle: string) => { if (me.handle !== handle) await switchProfile(handle); };
  const go = async (path: string, handle?: string) => { setGuideOpen(false); if (handle) await as(handle); setPrefs({ simple: false }); router.push(path); };
  const reset = async () => {
    setBusy(true);
    const ok = await act(() => api.resetDemo(), 'Dados da demonstração restaurados.');
    setBusy(false);
    if (ok) { setSeen(new Set()); await as('marinadoalto'); setPrefs({ simple: false }); setGuideOpen(false); router.push('/'); }
  };
  const visit = (key: string, path: string, handle?: string) => { setSeen((v) => new Set(v).add(key)); go(path, handle); };
  const steps: { title: string; text: string; done: boolean; action: ReactNode }[] = [
    { title: 'Seguir Casa Amarela', text: 'Marina procura o bairro e confirma entre nomes parecidos. No topo, o resumo do dia feito por IA a partir das notícias oficiais.', done: !!marina?.followed.includes('casa-amarela'), action: <Button onClick={() => go('/bairro/casa-amarela', 'marinadoalto')}>Abrir bairro</Button> },
    { title: 'Simular telejornal ao vivo', text: 'A transcrição detecta o bairro e dispara a tarja para quem segue.', done: liveDone, action: <Button variant="primary" disabled={!!db.live && !db.live.finished} onClick={async () => { setGuideOpen(false); await as('marinadoalto'); setPrefs({ simple: false }); startLiveDemo(); }}>Simular agora</Button> },
    { title: 'Morador envia relato e vizinhos confirmam', text: 'O relato nasce com o selo de que pode ser falso. Vizinhos dizem que também viram.', done: !!relato && relato.confirmations.length >= 3, action: relato ? <Button disabled={relato.confirmations.length >= 3 || relato.status !== 'enviado'} onClick={() => act(() => api.simulateNeighbors(relato.id, 3), '3 vizinhos disseram que também viram.')}>3 vizinhos confirmam</Button> : <Button onClick={() => go('/relatar', 'marinadoalto')}>Abrir formulário</Button> },
    { title: 'Relatos por assunto e resumo com IA', text: 'Relatos parecidos ficam juntos. O resumo diz o que tem no bloco e o que pode ser urgente, sempre como não verificado.', done: seen.has('assuntos'), action: <Button onClick={() => visit('assuntos', '/relatos', 'marinadoalto')}>Ver por assunto</Button> },
    { title: 'Jornalista apura e confirma', text: 'A triagem automática mostra sinais de risco e prioridade, mas quem decide é a Helena. Confirmado, vira post oficial e notifica quem segue o bairro.', done: relato?.status === 'confirmado', action: <Button onClick={() => go(relato ? `/relatos/${relato.id}` : '/jornalista', 'helenacavalcanti')}>Entrar como Helena</Button> },
    { title: 'Acompanhar o caso até a solução', text: 'Notícias do mesmo problema numa linha do tempo: o buraco foi tapado e voltou a abrir. Em Acompanhamento, a calçada da Torre mostra as três etapas.', done: seen.has('caso'), action: <Button onClick={() => visit('caso', '/casos/buraco-alto-ceu', 'marinadoalto')}>Ver o buraco da Alto do Céu</Button> },
    { title: 'Modo Simples em voz alta', text: 'O mesmo conteúdo em letras grandes, lido em voz alta, com a situação de cada problema.', done: prefs.simple, action: <Button onClick={async () => { setGuideOpen(false); await as('marinadoalto'); setPrefs({ simple: true }); }}>Abrir Modo Simples</Button> },
  ];
  const extras: { label: string; path: string; handle: string }[] = [
    { label: 'Mapa da cidade', path: '/mapa', handle: 'marinadoalto' },
    { label: 'Painel do Jornalista', path: '/jornalista', handle: 'helenacavalcanti' },
    { label: 'Admin: modelos e g1', path: '/admin', handle: 'paulonunes' },
  ];
  return (
    <>
      <button type="button" className="guide-fab" onClick={() => setGuideOpen(true)}><ListChecks size={18} aria-hidden />Roteiro<span className="hide-sm"> da banca</span></button>
      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title="Roteiro da banca">
        <ol className="guide">
          {steps.map((s, i) => <li key={s.title} className={s.done ? 'done' : ''}><span className="guide-n" aria-hidden>{s.done ? <Check size={16} /> : i + 1}</span><div><strong>{s.title}</strong>{s.done && <span className="sr-only"> (concluído)</span>}<p>{s.text}</p>{s.action}</div></li>)}
        </ol>
        <div className="guide-extras"><p className="muted">Se sobrar tempo</p><div className="row">{extras.map((x) => <Button key={x.path} onClick={() => go(x.path, x.handle)}>{x.label}</Button>)}</div></div>
        <div className="guide-reset"><p className="muted">Vai apresentar de novo? Volte tudo ao início. Isso apaga o que foi criado na demonstração para todos.</p><Button busy={busy} onClick={reset}>Restaurar dados da demo</Button></div>
      </Modal>
    </>
  );
}

export function RoleGate({ allow, children }: { allow: boolean; children: ReactNode }) {
  const me = useMe();
  if (allow) return <>{children}</>;
  return <div className="state" role="alert"><CircleHelp size={32} aria-hidden /><h2>Esta área não está disponível para {ROLE_LABEL[me.role].toLowerCase()}</h2><p>Troque o perfil em “Ver o app como” para acessar.</p><ProfileSwitcher /></div>;
}

export function UserLine() {
  const me = useMe();
  return <div className="user-line"><Avatar user={me} size={38} /><div><strong>{me.name}</strong><small>{ROLE_LABEL[me.role]}{me.blocked ? ', bloqueado' : ''}</small></div></div>;
}
