'use client';
import { useState } from 'react';
import { Check, MapPin, Plus } from 'lucide-react';
import { canFollow, searchPlaces } from '@/domain/rules';
import { bairroById } from '@/domain/selectors';
import { act, actorId, api, toast, useDb, useMe } from '@/store';
import { Button, Modal } from './ui';

/** Seguir sempre confirma quando o bairro tem nome parecido com outro. */
export function FollowButton({ bairroId }: { bairroId: string }) {
  const db = useDb();
  const me = useMe();
  const [ask, setAsk] = useState<string | null>(null);
  const b = bairroById(db, bairroId);
  if (!b) return null;
  const following = me.followed.includes(bairroId);
  const follow = () => act(() => api.followBairro(actorId(), bairroId), `Agora você segue ${b.name}.`);
  const click = () => {
    if (following) { act(() => api.unfollowBairro(actorId(), bairroId), `Você deixou de seguir ${b.name}.`); return; }
    if (!canFollow(me)) { toast('Entre como morador para seguir bairros.', 'info'); return; }
    const confirm = searchPlaces(b.name, db.bairros, []).find((c) => c.bairroId === bairroId)?.confirm;
    if (confirm) setAsk(confirm); else follow();
  };
  return (
    <>
      <Button variant={following ? 'outline' : 'primary'} aria-pressed={following} onClick={click}>{following ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden />}{following ? 'Seguindo' : 'Seguir'}</Button>
      <Modal open={!!ask} onClose={() => setAsk(null)} title="Confirme o bairro">
        <p className="lead-text"><MapPin size={18} aria-hidden /> {ask}</p>
        <div className="row end"><Button variant="ghost" onClick={() => setAsk(null)}>Não é esse</Button><Button variant="primary" onClick={() => { setAsk(null); follow(); }}>Sim, seguir {b.name}</Button></div>
      </Modal>
    </>
  );
}
