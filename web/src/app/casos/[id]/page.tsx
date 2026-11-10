'use client';
import { useParams } from 'next/navigation';
import { CaseConfirm, CaseStepper, CaseTimeline, caseStatusText, STAGE_LABEL } from '@/components/case-progress';
import { PageHeader } from '@/components/shell-parts';
import { BairroChips, ListenButton } from '@/components/cards';
import { NotFoundState, PageState } from '@/components/ui';
import { TOPIC_LABEL } from '@/domain/rules';
import { usePageLoad, useDb } from '@/store';

export default function CasoPage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const { state, retry } = usePageLoad(`caso-${id}`);
  const c = db.cases.find((x) => x.id === decodeURIComponent(id));
  if (!c) return <><PageHeader title="Caso" back /><NotFoundState what="Caso" /></>;
  const speech = `${c.title}. ${caseStatusText(c)} ${c.items.map((i) => `${new Date(i.at).toLocaleDateString('pt-BR')}: ${i.official ? '' : 'relato de morador, não verificado: '}${i.title}. ${STAGE_LABEL[i.stage]}.`).join(' ')}`;
  return (
    <>
      <PageHeader title="Acompanhamento" back />
      <PageState state={state} retry={retry} rows={3}>
        <article className="detail case-detail">
          <p className="muted">{TOPIC_LABEL[c.topic]}</p>
          <h2 className="detail-title">{c.title}</h2>
          <BairroChips ids={c.bairroIds} />
          <CaseStepper c={c} />
          <div className="actions"><ListenButton id={`case:${c.id}`} text={speech} label="Ouvir o andamento" /></div>
          <h3>Linha do tempo</h3>
          <CaseTimeline c={c} />
          <p className="muted case-foot">A etapa de cada notícia é identificada pelo texto ({'"'}abriu{'"'}, {'"'}estão consertando{'"'}, {'"'}foi consertado{'"'}) e pode ser corrigida pela redação.</p>
          <CaseConfirm c={c} />
        </article>
      </PageState>
    </>
  );
}
