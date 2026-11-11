'use client';
import Link from 'next/link';
import { ProgramCarousel } from '@/components/program-carousel';
import { PageHeader, SimulateLiveButton } from '@/components/shell-parts';
import { PageState } from '@/components/ui';
import { programById } from '@/domain/selectors';
import { usePageLoad, useDb } from '@/store';

export default function ProgramsPage() {
  const db = useDb();
  const { state, retry } = usePageLoad('telejornais');
  const programs = db.programs.filter((p) => p.active && p.kind !== 'portal');
  const byProgram = (id: string) => db.segments.filter((s) => s.programId === id).sort((a, b) => b.airedAt - a.airedAt);
  const live = db.live && !db.live.finished ? db.live : null;
  return (
    <>
      <PageHeader title="Telejornais" />
      <PageState state={state} retry={retry}>
        <div className="onair-strip">
          {live
            ? <p><span className="live-chip"><b className="live-dot" />{programById(db, live.programId)?.name} ao vivo</span> {live.lines[live.shown - 1]?.text} <Link href={`/trecho/${live.segmentId}`}>Abrir transcrição</Link></p>
            : <p className="muted">Nenhum telejornal no ar agora. Cada trecho tem transcrição e os bairros citados.</p>}
          <SimulateLiveButton />
        </div>
        {programs.map((p) => <ProgramCarousel key={p.id} program={p} segments={byProgram(p.id)} />)}
      </PageState>
    </>
  );
}
