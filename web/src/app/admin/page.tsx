'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PageHeader, RoleGate } from '@/components/shell-parts';
import { Button, Field, PageState, Tabs } from '@/components/ui';
import { canAdmin, ROLE_LABEL } from '@/domain/rules';
import { newsroomMetrics, bairroName } from '@/domain/selectors';
import type { Program, Role } from '@/domain/types';
import { act, actorId, api, usePageLoad, useDb, useMe } from '@/store';

function Bars({ rows, max, unit }: { rows: { key: string; label: string; href?: string; value: number }[]; max: number; unit: string }) {
  return <ul className="bars">{rows.map((r) => <li key={r.key}><span>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</span><div className="bar-track" aria-hidden><i style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} /></div><b>{r.value}<span className="sr-only"> {unit}</span></b></li>)}</ul>;
}

function Models() {
  const db = useDb();
  const [busy, setBusy] = useState(false);
  const m = db.ml;
  if (!m) return null;
  const pct = (v: number | null) => (v === null ? 'poucos dados para medir' : `${Math.round(v * 100)}% de acerto`);
  return (
    <section className="span2 models">
      <h2>Modelos de apoio</h2>
      <div className="kpis">
        <div><b>{m.location.docs}</b><span>notícias ensinando o modelo de bairro ({m.location.bairros} bairros)</span></div>
        <div><b>{m.location.accuracy === null || m.location.tested < 20 ? '–' : `${Math.round(m.location.accuracy * 100)}%`}</b><span>{m.location.tested < 20 ? `acerto do bairro previsto: poucos dados para medir (${m.location.tested} notícias de teste; precisa de 20)` : `acerto do bairro previsto em ${m.location.tested} notícias de teste`}</span></div>
        <div><b>{m.triage.decisions}</b><span>decisões da redação ensinando a triagem ({m.triage.confirmados} confirmados, {m.triage.falsos} falsos)</span></div>
        <div><b>{m.triage.accuracy === null || m.triage.decisions < 30 ? '–' : `${Math.round(m.triage.accuracy * 100)}%`}</b><span>{m.triage.decisions < 30 ? `acerto da triagem: poucos dados (${m.triage.decisions} decisões; precisa de 30)` : `triagem: ${pct(m.triage.accuracy)}`}</span></div>
      </div>
      <p className="muted">Os modelos reaprendem sozinhos a cada notícia nova e a cada decisão da redação. O de bairro só é usado quando o texto não cita o nome do bairro nem um ponto de referência conhecido; o resultado aparece como "estimado". A triagem só sugere: nunca muda o status de um relato.</p>
      <div><Button busy={busy} onClick={async () => { setBusy(true); await act(() => api.recomputeMl(), 'Notícias reanalisadas e modelos retreinados.'); setBusy(false); }}>Reanalisar todas as notícias</Button></div>
    </section>
  );
}

function Dashboard() {
  const db = useDb();
  const m = newsroomMetrics(db);
  const max = m.top[0]?.volume ?? 1;
  return (
    <div className="admin-grid">
      <div className="kpis">
        <div><b>{m.became.length}</b><span>relatos viraram pauta</span></div>
        <div><b>{m.inQueue}</b><span>na fila de apuração</span></div>
        <div><b>{m.falseCount}</b><span>relatos falsos barrados</span></div>
        <div><b>{m.invisible.filter((x) => x.volume === 0).length}</b><span>bairros sem nenhuma pauta</span></div>
      </div>
      <section><h2>Bairros mais cobertos</h2><Bars unit="notícias" max={max} rows={m.top.map((x) => ({ key: x.bairro.id, label: x.bairro.name, href: `/bairro/${x.bairro.id}`, value: x.volume }))} /></section>
      <section className="invisible"><h2>Bairros invisíveis</h2><p className="muted">Onde a cobertura pode chegar a seguir.</p><Bars unit="notícias" max={max} rows={m.invisible.map((x) => ({ key: x.bairro.id, label: x.bairro.name, href: `/bairro/${x.bairro.id}`, value: x.volume }))} /></section>
      <section><h2>Temas em alta (60 dias)</h2><Bars unit="publicações" max={m.topics[0]?.count ?? 1} rows={m.topics.slice(0, 6).map((t) => ({ key: t.topic, label: t.label, value: t.count }))} /></section>
      <section><h2>Engajamento por bairro</h2><p className="muted">Seguidores, confirmações e comentários.</p><Bars unit="pontos" max={m.engagementRank[0]?.engagement.total ?? 1} rows={m.engagementRank.map((x) => ({ key: x.bairro.id, label: x.bairro.name, value: x.engagement.total }))} /></section>
      <Models />
      <section className="span2"><h2>Relatos que viraram pauta</h2><ul className="vol-list">{m.became.map((r) => <li key={r.id}><Link href={`/materia/${r.officialArticleId}`}>{r.title}</Link><span>{bairroName(db, r.bairroId)}, {r.confirmations.length} confirmações</span></li>)}</ul></section>
    </div>
  );
}

