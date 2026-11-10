'use client';
import { useState } from 'react';
import { EntryCard } from '@/components/cards';
import { PageHeader, SimulateLiveButton } from '@/components/shell-parts';
import { EmptyState, PageState, Tabs } from '@/components/ui';
import { officialFeed } from '@/domain/selectors';
import { usePageLoad, useDb } from '@/store';

export default function ProgramsPage() {
  const db = useDb();
  const { state, retry } = usePageLoad('telejornais');
  const [tab, setTab] = useState('todos');
  const programs = db.programs.filter((p) => p.active);
  const list = officialFeed(db).filter((e) => e.kind === 'segment' && (tab === 'todos' || e.item.programId === tab));
  return (
    <>
      <PageHeader title="Telejornais" />
      <Tabs label="Programas" value={tab} onChange={setTab} tabs={[{ id: 'todos', label: 'Todos' }, ...programs.map((p) => ({ id: p.id, label: p.name }))]} />
      <PageState state={state} retry={retry}>
        <div className="row between pad"><p className="muted">{tab === 'todos' ? 'Cada trecho tem transcrição automática e bairros detectados.' : programs.find((p) => p.id === tab)?.schedule}</p><SimulateLiveButton /></div>
        {list.length ? <div className="feed">{list.map((e) => <EntryCard key={e.item.id} entry={e} />)}</div> : <EmptyState title="Nenhum trecho deste programa ainda" text="Os trechos aparecem assim que o programa for transcrito." />}
      </PageState>
    </>
  );
}
