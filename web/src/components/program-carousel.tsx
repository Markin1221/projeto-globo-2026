'use client';
// Carrossel de trechos de um telejornal: os mais recentes lado a lado, deslizando no celular.
import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { bairroName } from '@/domain/selectors';
import type { Program, Segment } from '@/domain/types';
import { useDb } from '@/store';
import { agoText } from './ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function SegmentSlide({ s }: { s: Segment }) {
  const db = useDb();
  return (
    <li className="slide">
      <Link href={`/trecho/${s.id}`} className="slide-link">
        <p className="slide-meta">{s.live ? <span className="live-chip"><b className="live-dot" />Ao vivo</span> : <span>{agoText(s.airedAt)}</span>}<span>{mmss(s.durationSec)}</span></p>
        <h3>{s.title}</h3>
        <p className="slide-text">{s.summary}</p>
        <p className="slide-place"><MapPin size={13} aria-hidden />{s.bairroIds.map((b) => bairroName(db, b)).join(', ')}</p>
      </Link>
    </li>
  );
}

export function ProgramCarousel({ program, segments, max = 8 }: { program: Program; segments: Segment[]; max?: number }) {
  const track = useRef<HTMLUListElement>(null);
  const move = (dir: 1 | -1) => { const el = track.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' }); };
  const list = segments.slice(0, max);
  const id = `prog-${program.id}`;
  return (
    <section className="carousel" aria-labelledby={id}>
      <div className="carousel-head">
        <div>
          <h2 id={id}>{program.name}</h2>
          <p className="muted">{program.schedule}</p>
        </div>
        <div className="carousel-ctrl">
          <button type="button" className="icon-btn" aria-label={`Trechos anteriores do ${program.name}`} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden /></button>
          <button type="button" className="icon-btn" aria-label={`Próximos trechos do ${program.name}`} onClick={() => move(1)}><ChevronRight size={20} aria-hidden /></button>
        </div>
      </div>
      {list.length
        ? <ul className="carousel-track" ref={track} tabIndex={0} aria-label={`Trechos do ${program.name}`}>{list.map((s) => <SegmentSlide key={s.id} s={s} />)}</ul>
        : <p className="muted carousel-empty">Nenhum trecho deste programa ainda.</p>}
      {segments.length > 0 && <Link className="btn btn-outline carousel-all" href={`/telejornais/${program.id}`}>Ver todas as notícias do {program.name} ({segments.length})</Link>}
    </section>
  );
}
