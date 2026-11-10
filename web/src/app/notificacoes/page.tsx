'use client';
import Link from 'next/link';
import { Bell, Radio, ShieldCheck, Siren, MessageCircle, Users } from 'lucide-react';
import { PageHeader } from '@/components/shell-parts';
import { Button, EmptyState, PageState, timeAgo } from '@/components/ui';
import { act, actorId, api, usePageLoad, useDb, useMe } from '@/store';

const ICONS = { 'ao-vivo': Radio, relato: Users, comentario: MessageCircle, alerta: Siren, sistema: Bell, redacao: ShieldCheck };

export default function NotificationsPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('notificacoes');
  const list = db.notifications.filter((n) => n.userId === me.id).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <>
      <PageHeader title="Notificações" right={list.some((n) => !n.read) ? <Button onClick={() => act(() => api.markRead(actorId()), 'Tudo marcado como lido.')}>Marcar como lidas</Button> : undefined} />
      <PageState state={state} retry={retry} rows={3}>
        {list.length ? <ul className="notifs">{list.map((n) => { const I = ICONS[n.kind]; return <li key={n.id} className={n.read ? '' : 'unread'}><Link href={n.href} onClick={() => api.markRead(actorId(), n.id)}><I size={20} aria-hidden /><div><strong>{n.title}{!n.read && <span className="sr-only"> (não lida)</span>}</strong><p>{n.body}</p><small>{timeAgo(n.createdAt)}</small></div></Link></li>; })}</ul> : <EmptyState title="Nenhuma notificação" text={me.role === 'visitante' ? 'Visitantes não recebem avisos. Entre como morador para ser avisado.' : 'Siga um bairro e avisamos quando ele for pauta.'} />}
      </PageState>
    </>
  );
}
