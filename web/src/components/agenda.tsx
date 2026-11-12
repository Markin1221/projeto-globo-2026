'use client';
// Agenda de reportagens: calendário do mês com o que a redação planeja mostrar em cada bairro (g1, NE1, NE2).
// Morador vê; jornalista e admin também cadastram e apagam.
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import { canEditCases } from '@/domain/rules';
import { bairroName } from '@/domain/selectors';
import type { AgendaItem, AgendaOutlet } from '@/domain/types';
import { act, api, useDb, useMe } from '@/store';
import { Button } from './ui';

export const OUTLET_LABEL: Record<AgendaOutlet, string> = { g1: 'g1', ne1: 'NE1', ne2: 'NE2' };
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Hoje no horário do Recife, como AAAA-MM-DD. */
const todayKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Recife' });
const keyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const t = todayKey();
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(...(t.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]))) / 864e5);
  const rel = diff === 0 ? 'Hoje, ' : diff === 1 ? 'Amanhã, ' : diff === -1 ? 'Ontem, ' : '';
  return `${rel}${WEEK[w].toLowerCase()}, ${d} de ${MONTHS[m - 1]}`;
};

/** Filtra a agenda: um bairro inclui também o que é do Recife inteiro. */
export function agendaFor(items: AgendaItem[], scope: string, followed: string[]) {
  if (!scope) return items;
  if (scope === 'meus') return items.filter((a) => a.bairroId === null || followed.includes(a.bairroId));
  return items.filter((a) => a.bairroId === null || a.bairroId === scope);
}

export function AgendaRow({ a, staff }: { a: AgendaItem; staff?: boolean }) {
  const db = useDb();
  return (
    <li className="ag-row">
      <span className={`ag-outlet o-${a.outlet}`}>{OUTLET_LABEL[a.outlet]}</span>
      <div className="ag-row-main">
        <strong>{a.title}</strong>
        <p className="ag-row-meta">
          <span><CalendarDays size={13} aria-hidden />{dayLabel(a.date)}</span>
          {a.time && <span><Clock size={13} aria-hidden />{a.time}</span>}
          <span><MapPin size={13} aria-hidden />{a.bairroId ? bairroName(db, a.bairroId) : 'Recife inteiro'}</span>
        </p>
        {a.note && <p className="ag-note">{a.note}</p>}
      </div>
      {staff && <button type="button" className="icon-btn" aria-label={`Apagar "${a.title}" da agenda`} onClick={() => act(() => api.deleteAgenda(a.id), 'Reportagem tirada da agenda.')}><Trash2 size={17} aria-hidden /></button>}
    </li>
  );
}

