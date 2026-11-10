'use client';
// Resumo do dia de um bairro. Mostra na hora o resumo automático e troca pelo da IA quando ele chega.
import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { activeAlerts, bairroName, dailySummary, officialFeed } from '@/domain/selectors';
import { api, useDb } from '@/store';
import { ListenButton } from './cards';

interface Day { bullets: string[]; engine: 'ia' | 'automatico'; model?: string; note?: string }

export function DaySummary({ bairroId, title, picker }: { bairroId: string; title?: string; picker?: React.ReactNode }) {
  const db = useDb();
  const name = bairroName(db, bairroId);
  const local = dailySummary(db, bairroId);
  // Refaz quando entram notícias ou alertas novos no bairro (ex.: telejornal ao vivo).
  const version = `${bairroId}:${officialFeed(db, [bairroId]).length}:${activeAlerts(db, [bairroId]).length}`;
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.daySummary(bairroId).then((d) => { if (alive) setDay(d); }, () => { if (alive) setDay(null); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [version, bairroId]);

  const bullets = day?.bullets ?? local;
  const ai = day?.engine === 'ia';
  return (
    <section className="summary" aria-labelledby={`sum-${bairroId}`} aria-busy={loading}>
      <div className="row between">
        <h2 id={`sum-${bairroId}`}>{title ?? `Resumo do dia de ${name}`}</h2>
        {picker}
      </div>
      <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
      <div className="row between">
        <small className="ai-note">
          {loading ? <><Loader2 size={14} className="spin" aria-hidden />Gerando o resumo com IA...</>
            : ai ? <><Sparkles size={14} aria-hidden />Resumo feito por IA a partir das notícias e alertas oficiais. Pode conter erros: confira nas matérias.</>
              : <>Resumo automático a partir das notícias e alertas oficiais.{day?.note ? ` ${day.note}` : ''}</>}
        </small>
        <ListenButton id={`summary:${bairroId}`} label="Ouvir resumo do bairro" text={`Resumo do dia de ${name}. ${bullets.join(' ')}`} />
      </div>
    </section>
  );
}
