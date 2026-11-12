'use client';
import { useEffect, useState } from 'react';
import { AgendaCalendar } from '@/components/agenda';
import { CaseCard } from '@/components/case-progress';
import { PageHeader } from '@/components/shell-parts';
import { EmptyState, PageState, Tabs } from '@/components/ui';
import type { CaseStage } from '@/domain/types';
import { usePageLoad, useDb, useMe } from '@/store';

export default function CasosPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('casos');
  const [tab, setTab] = useState<'todos' | CaseStage>('todos');
  const [bairro, setBairro] = useState<string>('');
  const [mine, setMine] = useState(false);
  // Aba e bairro podem vir no endereço (ex.: /casos?aba=agenda&bairro=torre, link da página do bairro).
  const [view, setView] = useState<'casos' | 'agenda'>('casos');
  const [agendaScope, setAgendaScope] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('aba') === 'agenda') setView('agenda');
    setAgendaScope(q.get('bairro') ?? (me.followed.length ? 'meus' : ''));
  }, [me.followed.length]);
  const scoped = db.cases.filter((c) => (!bairro || c.bairroIds.includes(bairro)) && (!mine || c.bairroIds.some((b) => me.followed.includes(b))));
  const list = tab === 'todos' ? scoped : scoped.filter((c) => c.stage === tab);
  const count = (s: CaseStage) => scoped.filter((c) => c.stage === s).length;
  const bairros = db.bairros.filter((b) => b.active && db.cases.some((c) => c.bairroIds.includes(b.id)));
  return (
    <>
      <PageHeader title="Acompanhamento" />
      <Tabs label="Seção" value={view} onChange={setView} tabs={[{ id: 'casos', label: 'Casos' }, { id: 'agenda', label: 'Agenda de reportagens', count: db.agenda.length }]} />
      {view === 'agenda' ? (
        <PageState state={state} retry={retry}>
          <p className="relatos-intro ag-intro">Quando a redação planeja mostrar o seu bairro no g1, no NE1 ou no NE2. Escolha um bairro para ver só a agenda dele (as reportagens do Recife inteiro aparecem junto).</p>
          {agendaScope !== null && <AgendaCalendar key={agendaScope} initialScope={agendaScope} />}
        </PageState>
      ) : <>
      <div className="relatos-intro">
        <p>Notícias e relatos sobre o mesmo problema, em ordem, para ver se ele já foi resolvido. O progresso segue as notícias oficiais. Relatos de moradores aparecem na linha do tempo marcados como não verificados.</p>
        <div className="row between">
          <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Só dos bairros que sigo</label>
          <select aria-label="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)}>
            <option value="">Todos os bairros</option>
            {bairros.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <Tabs label="Etapa" value={tab} onChange={setTab} tabs={[{ id: 'todos', label: 'Todos', count: scoped.length }, { id: 'problema', label: 'Sem solução', count: count('problema') }, { id: 'andamento', label: 'Em andamento', count: count('andamento') }, { id: 'resolvido', label: 'Resolvidos', count: count('resolvido') }]} />
      <PageState state={state} retry={retry}>
        {list.length ? <ul className="case-list">{list.map((c) => <CaseCard key={c.id} c={c} />)}</ul>
          : <EmptyState title="Nenhum caso nesta seleção" text="Quando um problema aparecer em mais de uma notícia, ele é acompanhado aqui." />}
      </PageState>
      </>}
    </>
  );
}
