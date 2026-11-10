'use client';
import { CaseCard } from '@/components/case-progress';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertRow, EntryCard, RelatoCard } from '@/components/cards';
import { FollowButton } from '@/components/follow-button';
import { DaySummary } from '@/components/day-summary';
import { SummaryCard } from '@/components/relato-groups';
import { PageHeader } from '@/components/shell-parts';
import { EmptyState, InformalNotice, NotFoundState, PageState, Tabs, timeAgo } from '@/components/ui';
import { TOPIC_LABEL } from '@/domain/rules';
import { activeAlerts, bairroById, listedRelatos, newsVolume, officialFeed, programById } from '@/domain/selectors';
import type { Topic } from '@/domain/types';
import { usePageLoad, useDb } from '@/store';

type Tab = 'feed' | 'acervo' | 'linha' | 'relatos' | 'alertas';

function Archive({ id }: { id: string }) {
  const db = useDb();
  const [period, setPeriod] = useState('todos');
  const [program, setProgram] = useState('todos');
  const [topic, setTopic] = useState('todos');
  const all = useMemo(() => officialFeed(db, [id]), [db, id]);
  const list = all.filter((e) => {
    if (period !== 'todos' && e.at < Date.now() - Number(period) * 864e5) return false;
    if (topic !== 'todos' && e.item.topic !== topic) return false;
    if (program === 'portal') return e.kind === 'article';
    if (program !== 'todos') return e.kind === 'segment' && e.item.programId === program;
    return true;
  });
  const topics = [...new Set(all.map((e) => e.item.topic))] as Topic[];
  return (
    <div>
      <div className="filters">
        <label>Período<select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="todos">Todo o acervo</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></label>
        <label>Programa<select value={program} onChange={(e) => setProgram(e.target.value)}><option value="todos">Todos</option>{db.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="portal">Portal</option></select></label>
        <label>Tema<select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="todos">Todos</option>{topics.map((t) => <option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}</select></label>
      </div>
      <p className="result-n" role="status">{list.length} {list.length === 1 ? 'item' : 'itens'} no acervo</p>
      {list.length ? <ul className="archive">{list.map((e) => (
        <li key={e.item.id}><time>{new Date(e.at).toLocaleDateString('pt-BR')}</time><div><Link href={e.kind === 'segment' ? `/trecho/${e.item.id}` : `/materia/${e.item.id}`}>{e.item.title}</Link><small>{e.kind === 'segment' ? programById(db, e.item.programId)?.name : 'Portal'}, {TOPIC_LABEL[e.item.topic]}</small></div></li>
      ))}</ul> : <EmptyState title="Nada neste filtro" text="Amplie o período ou escolha outro tema." />}
    </div>
  );
}

function Timeline({ id }: { id: string }) {
  const db = useDb();
  const cases = db.cases.filter((c) => c.bairroIds.includes(id));
  if (!cases.length) return <EmptyState title="Nenhum caso acompanhado" text="Quando um problema do bairro aparecer em mais de uma notícia, o andamento dele aparece aqui." />;
  return <ul className="case-list">{cases.map((c) => <CaseCard key={c.id} c={c} />)}</ul>;
}

export default function BairroPage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { state, retry } = usePageLoad(`bairro-${id}`);
  const [tab, setTab] = useState<Tab>('feed');
  const b = bairroById(db, id);
  if (!b) return <><PageHeader title="Bairro" back /><NotFoundState what="Bairro" /></>;
  const feed = officialFeed(db, [id]);
  const relatos = listedRelatos(db, [id]);
  const alerts = activeAlerts(db, [id]);
  const followers = db.users.filter((u) => u.followed.includes(id)).length;
  return (
    <>
      <PageHeader title={b.name} back />
      <PageState state={state} retry={retry}>
        <section className="bairro-head">
          <div className="row between">
            <div><h2>{b.name}</h2><p className="muted">{b.region}, {followers} {followers === 1 ? 'pessoa segue' : 'pessoas seguem'}, {newsVolume(db, id)} vezes na pauta</p></div>
            <FollowButton bairroId={id} />
          </div>
          <DaySummary bairroId={id} title="Resumo do dia" />
        </section>
        <Tabs label="Seções do bairro" value={tab} onChange={setTab} tabs={[{ id: 'feed', label: 'Feed' }, { id: 'acervo', label: 'Acervo' }, { id: 'linha', label: 'Acompanhamento', count: db.cases.filter((c) => c.bairroIds.includes(id)).length }, { id: 'relatos', label: 'Relatos', count: relatos.length }, { id: 'alertas', label: 'Alertas', count: alerts.length }]} />
        {tab === 'feed' && (feed.length ? <div className="feed">{feed.map((e) => <EntryCard key={e.item.id} entry={e} />)}</div> : <EmptyState title={`${b.name} ainda não foi pauta`} text="Este é um dos bairros invisíveis da cobertura. Conte o que acontece por aqui." action={<Link className="btn btn-primary" href="/relatar">Relatar</Link>} />)}
        {tab === 'acervo' && <Archive id={id} />}
        {tab === 'linha' && <Timeline id={id} />}
        {tab === 'relatos' && <div className="relatos-area"><h3 className="area-title">Relatos dos moradores de {b.name}</h3>{relatos.length > 1 && <div className="pad"><SummaryCard bairroIds={[id]} label={`Resumir o que dizem os moradores de ${b.name}`} /></div>}{relatos.length ? relatos.map((r) => <RelatoCard key={r.id} relato={r} />) : <><InformalNotice /><EmptyState title="Nenhum relato neste bairro" /></>}</div>}
        {tab === 'alertas' && <div className="pad">{alerts.length ? alerts.map((a) => <AlertRow key={a.id} alert={a} />) : <EmptyState title="Sem alertas ativos" text={`Nenhum alerta prático para ${b.name} agora (${timeAgo(Date.now())}).`} />}</div>}
      </PageState>
    </>
  );
}