function AgendaForm({ date, scope, onDone }: { date: string; scope: string; onDone: () => void }) {
  const db = useDb();
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(date);
  const [time, setTime] = useState('');
  const [outlet, setOutlet] = useState<AgendaOutlet>('ne1');
  const [bairro, setBairro] = useState(scope && scope !== 'meus' ? scope : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const bairros = db.bairros.filter((b) => b.active).sort((a, b) => a.name.localeCompare(b.name));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act(() => api.createAgenda({ title, note: note || undefined, date: day, time: time || undefined, outlet, bairroId: bairro || null }), 'Reportagem colocada na agenda.');
    setBusy(false);
    if (ok !== undefined) onDone();
  };
  return (
    <form className="ag-form" onSubmit={save}>
      <h3>Cadastrar reportagem</h3>
      <label>Título (pode ser geral)<input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={140} placeholder="Ex.: Série sobre as obras de drenagem" /></label>
      <fieldset className="ag-outlets"><legend>Onde vai sair</legend>
        {(['g1', 'ne1', 'ne2'] as const).map((o) => (
          <label key={o} className={`ag-pick o-${o} ${outlet === o ? 'on' : ''}`}><input type="radio" name="outlet" value={o} checked={outlet === o} onChange={() => setOutlet(o)} />{OUTLET_LABEL[o]}</label>
        ))}
      </fieldset>
      <div className="ag-form-row">
        <label>Dia<input type="date" value={day} onChange={(e) => setDay(e.target.value)} required /></label>
        <label>Horário (opcional)<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label>Bairro<select value={bairro} onChange={(e) => setBairro(e.target.value)}>
        <option value="">Recife inteiro</option>
        {bairros.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select></label>
      <label>Observação (opcional)<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={2} /></label>
      <div className="row"><Button variant="primary" busy={busy} type="submit">Salvar na agenda</Button><Button variant="ghost" type="button" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

/** Calendário do mês. initialScope: '' = Recife inteiro, 'meus' = bairros seguidos, ou o id de um bairro. */
export function AgendaCalendar({ initialScope = '' }: { initialScope?: string }) {
  const db = useDb();
  const me = useMe();
  const staff = canEditCases(me);
  const today = todayKey();
  const [scope, setScope] = useState(initialScope);
  const [ym, setYm] = useState(() => { const [y, m] = today.split('-').map(Number); return { y, m: m - 1 }; });
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const items = useMemo(() => agendaFor(db.agenda, scope, me.followed), [db.agenda, scope, me.followed]);
  const byDay = useMemo(() => { const m = new Map<string, AgendaItem[]>(); for (const a of items) m.set(a.date, [...(m.get(a.date) ?? []), a]); return m; }, [items]);

  const first = new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const move = (d: number) => setYm(({ y, m }) => { const n = m + d; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  const list = sel ? (byDay.get(sel) ?? []) : items.filter((a) => a.date >= today).slice(0, 12);
  const bairros = db.bairros.filter((b) => b.active && db.agenda.some((a) => a.bairroId === b.id) || b.id === scope).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="agenda" aria-label="Agenda de reportagens">
      <div className="ag-top">
        <label className="ag-scope"><span className="sr-only">Mostrar agenda de</span>
          <select value={scope} onChange={(e) => { setScope(e.target.value); setSel(null); }}>
            <option value="">Recife inteiro</option>
            {me.followed.length > 0 && <option value="meus">Meus bairros</option>}
            {bairros.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {staff && !form && <Button variant="primary" onClick={() => setForm(true)}><Plus size={16} aria-hidden />Cadastrar</Button>}
      </div>
      {form && <AgendaForm date={sel ?? today} scope={scope} onDone={() => setForm(false)} />}

      <div className="ag-cal">
        <div className="ag-cal-head">
          <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden /></button>
          <h3>{MONTHS[ym.m][0].toUpperCase() + MONTHS[ym.m].slice(1)} de {ym.y}</h3>
          <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => move(1)}><ChevronRight size={20} aria-hidden /></button>
        </div>
        <div className="ag-grid" role="grid" aria-label={`${MONTHS[ym.m]} de ${ym.y}`}>
          {WEEK.map((w) => <span key={w} className="ag-wd" role="columnheader">{w.slice(0, 3)}</span>)}
          {cells.map((d, k) => {
            if (!d) return <span key={`x${k}`} className="ag-day empty" aria-hidden />;
            const key = keyOf(ym.y, ym.m, d);
            const its = byDay.get(key) ?? [];
            return (
              <button key={key} type="button" role="gridcell" className={`ag-day ${key === today ? 'today' : ''} ${key === sel ? 'sel' : ''} ${key < today ? 'past' : ''}`}
                aria-label={`${d} de ${MONTHS[ym.m]}${its.length ? `, ${its.length} ${its.length === 1 ? 'reportagem' : 'reportagens'}` : ''}`} aria-pressed={key === sel}
                onClick={() => setSel(key === sel ? null : key)}>
                <span className="ag-num">{d}</span>
                {its.length > 0 && <span className="ag-marks">{its.slice(0, 3).map((a) => <i key={a.id} className={`o-${a.outlet}`} title={`${OUTLET_LABEL[a.outlet]}: ${a.title}`}>{OUTLET_LABEL[a.outlet]}</i>)}{its.length > 3 && <b>+{its.length - 3}</b>}</span>}
              </button>
            );
          })}
        </div>
        <p className="ag-legend"><span><i className="o-g1" />g1</span><span><i className="o-ne1" />NE1</span><span><i className="o-ne2" />NE2</span></p>
      </div>

      <div className="ag-list">
        <div className="row between"><h3>{sel ? dayLabel(sel) : 'Próximas reportagens'}</h3>{sel && <button type="button" className="link-btn" onClick={() => setSel(null)}>Ver as próximas</button>}</div>
        {list.length ? <ul>{list.map((a) => <AgendaRow key={a.id} a={a} staff={staff} />)}</ul>
          : <p className="muted">{sel ? 'Nenhuma reportagem marcada para este dia.' : 'Nenhuma reportagem marcada daqui para frente.'}</p>}
      </div>
    </section>
  );
}
