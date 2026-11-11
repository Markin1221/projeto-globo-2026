'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { EntryCard } from '@/components/cards';
import { PageHeader } from '@/components/shell-parts';
import { EmptyState, NotFoundState, PageState } from '@/components/ui';
import { bairroName, officialFeed } from '@/domain/selectors';
import { usePageLoad, useDb } from '@/store';

/** Todas as notícias (trechos) de um telejornal, com filtro por bairro. */
export default function ProgramPage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { state, retry } = usePageLoad(`telejornal-${id}`);
  const [bairro, setBairro] = useState('');
  const program = db.programs.find((p) => p.id === id);
  if (!program) return <><PageHeader title="Telejornal" back /><NotFoundState what="Telejornal" /></>;
  const all = officialFeed(db).filter((e) => e.kind === 'segment' && e.item.programId === id);
  const bairros = [...new Set(all.flatMap((e) => e.item.bairroIds))].sort((a, b) => bairroName(db, a).localeCompare(bairroName(db, b)));
  const list = bairro ? all.filter((e) => e.item.bairroIds.includes(bairro)) : all;
  return (
    <>
      <PageHeader title={program.name} back />
      <PageState state={state} retry={retry}>
        <div className="row between pad">
          <p className="muted">{program.schedule}. {all.length} {all.length === 1 ? 'trecho' : 'trechos'}.</p>
          {bairros.length > 1 && (
            <select aria-label="Filtrar por bairro" value={bairro} onChange={(e) => setBairro(e.target.value)}>
              <option value="">Todos os bairros</option>
              {bairros.map((b) => <option key={b} value={b}>{bairroName(db, b)}</option>)}
            </select>
          )}
        </div>
        {list.length ? <div className="feed">{list.map((e) => <EntryCard key={e.item.id} entry={e} />)}</div> : <EmptyState title="Nenhum trecho" text="Este programa ainda não citou esse bairro." />}
      </PageState>
    </>
  );
}
