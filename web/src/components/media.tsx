'use client';
import { useMemo, useState } from 'react';
import { Camera, Mic, Play, Video } from 'lucide-react';
import { TOPIC_LABEL } from '@/domain/rules';
import type { MediaAttachment, Topic } from '@/domain/types';

const SCENES: Record<Topic, [string, string, string]> = {
  alagamento: ['#3d5a78', '#22384f', '#7fb4d8'], agua: ['#3f7fa1', '#245068', '#a9dcf0'], obras: ['#c98a2b', '#6d4a18', '#f2c46d'],
  transito: ['#6b6f85', '#373a4d', '#f0a23a'], seguranca: ['#404a75', '#232a4d', '#a2b0ef'], vacinacao: ['#3d9486', '#1d5a50', '#b3ece0'],
  geral: ['#5b6b82', '#2f3a4c', '#c9d3e2'],
  saude: ['#4f9d82', '#27604d', '#bdeeda'], educacao: ['#8b6bb5', '#4e3a70', '#d9c7f2'], cultura: ['#c24d6d', '#6e2439', '#f7bccb'],
  comercio: ['#b26a3b', '#673a1d', '#f0c9a8'], transporte: ['#47789b', '#29475f', '#bcdcf2'], 'meio-ambiente': ['#4d8a4a', '#2a5428', '#c0e8ad'],
};
function hash(s: string) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/** Ilustração gerada por tema. Substitui fotos reais até haver acervo licenciado. */
export function PostImage({ topic, seed, program, play, live, src, alt }: { topic: Topic; seed: string; program?: string; play?: boolean; live?: boolean; src?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <div className="post-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        {program && <span className="still-tag">{live && <b className="live-dot" />}{program}</span>}
      </div>
    );
  }
  return <Illustration topic={topic} seed={seed} program={program} play={play} live={live} />;
}

function Illustration({ topic, seed, program, play, live }: { topic: Topic; seed: string; program?: string; play?: boolean; live?: boolean }) {
  const [sky, ground, accent] = SCENES[topic];
  const blocks = useMemo(() => {
    let h = hash(seed);
    const next = (m: number) => { h = (h * 1103515245 + 12345) >>> 0; return h % m; };
    let x = -10; const out: { x: number; w: number; h: number }[] = [];
    while (x < 620) { const w = 38 + next(46); out.push({ x, w, h: 50 + next(110) }); x += w + next(9); }
    return out;
  }, [seed]);
  const rain = topic === 'alagamento' || topic === 'agua';
  const cones = topic === 'obras' || topic === 'transito';
  return (
    <div className="post-img">
      <svg viewBox="0 0 600 250" role="img" aria-label={`Ilustração de exemplo sobre ${TOPIC_LABEL[topic]}`} preserveAspectRatio="xMidYMid slice">
        <rect width="600" height="250" fill={sky} />
        <circle cx={120 + (hash(seed) % 360)} cy="62" r="34" fill={accent} opacity=".85" />
        {blocks.map((b, i) => <rect key={i} x={b.x} y={205 - b.h} width={b.w} height={b.h} fill={ground} opacity={i % 2 ? 0.92 : 0.72} />)}
        <rect y="200" width="600" height="50" fill={ground} />
        {rain && Array.from({ length: 34 }, (_, i) => <line key={i} x1={(i * 53) % 600} y1={(i * 37) % 170} x2={((i * 53) % 600) - 7} y2={((i * 37) % 170) + 26} stroke={accent} strokeWidth="2.5" opacity=".6" />)}
        {rain && <path d="M0 218 Q75 205 150 218 T300 218 T450 218 T600 218 V250 H0Z" fill={accent} opacity=".75" />}
        {cones && [90, 210, 330, 450].map((x) => <g key={x}><path d={`M${x} 232 L${x + 18} 186 L${x + 36} 232Z`} fill={accent} /><rect x={x - 6} y="230" width="48" height="7" fill={accent} /></g>)}
      </svg>
      {play && <span className="play-mark" aria-hidden><Play size={24} fill="currentColor" /></span>}
      {program && <span className="still-tag">{live && <b className="live-dot" />}{program}</span>}
      <span className="img-note">Imagem de exemplo</span>
    </div>
  );
}

export function MediaMock({ media }: { media: MediaAttachment }) {
  const Icon = media.type === 'foto' ? Camera : media.type === 'video' ? Video : Mic;
  return <div className="media-mock"><Icon size={18} aria-hidden />Anexo do morador ({media.type}, simulado): {media.name}</div>;
}

