'use client';
import { useState } from 'react';
import Link from 'next/link';
import { EntryCard } from '@/components/cards';
import { FollowButton } from '@/components/follow-button';
import { PageHeader } from '@/components/shell-parts';
import { PageState, SearchGlyph, Tabs } from '@/components/ui';
import { officialFeed, trendingBairros, trendingTopics } from '@/domain/selectors';
import { usePageLoad, useDb } from '@/store';
import { useRouter } from 'next/navigation';

export default function ExplorePage() {
  const db = useDb();
  const router = useRouter();
  const { state, retry } = usePageLoad('explorar');
  const [tab, setTab] = useState<'bairros' | 'temas' | 'recentes'>('bairros');
  const [q, setQ] = useState('');
  return (
    <>
      <PageHeader title="Explorar" />
      <form role="search" className="page-search" onSubmit={(e) => { e.preventDefault(); router.push(`/busca?q=${encodeURIComponent(q)}`); }}>
        <SearchGlyph /><label className="sr-only" htmlFor="ex-q">Buscar</label><input id="ex-q" placeholder="Buscar bairro, tema ou palavra" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <Tabs label="Em alta" value={tab} onChange={setTab} tabs={[{ id: 'bairros', label: 'Bairros em alta' }, { id: 'temas', label: 'Temas' }, { id: 'recentes', label: 'Recentes' }]} />
      <PageState state={state} retry={retry}>
        {tab === 'bairros' && <ol className="rank">{trendingBairros(db).map((t, i) => <li key={t.bairro.id}><span className="rank-n" aria-hidden>{i + 1}</span><Link href={`/bairro/${t.bairro.id}`}><strong>{t.bairro.name}</strong><small>{t.bairro.region}: {t.news} notícias e {t.reports} relatos em 14 dias</small></Link><FollowButton bairroId={t.bairro.id} /></li>)}</ol>}
        {tab === 'temas' && <ol className="rank">{trendingTopics(db).map((t, i) => <li key={t.topic}><span className="rank-n" aria-hidden>{i + 1}</span><Link href={`/busca?q=${encodeURIComponent(t.label)}`}><strong>{t.label}</strong><small>{t.count} publicações em 14 dias</small></Link></li>)}</ol>}
        {tab === 'recentes' && <div className="feed">{officialFeed(db).slice(0, 12).map((e) => <EntryCard key={e.item.id} entry={e} />)}</div>}
      </PageState>
    </>
  );
}
