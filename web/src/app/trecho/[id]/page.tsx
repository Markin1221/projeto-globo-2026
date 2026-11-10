'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Captions, Eye, Pause, Play } from 'lucide-react';
import { BairroChips, ListenButton, SaveButton } from '@/components/cards';
import { CaseInline } from '@/components/case-progress';
import { Comments } from '@/components/comments';
import { PostImage } from '@/components/media';
import { PageHeader } from '@/components/shell-parts';
import { fmtClock, fmtDate, NotFoundState, PageState, ProgramSeal } from '@/components/ui';
import { detectBairros, TOPIC_LABEL } from '@/domain/rules';
import { bairroName, isHidden, programById } from '@/domain/selectors';
import type { Segment } from '@/domain/types';
import { usePageLoad, useDb } from '@/store';

function Player({ s, program, t, setT }: { s: Segment; program: string; t: number; setT: (v: number | ((x: number) => number)) => void }) {
  const [playing, setPlaying] = useState(false);
  const [cc, setCc] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const i = setInterval(() => setT((x) => { if (x + 1 >= s.durationSec) { setPlaying(false); return s.durationSec; } return x + 1; }), 1000);
    return () => clearInterval(i);
  }, [playing, s.durationSec, setT]);
  const caption = [...s.transcript].reverse().find((l) => l.t <= t);
  return (
    <div className="player">
      <PostImage topic={s.topic} seed={s.id} program={program} live={s.live} />
      {cc && caption && <p className="captions">{caption.text}</p>}
      <div className="player-bar">
        <button type="button" className="icon-btn" aria-label={playing ? 'Pausar' : 'Reproduzir'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />}</button>
        <span className="clock">{fmtClock(t)} / {fmtClock(s.durationSec)}</span>
        <input type="range" aria-label="Posição do vídeo" min={0} max={s.durationSec} value={t} onChange={(e) => setT(Number(e.target.value))} />
        <button type="button" className={`icon-btn ${cc ? 'sel' : ''}`} aria-pressed={cc} aria-label="Legenda" onClick={() => setCc(!cc)}><Captions size={20} aria-hidden /></button>
      </div>
      <p className="player-note">Player simulado. Vídeo real entra com o acervo da emissora.</p>
    </div>
  );
}

export default function SegmentPage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { state, retry } = usePageLoad(`trecho-${id}`);
  const [t, setT] = useState(0);
  const s = db.segments.find((x) => x.id === id);
  const names = useMemo(() => db.bairros.flatMap((b) => [b.name, ...b.aliases]), [db.bairros]);
  if (!s || isHidden(db, `segment:${id}`)) return <><PageHeader title="Trecho" back /><NotFoundState what="Trecho" /></>;
  const program = programById(db, s.programId)?.name ?? 'Telejornal';
  const current = [...s.transcript].reverse().find((l) => l.t <= t);
  const pattern = new RegExp(`(${names.join('|')})`, 'g');
  const speech = `${program}. ${s.title}. ${s.summary}. O que muda para você: ${s.whatChanges.join(' ')}`;
  return (
    <>
      <PageHeader title="Trecho do telejornal" back />
      <PageState state={state} retry={retry} rows={2}>
        <article className="detail">
          <div className="post-meta"><ProgramSeal name={program} />{s.live && <span className="seal seal-live"><b className="live-dot" />Ao vivo</span>}<span className="muted">{fmtDate(s.airedAt)}</span><span className="muted">{TOPIC_LABEL[s.topic]}</span><span className="sample">Exemplo</span></div>
          <h2 className="detail-title">{s.title}</h2>
          <BairroChips ids={s.bairroIds} />
          <Player s={s} program={program} t={t} setT={setT} />
          <div className="actions"><ListenButton id={`segment:${s.id}`} text={speech} /><SaveButton target={`segment:${s.id}`} /></div>
          <section><h3>Resumo</h3><p>{s.summary}</p></section>
          <CaseInline kind="segment" id={s.id} bairroIds={s.bairroIds} />
          <section className="changes"><h3>O que muda para você</h3><ul>{s.whatChanges.map((w) => <li key={w}>{w}</li>)}</ul></section>
          <section>
            <h3>Transcrição automática</h3>
            <p className="muted">Gerada por reconhecimento de fala (Whisper, simulado). Toque em um trecho para ir àquele momento. Serve também como legenda para pessoas surdas.</p>
            <ol className="transcript" aria-live={s.live ? 'polite' : undefined}>
              {s.transcript.map((l) => {
                const hits = detectBairros(l.text, db.bairros);
                return (
                  <li key={l.t} className={current === l ? 'cur' : ''}>
                    <button type="button" onClick={() => setT(l.t)} aria-current={current === l ? 'true' : undefined}>
                      <time>{fmtClock(l.t)}</time>
                      <span><b>{l.speaker}</b> {l.text.split(pattern).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}
                        {hits.some((h) => h.kind === 'rua') && <small className="rua-note">Nome de via, não conta como citação do bairro {bairroName(db, hits.find((h) => h.kind === 'rua')!.bairroId)}.</small>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          <section className="ad"><h3><Eye size={18} aria-hidden />Audiodescrição</h3><ul>{s.audioDescription.map((a) => <li key={a}>{a}</li>)}</ul><ListenButton id={`ad:${s.id}`} label="Ouvir audiodescrição" text={s.audioDescription.join(' ')} /></section>
        </article>
        <Comments target={`segment:${s.id}`} />
      </PageState>
    </>
  );
}
