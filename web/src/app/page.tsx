'use client';
import { Fragment, useMemo, useState } from 'react';
import { ArrowUp, MapPin, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { BairroPicker } from '@/components/dialogs';
import { DaySummary } from '@/components/day-summary';
import { EntryCard, ResidentsBlock } from '@/components/cards';
import { PageHeader } from '@/components/shell-parts';
import { Button, EmptyState, PageState, Tabs } from '@/components/ui';
import { canFollow } from '@/domain/rules';
import { bairroName, officialFeed } from '@/domain/selectors';
import { usePageLoad, useDb, useMe } from '@/store';

function DailySummary({ ids }: { ids: string[] }) {
  const db = useDb();
  const latest = ids[ids.length - 1];
  const [current, setCurrent] = useState(latest);
  const id = ids.includes(current) ? current : latest;
  const picker = ids.length > 1 ? <><label className="sr-only" htmlFor="sum-b">Bairro do resumo</label><select id="sum-b" className="mini" value={id} onChange={(e) => setCurrent(e.target.value)}>{[...ids].reverse().map((b) => <option key={b} value={b}>{bairroName(db, b)}</option>)}</select></> : undefined;
  return <DaySummary bairroId={id} picker={picker} />;
}

export default function HomePage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('home');
  const [scope, setScope] = useState<'meus' | 'todos'>(me.followed.length ? 'meus' : 'todos');
  const [cutoff, setCutoff] = useState(() => Date.now());
  const [picker, setPicker] = useState(false);
  const ids = me.followed;
  const feed = useMemo(() => officialFeed(db, scope === 'meus' ? ids : undefined), [db, scope, ids]);
  const [useful, setUseful] = useState(false);
  const shown = feed.filter((e) => e.at <= cutoff && (!useful || (e.item.utility ?? 50) >= 60));
  const fresh = feed.length - shown.length;
  return (
    <>
      <PageHeader title="Início" />
      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-intro-copy">
          <p className="eyebrow"><MapPin size={14} aria-hidden />GRANDE RECIFE</p>
          <h2 id="home-title">Sua cidade.<br /><span>Seu dia a dia.</span></h2>
          <p>As notícias que importam, mais perto de você.</p>
        </div>
        <Link className="intro-map" href="/mapa" aria-label="Explorar o mapa dos bairros">
          <span className="radar-art" aria-hidden><span /><span /><span /><MapPin size={27} strokeWidth={1.5} /></span>
          <span>Explorar o mapa <ArrowUpRight size={14} aria-hidden /></span>
        </Link>
      </section>
      <Tabs label="Escopo do feed" value={scope} onChange={setScope} tabs={[{ id: 'meus', label: 'Meus bairros' }, { id: 'todos', label: 'Grande Recife' }]} />
      <PageState state={state} retry={retry}>
        <div className="home-top">
          {ids.length > 0 && <DailySummary ids={ids} />}
        </div>
        <label className="check useful-toggle"><input type="checkbox" checked={useful} onChange={(e) => setUseful(e.target.checked)} />Só o que muda o dia a dia (trânsito, água, saúde, obras, prazos)</label>
        {fresh > 0 && <button type="button" className="fresh-pill" onClick={() => { setCutoff(Date.now()); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><ArrowUp size={16} aria-hidden />{fresh === 1 ? '1 nova publicação' : `${fresh} novas publicações`}</button>}
        {shown.length === 0 && scope === 'meus'
          ? <EmptyState title="Siga um bairro para montar seu feed" text="Assim você fica sabendo quando ele aparecer nos telejornais." action={canFollow(me) ? <Button variant="primary" onClick={() => setPicker(true)}>Escolher bairro</Button> : undefined} />
          : <div className="feed">{shown.map((e, i) => <Fragment key={`${e.kind}-${e.item.id}`}><EntryCard entry={e} />{i === 2 && <ResidentsBlock bairroIds={scope === 'meus' ? ids : undefined} />}</Fragment>)}</div>}
      </PageState>
      <BairroPicker open={picker} onClose={() => setPicker(false)} />
    </>
  );
}
