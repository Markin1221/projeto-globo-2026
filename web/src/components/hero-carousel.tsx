'use client';
// Carrossel de destaques do início: as principais notícias logo de cara, no estilo das capas da Globo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { TOPIC_LABEL } from '@/domain/rules';
import { bairroName, officialFeed, programById } from '@/domain/selectors';
import type { FeedEntry } from '@/domain/types';
import { useDb, useMe } from '@/store';
import { PostImage } from './media';

const DAY = 864e5;

/** As principais: recentes, úteis, dos bairros seguidos e com o telejornal na frente em caso de empate. */
function useHighlights(max = 6) {
  const db = useDb();
  const me = useMe();
  return useMemo(() => {
    const now = Date.now();
    const score = (e: FeedEntry) => {
      const age = (now - e.at) / DAY;
      const followed = e.item.bairroIds.some((b) => me.followed.includes(b));
      return (e.item.utility ?? 50) + Math.max(0, 40 - age * 8) + (followed ? 25 : 0) + (e.kind === 'segment' ? 4 : 0)
        // Matérias reais coletadas do g1 trazem a foto original: elas vêm primeiro no destaque.
        + (e.kind === 'article' && e.item.imageUrl ? 80 : 0);
    };
    return officialFeed(db).filter((e) => now - e.at < 14 * DAY).sort((a, b) => score(b) - score(a)).slice(0, max);
  }, [db, me.followed, max]);
}

export function HeroCarousel() {
  const db = useDb();
  const items = useHighlights();
  const n = items.length;
  // Cíclico: três cópias da lista lado a lado. A pessoa fica sempre na cópia do meio; ao parar numa
  // das pontas, o carrossel pula sem animação para o mesmo cartão no meio. Assim o primeiro também tem vizinho à esquerda.
  const loop = n > 1;
  const slides = loop ? [...items, ...items, ...items] : items;
  const track = useRef<HTMLUListElement>(null);
  const [cur, setCur] = useState(loop ? n : 0);
  const [paused, setPaused] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const offsetOf = (k: number) => {
    const el = track.current; const s = el?.children[k] as HTMLElement | undefined;
    return el && s ? s.offsetLeft - (el.clientWidth - s.clientWidth) / 2 : 0;
  };
  const goTo = useCallback((k: number, smooth = true) => {
    const el = track.current; if (!el) return;
    el.scrollTo({ left: offsetOf(k), behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Começa no primeiro cartão da cópia do meio.
  useEffect(() => { if (loop) requestAnimationFrame(() => goTo(n, false)); }, [loop, n, goTo]);

  useEffect(() => {
    const el = track.current; if (!el) return;
    const onScroll = () => {
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, dist = Infinity;
      Array.from(el.children).forEach((c, k) => { const s = c as HTMLElement; const d = Math.abs(s.offsetLeft + s.clientWidth / 2 - mid); if (d < dist) { dist = d; best = k; } });
      setCur(best);
      if (!loop) return;
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => { if (best < n || best >= 2 * n) goTo((best % n) + n, false); }, 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); if (settle.current) clearTimeout(settle.current); };
  }, [loop, n, goTo]);

  // Passa sozinho a cada 6 s, menos com o mouse/foco em cima ou com "reduzir movimento".
  useEffect(() => {
    if (paused || n < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => goTo(cur + 1), 6000);
    return () => clearTimeout(t);
  }, [cur, paused, n, goTo]);

  if (!n) return null;
  const real = cur % n;
  return (
    <section className="hero" aria-roledescription="carrossel" aria-label="Principais notícias"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <ul className="hero-track" ref={track}>
        {slides.map((e, k) => {
          const href = e.kind === 'segment' ? `/trecho/${e.item.id}` : `/materia/${e.item.id}`;
          const program = e.kind === 'segment' ? programById(db, e.item.programId)?.name : undefined;
          const img = e.kind === 'article' ? e.item.imageUrl : undefined;
          const clone = loop && (k < n || k >= 2 * n);
          return (
            <li key={`${k}-${e.kind}-${e.item.id}`} className={`hero-slide ${k === cur ? 'on' : ''}`} aria-hidden={clone || undefined} aria-roledescription={clone ? undefined : 'slide'} aria-label={clone ? undefined : `${(k % n) + 1} de ${n}`}>
              <Link href={href} className="hero-link" tabIndex={k === cur ? 0 : -1}>
                <PostImage topic={e.item.topic} seed={e.item.id} src={img} alt="" program={program} live={e.kind === 'segment' && !!e.item.live} />
                <span className="hero-shade" aria-hidden />
                <span className="hero-text">
                  <span className={`hero-chip t-${e.item.topic}`}>{program ? `${program} · ` : ''}{TOPIC_LABEL[e.item.topic]}</span>
                  <span className="hero-title"><span>{e.item.title}</span></span>
                  <span className="hero-place"><MapPin size={14} aria-hidden />{e.item.bairroIds.map((b) => bairroName(db, b)).join(', ')}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {n > 1 && <>
        <button type="button" className="hero-arrow prev" aria-label="Notícia anterior" onClick={() => goTo(cur - 1)}><ChevronLeft size={30} strokeWidth={1.6} aria-hidden /></button>
        <button type="button" className="hero-arrow next" aria-label="Próxima notícia" onClick={() => goTo(cur + 1)}><ChevronRight size={30} strokeWidth={1.6} aria-hidden /></button>
        <div className="hero-dots" role="group" aria-label="Escolher notícia">
          {items.map((_, k) => <button key={k} type="button" className={k === real ? 'on' : ''} aria-label={`Notícia ${k + 1} de ${n}`} aria-current={k === real ? 'true' : undefined} onClick={() => goTo(k + n)} />)}
        </div>
      </>}
    </section>
  );
}
