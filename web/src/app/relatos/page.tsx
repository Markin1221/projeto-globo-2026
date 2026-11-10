'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { RelatoCard } from '@/components/cards';
import { RelatoGroups, SummaryCard } from '@/components/relato-groups';
import { PageHeader } from '@/components/shell-parts';
import { EmptyState, PageState, Tabs } from '@/components/ui';
import { NEIGHBOR_NOTE } from '@/domain/rules';
import { listedRelatos } from '@/domain/selectors';
import type { RelatoStatus } from '@/domain/types';
import { usePageLoad, useDb, useMe } from '@/store';

export default function RelatosPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('relatos');
  const [view, setView] = useState<'assuntos' | 'lista'>('assuntos');
  const [tab, setTab] = useState<'todos' | RelatoStatus>('todos');
  const [mine, setMine] = useState(false);
  const scoped = listedRelatos(db, mine ? me.followed : undefined);
  const list = tab === 'todos' ? scoped : scoped.filter((r) => r.status === tab);
  return (
    <>
      <PageHeader title="Relatos dos moradores" />
      <div className="relatos-intro">
        <p>Esta área é separada do noticiário. Os relatos são enviados por moradores e podem conter erros ou informações falsas. Só a redação pode confirmá-los. {NEIGHBOR_NOTE}</p>
        <div className="row between"><label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Só dos bairros que sigo</label><Link className="btn btn-primary" href="/relatar"><Megaphone size={16} aria-hidden />Contar o que vi</Link></div>
      </div>
      <div className="pad"><SummaryCard bairroIds={mine ? me.followed : undefined} label={mine ? 'Resumir o que dizem os vizinhos dos meus bairros' : 'Resumir o que os moradores estão dizendo'} /></div>
      <Tabs label="Forma de ver" value={view} onChange={setView} tabs={[{ id: 'assuntos', label: 'Por assunto', count: db.relatoGroups.length }, { id: 'lista', label: 'Todos em lista' }]} />
      <PageState state={state} retry={retry}>
        {view === 'assuntos' ? <RelatoGroups bairroIds={mine ? me.followed : undefined} /> : <>
          <Tabs label="Status" value={tab} onChange={setTab} tabs={[{ id: 'todos', label: 'Todos' }, { id: 'enviado', label: 'Enviados' }, { id: 'apuracao', label: 'Em apuração' }, { id: 'confirmado', label: 'Confirmados' }]} />
          <div className="relatos-area">{list.length ? list.map((r) => <RelatoCard key={r.id} relato={r} />) : <EmptyState title="Nenhum relato neste filtro" text="Mude o filtro ou conte o que você viu." />}</div>
        </>}
      </PageState>
    </>
  );
}
