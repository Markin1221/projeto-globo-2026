'use client';
import { ProfileView } from '@/components/profile-view';
import { PageHeader, ProfileSwitcher } from '@/components/shell-parts';
import { EmptyState } from '@/components/ui';
import { useMe } from '@/store';
export default function MyProfile() {
  const me = useMe();
  if (me.role === 'visitante') return <><PageHeader title="Perfil" /><EmptyState title="Você está como visitante" text="Visitantes leem e comentam informando nome e idade. Para seguir bairros e publicar relatos, entre como morador." action={<ProfileSwitcher />} /></>;
  return <ProfileView id={me.id} own />;
}
