'use client';
import Link from 'next/link';
import { PageHeader } from '@/components/shell-parts';
import { Button, EmptyState, PageState } from '@/components/ui';
import { savedEntries } from '@/domain/selectors';
import { act, actorId, api, usePageLoad, useDb, useMe } from '@/store';

export default function SavedPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('salvos');
  const list = savedEntries(db, me);
  return (
    <>
      <PageHeader title="Salvos" />
      <PageState state={state} retry={retry} rows={2}>
        {list.length ? <ul className="vol-list pad">{list.map((s) => <li key={s.key}><Link href={s.content!.href}>{s.content!.title}</Link>{s.key.startsWith('relato') && <span className="sample">Pode ser falso</span>}<Button onClick={() => act(() => api.toggleSave(actorId(), s.key), 'Removido dos salvos.')}>Remover</Button></li>)}</ul> : <EmptyState title="Nada salvo ainda" text={me.role === 'visitante' ? 'Entre como morador para salvar conteúdos.' : 'Toque em Salvar em qualquer notícia para ler depois.'} />}
      </PageState>
    </>
  );
}
