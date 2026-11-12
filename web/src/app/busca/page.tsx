'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EntryCard, RelatoCard } from '@/components/cards';
import { PageHeader } from '@/components/shell-parts';
import { EmptyState, SearchGlyph, Tabs } from '@/components/ui';
import { searchPlaces, TOPIC_LABEL } from '@/domain/rules';
import { search } from '@/domain/selectors';
import { useDb } from '@/store';

export default function SearchPage() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'noticias' | 'bairros' | 'relatos'>('noticias');
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get('q') ?? '');
    const on = (e: Event) => setQ((e as CustomEvent<string>).detail);
    window.addEventListener('gv-search', on);
    return () => window.removeEventListener('gv-search', on);
  }, []);
  const r = search(db, q);
  const places = searchPlaces(q, db.bairros, db.streets);
  const none = q.length >= 2 && !r.entries.length && !r.bairros.length && !r.relatos.length;
  return (
    <>
      <PageHeader title="Busca" back />
      <form role="search" className="page-search" onSubmit={(e) => e.preventDefault()}><SearchGlyph /><label className="sr-only" htmlFor="q">Buscar</label><input id="q" autoFocus placeholder="Bairro, tema ou palavra" value={q} onChange={(e) => setQ(e.target.value)} /></form>
      {places.length > 1 && <div className="didyou"><strong>Qual destes você procura?</strong>{places.map((p) => <Link key={p.key} href={`/bairro/${p.bairroId}`} className="chip">{p.label}<small>{p.detail}</small></Link>)}</div>}
      {r.topics.length > 0 && <p className="pad topics">{r.topics.map((t) => <span key={t} className="chip">Tema: {TOPIC_LABEL[t]}</span>)}</p>}
      {q.length < 2 ? <EmptyState title="Procure por um bairro, tema ou palavra" text="Por exemplo: Casa Amarela, alagamento, ônibus." /> : none ? <EmptyState title={`Nada encontrado para “${q}”`} text="Confira a grafia ou tente uma palavra mais curta." /> : <>
        <Tabs label="Resultados" value={tab} onChange={setTab} tabs={[{ id: 'noticias', label: 'Notícias', count: r.entries.length }, { id: 'bairros', label: 'Bairros', count: r.bairros.length }, { id: 'relatos', label: 'Relatos', count: r.relatos.length }]} />
        {tab === 'noticias' && (r.entries.length ? <div className="feed">{r.entries.map((e) => <EntryCard key={e.item.id} entry={e} />)}</div> : <EmptyState title="Nenhuma notícia" />)}
        {tab === 'bairros' && (r.bairros.length ? <ul className="vol-list pad">{r.bairros.map((b) => <li key={b.id}><Link href={`/bairro/${b.id}`}>{b.name}</Link><span>{b.region}</span></li>)}</ul> : <EmptyState title="Nenhum bairro" />)}
        {tab === 'relatos' && <div className="relatos-area">{r.relatos.length ? r.relatos.map((x) => <RelatoCard key={x.id} relato={x} />) : <EmptyState title="Nenhum relato" />}</div>}
      </>}
    </>
  );
}
