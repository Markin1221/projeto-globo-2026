'use client';
import { useState } from 'react';
import { AlertRow } from '@/components/cards';
import { PageHeader } from '@/components/shell-parts';
import { EmptyState, PageState, Tabs } from '@/components/ui';
import { ALERT_TYPES, TOPIC_LABEL } from '@/domain/rules';
import { activeAlerts } from '@/domain/selectors';
import { usePageLoad, useDb, useMe } from '@/store';

export default function AlertsPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('alertas');
  const [scope, setScope] = useState<'meus' | 'todos'>(me.followed.length ? 'meus' : 'todos');
  const [type, setType] = useState('todos');
  const list = activeAlerts(db, scope === 'meus' ? me.followed : undefined).filter((a) => type === 'todos' || a.type === type);
  return (
    <>
      <PageHeader title="Alertas" />
      <Tabs label="Escopo" value={scope} onChange={setScope} tabs={[{ id: 'meus', label: 'Meus bairros' }, { id: 'todos', label: 'Recife inteiro' }]} />
      <div className="filters"><label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}><option value="todos">Todos</option>{ALERT_TYPES.map((t) => <option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}</select></label></div>
      <PageState state={state} retry={retry} rows={3}>
        <div className="pad">{list.length ? list.map((a) => <AlertRow key={a.id} alert={a} />) : <EmptyState title="Nenhum alerta" text="Tudo tranquilo neste filtro." />}</div>
      </PageState>
    </>
  );
}
