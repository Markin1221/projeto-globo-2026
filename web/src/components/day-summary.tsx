'use client';
// Resumo do dia de um bairro.
// Morador: uma chamada curta e o convite para ver o trecho do telejornal (o resumo não substitui a TV).
// Jornalista e admin: tudo o que saiu, alertas e possíveis pautas, para decidir se há matéria.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, Loader2, Newspaper, PlayCircle, Sparkles } from 'lucide-react';
import { canEditCases } from '@/domain/rules';
import { activeAlerts, bairroName, dailySummary, officialFeed } from '@/domain/selectors';
import type { DaySummaryData } from '@/domain/types';
import { api, useDb, useMe } from '@/store';
import { ListenButton } from './cards';

export function DaySummary({ bairroId, title, picker }: { bairroId: string; title?: string; picker?: React.ReactNode }) {
  const db = useDb();
  const me = useMe();
  const staff = canEditCases(me);
  const name = bairroName(db, bairroId);
  const local = dailySummary(db, bairroId);
  // Refaz quando entram notícias ou alertas novos no bairro (ex.: telejornal ao vivo) ou quando muda o perfil.
  const version = `${bairroId}:${officialFeed(db, [bairroId]).length}:${activeAlerts(db, [bairroId]).length}:${me.id}`;
  const [day, setDay] = useState<DaySummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.daySummary(bairroId).then((d) => { if (alive) setDay(d); }, () => { if (alive) setDay(null); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [version, bairroId]);

  // Enquanto a resposta não chega, o morador vê só a primeira linha do resumo local.
  const bullets = day?.bullets ?? (staff ? local : local.slice(0, 1));
  const ai = day?.engine === 'ia';
  const watchHref = day?.watch ? (day.watch.kind === 'segment' ? `/trecho/${day.watch.id}` : `/materia/${day.watch.id}`) : null;
  const heading = title ?? (staff ? `Panorama do dia de ${name}` : `Hoje em ${name}`);
  return (
    <section className={`summary ${staff ? 'summary-staff' : 'summary-teaser'}`} aria-labelledby={`sum-${bairroId}`} aria-busy={loading}>
      <div className="row between">
        <h2 id={`sum-${bairroId}`}>{heading}</h2>
        {picker}
      </div>
      {staff && <p className="muted summary-for">Versão da redação: tudo o que saiu sobre o bairro, para avaliar se há pauta.</p>}
      <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
      {staff && day?.leads && day.leads.length > 0 && (
        <div className="summary-leads">
          <h3><Lightbulb size={16} aria-hidden />Possíveis pautas</h3>
          <ul>{day.leads.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      {!staff && watchHref && day?.watch && (
        <Link href={watchHref} className="btn btn-primary summary-watch">{day.watch.kind === 'segment' ? <PlayCircle size={18} aria-hidden /> : <Newspaper size={18} aria-hidden />}{day.watch.label}</Link>
      )}
      <div className="row between">
        <small className="ai-note">
          {loading ? <><Loader2 size={14} className="spin" aria-hidden />Gerando o resumo com IA...</>
            : ai ? <><Sparkles size={14} aria-hidden />Resumo feito por IA a partir das notícias e alertas oficiais.{staff ? ' Relatos citados não foram verificados.' : ''} Pode conter erros.</>
              : <>Resumo automático a partir das notícias e alertas oficiais.{day?.note ? ` ${day.note}` : ''}</>}
        </small>
        <ListenButton id={`summary:${bairroId}`} label="Ouvir resumo do bairro" text={`${heading}. ${bullets.join(' ')}${!staff && day?.watch ? ` ${day.watch.label} no aplicativo.` : ''}`} />
      </div>
    </section>
  );
}
