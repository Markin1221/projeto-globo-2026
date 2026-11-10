'use client';
import Link from 'next/link';
import { RelatoCard } from '@/components/cards';
import { PageHeader } from '@/components/shell-parts';
import { Avatar, EmptyState, NotFoundState } from '@/components/ui';
import { ROLE_LABEL } from '@/domain/rules';
import { bairroName, listedRelatos, userById } from '@/domain/selectors';
import { useDb } from '@/store';

export function ProfileView({ id, own }: { id: string; own?: boolean }) {
  const db = useDb();
  const u = userById(db, id);
  if (!u || u.deleted || u.role === 'visitante') return <><PageHeader title="Perfil" back /><NotFoundState what="Perfil" /></>;
  const relatos = listedRelatos(db).filter((r) => r.authorId === id);
  const articles = db.articles.filter((a) => a.authorId === id).slice(0, 5);
  return (
    <>
      <PageHeader title={own ? 'Meu perfil' : u.name} back={!own} />
      <section className="profile">
        <Avatar user={u} size={84} />
        <h2>{u.name}</h2>
        <p className="muted">@{u.handle}, {ROLE_LABEL[u.role]}{u.blocked ? ', conta bloqueada' : ''}</p>
        <p>{u.bio}</p>
        {u.followed.length > 0 && <p className="chips">{u.followed.map((b) => <Link key={b} className="chip" href={`/bairro/${b}`}>{bairroName(db, b)}</Link>)}</p>}
        {own && <Link className="btn btn-outline" href="/configuracoes">Editar preferências</Link>}
      </section>
      {articles.length > 0 && <section className="pad"><h3>Publicações na redação</h3><ul className="vol-list">{articles.map((a) => <li key={a.id}><Link href={`/materia/${a.id}`}>{a.title}</Link></li>)}</ul></section>}
      <div className="relatos-area"><h3 className="area-title">Relatos enviados</h3>{relatos.length ? relatos.map((r) => <RelatoCard key={r.id} relato={r} />) : <EmptyState title="Nenhum relato público" />}</div>
    </>
  );
}