function Sources() {
  const db = useDb();
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [schedule, setSchedule] = useState('');
  const [kind, setKind] = useState<Program['kind']>('esporte');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await act(() => api.addProgram(actorId(), { name, short, schedule: schedule || 'A definir', kind }).then(() => true), `${name} adicionado às fontes.`);
    if (ok) { setName(''); setShort(''); setSchedule(''); }
  };
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof api.ingestRuns>> | null>(null);
  useEffect(() => { api.ingestRuns().then(setRuns, () => setRuns([])); }, [db.articles.length]);
  return (
    <div className="pad">
      <h2>Fontes e programas</h2>
      <table className="table"><thead><tr><th>Programa</th><th>Horário</th><th>Tipo</th><th>Trechos</th><th>Situação</th></tr></thead><tbody>
        {db.programs.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.schedule}</td><td>{p.kind}</td><td>{db.segments.filter((s) => s.programId === p.id).length}</td><td><Button onClick={() => act(() => api.setProgramActive(actorId(), p.id, !p.active))}>{p.active ? 'Desativar' : 'Ativar'}</Button></td></tr>)}
      </tbody></table>
      <section className="ingest-box">
        <h3>Ingestão automática (scraper)</h3>
        <p className="muted">Robôs enviam notícias para <code>POST /api/ingest/news</code> com o cabeçalho <code>x-ingest-key</code>. A plataforma remove duplicadas pela URL, detecta os bairros citados e avisa quem segue. Detalhes em docs/INGESTAO.md.</p>
        {runs === null ? <p className="muted">Carregando execuções...</p> : runs.length ? (
          <table className="table"><thead><tr><th>Fonte</th><th>Quando</th><th>Recebidas</th><th>Novas</th><th>Atualizadas</th></tr></thead><tbody>
            {runs.map((r) => <tr key={r.id}><td>{r.source_name}</td><td>{new Date(r.started_at).toLocaleString('pt-BR')}</td><td>{r.received}</td><td>{r.created}</td><td>{r.updated}</td></tr>)}
          </tbody></table>
        ) : <p className="muted">Nenhuma ingestão ainda.</p>}
      </section>
      <form className="form" onSubmit={submit}>
        <h3>Adicionar programa</h3>
        <div className="grid2">
          <Field id="pg-name" label="Nome"><input id="pg-name" placeholder="Globo Esporte PE" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field id="pg-short" label="Sigla"><input id="pg-short" placeholder="GE" value={short} onChange={(e) => setShort(e.target.value)} /></Field>
          <Field id="pg-sch" label="Horário"><input id="pg-sch" placeholder="Seg. a sáb., 12h45" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></Field>
          <Field id="pg-kind" label="Tipo"><select id="pg-kind" value={kind} onChange={(e) => setKind(e.target.value as Program['kind'])}><option value="telejornal">Telejornal</option><option value="esporte">Esporte</option><option value="comunitario">Comunitário</option><option value="portal">Portal (scraper)</option></select></Field>
        </div>
        <div className="row end"><Button type="submit" variant="primary">Adicionar programa</Button></div>
      </form>
    </div>
  );
}

function BairrosAdmin() {
  const db = useDb();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [cityId, setCityId] = useState('recife');
  const submit = async (e: FormEvent) => { e.preventDefault(); const ok = await act(() => api.addBairro(actorId(), { name, region, cityId }).then(() => true), `${name} adicionado.`); if (ok) setName(''); };
  return (
    <div className="pad">
      <form className="form" onSubmit={submit}><div className="grid2"><Field id="b-n" label="Novo bairro"><input id="b-n" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field id="b-c" label="Cidade"><select id="b-c" value={cityId} onChange={(e) => setCityId(e.target.value)}>{db.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field id="b-r" label="Região (opcional)"><input id="b-r" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Zona Norte" /></Field></div><p className="muted">O bairro entra no centro da cidade no mapa. Para limites e coordenadas reais, use o script de importação descrito em docs/INGESTAO.md.</p><div className="row end"><Button type="submit" variant="primary">Adicionar bairro</Button></div></form>
      <ul className="vol-list">{db.bairros.map((b) => <li key={b.id}><Link href={`/bairro/${b.id}`}>{b.name}</Link><span>{db.cities.find((c) => c.id === b.cityId)?.name}{b.region ? `, ${b.region}` : ''}</span><Button onClick={() => act(() => api.setBairroActive(actorId(), b.id, !b.active))}>{b.active ? 'Desativar' : 'Ativar'}</Button></li>)}</ul>
    </div>
  );
}

function UsersAdmin() {
  const db = useDb();
  return (
    <div className="pad"><table className="table"><thead><tr><th>Usuário</th><th>Papel</th><th>Situação</th></tr></thead><tbody>
      {db.users.filter((u) => u.role !== 'visitante' && !u.deleted).map((u) => <tr key={u.id}><td>{u.name}</td><td><label className="sr-only" htmlFor={`r-${u.id}`}>Papel de {u.name}</label><select id={`r-${u.id}`} value={u.role} disabled={u.id === actorId()} onChange={(e) => act(() => api.setRole(actorId(), u.id, e.target.value as Role), `Papel de ${u.name} alterado.`)}>{(['morador', 'jornalista', 'moderador', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td><td>{u.blocked ? 'Bloqueado' : 'Ativo'}</td></tr>)}
    </tbody></table></div>
  );
}

export default function AdminPage() {
  const me = useMe();
  const { state, retry } = usePageLoad('admin');
  const [tab, setTab] = useState<'painel' | 'fontes' | 'bairros' | 'usuarios'>('painel');
  return (
    <>
      <PageHeader title="Admin" />
      <RoleGate allow={canAdmin(me)}>
        <Tabs label="Administração" value={tab} onChange={setTab} tabs={[{ id: 'painel', label: 'Painel da redação' }, { id: 'fontes', label: 'Fontes' }, { id: 'bairros', label: 'Bairros' }, { id: 'usuarios', label: 'Usuários' }]} />
        <PageState state={state} retry={retry} rows={2}>
          {tab === 'painel' && <Dashboard />}{tab === 'fontes' && <Sources />}{tab === 'bairros' && <BairrosAdmin />}{tab === 'usuarios' && <UsersAdmin />}
        </PageState>
      </RoleGate>
    </>
  );
}
