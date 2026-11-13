'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Layers, List, MapPin, Megaphone, SlidersHorizontal } from 'lucide-react';
import { RelatoCard } from '@/components/cards';
import { RelatoGroups, SummaryCard } from '@/components/relato-groups';
import { PageHeader } from '@/components/shell-parts';
import { EmptyState, PageState, Tabs } from '@/components/ui';
import { bairroName, listedRelatos } from '@/domain/selectors';
import type { RelatoStatus } from '@/domain/types';
import { usePageLoad, useDb, useMe } from '@/store';

type View = 'assuntos' | 'lista';

export default function RelatosPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('relatos');
  const [picked, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<'todos' | RelatoStatus>('todos');
  // '' = todos os bairros, 'meus' = bairros seguidos, ou o id de um bairro.
  const [scope, setScope] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open]);

  const ids = scope === 'meus' ? me.followed : scope ? [scope] : undefined;
  const scoped = listedRelatos(db, ids);
  const groupCount = db.relatoGroups.filter((g) => !ids || g.bairroIds.some((b) => ids.includes(b))).length;
  // Sem assuntos agrupados, mostra direto a lista.
  const view: View = picked === 'assuntos' && groupCount ? 'assuntos' : picked ?? (groupCount ? 'assuntos' : 'lista');
  const list = tab === 'todos' ? scoped : scoped.filter((r) => r.status === tab);
  const withRelatos = db.bairros.filter((b) => b.active && db.relatos.some((r) => r.bairroId === b.id)).sort((a, b) => a.name.localeCompare(b.name));
  const scopeLabel = scope === 'meus' ? 'Meus bairros' : scope ? bairroName(db, scope) : 'Todos os bairros';
  const filtered = scope !== '' || view !== (groupCount ? 'assuntos' : 'lista');

  return (
    <>
      <PageHeader title="Relatos dos moradores" />
      <div className="relatos-top">
        <SummaryCard noNote bairroIds={ids} label={ids ? `Resumir o que dizem em ${scopeLabel === 'Meus bairros' ? 'meus bairros' : scopeLabel}` : 'Resumir o que os moradores estão dizendo'} />
        <div className="relatos-actions" ref={box}>
          <button type="button" className={`filter-btn ${filtered ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} title="Bairro e forma de ver">
            <SlidersHorizontal size={18} aria-hidden /><span className="filter-label">{scopeLabel}</span>
          </button>
          {open && (
            <div className="filter-pop" role="dialog" aria-label="Filtrar relatos">
              <p className="filter-h">Forma de ver</p>
              <div className="filter-seg" role="radiogroup" aria-label="Forma de ver">
                <button type="button" role="radio" aria-checked={view === 'assuntos'} disabled={!groupCount} onClick={() => setView('assuntos')}><Layers size={16} aria-hidden />Por assunto{groupCount ? ` (${groupCount})` : ''}</button>
                <button type="button" role="radio" aria-checked={view === 'lista'} onClick={() => setView('lista')}><List size={16} aria-hidden />Em lista ({scoped.length})</button>
              </div>
              <p className="filter-h">Bairro</p>
              <ul className="filter-list">
                {[['', 'Todos os bairros'], ...(me.followed.length ? [['meus', 'Meus bairros']] : []), ...withRelatos.map((b) => [b.id, b.name])].map(([id, label]) => (
                  <li key={id}><button type="button" aria-pressed={scope === id} onClick={() => { setScope(id); setOpen(false); }}><MapPin size={15} aria-hidden />{label}{scope === id && <Check size={16} aria-hidden className="filter-check" />}</button></li>
                ))}
              </ul>
            </div>
          )}
          <Link className="btn btn-primary relatar-btn" href="/relatar"><Megaphone size={16} aria-hidden />Contar o que vi</Link>
        </div>
      </div>
      <PageState state={state} retry={retry}>
        {view === 'assuntos' ? <RelatoGroups bairroIds={ids} /> : <>
          <Tabs label="Status" value={tab} onChange={setTab} tabs={[{ id: 'todos', label: 'Todos' }, { id: 'enviado', label: 'Enviados' }, { id: 'apuracao', label: 'Em apuração' }, { id: 'confirmado', label: 'Confirmados' }]} />
          <div className="relatos-area">{list.length ? list.map((r) => <RelatoCard key={r.id} relato={r} />) : <EmptyState title="Nenhum relato neste filtro" text="Mude o filtro ou conte o que você viu." />}</div>
        </>}
      </PageState>
    </>
  );
}
