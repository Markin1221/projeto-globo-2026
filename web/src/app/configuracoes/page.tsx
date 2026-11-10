'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BairroPicker } from '@/components/dialogs';
import { ModeToggle, PageHeader } from '@/components/shell-parts';
import { Button, EmptyState, Field, Modal, Tabs } from '@/components/ui';
import { canFollow } from '@/domain/rules';
import { bairroName } from '@/domain/selectors';
import { act, actorId, api, setFailing, setFont, setPrefs, toast, useDb, useMe, useUi, type Theme } from '@/store';

function Accessibility() {
  const { prefs, failing } = useUi();
  return (
    <div className="pad stack">
      <section><h2>Modo Simples</h2><p className="muted">Botões e letras grandes, um item por vez, só as funções essenciais.</p><ModeToggle /></section>
      <section><h2>Tamanho da letra</h2><div className="row"><Button aria-label="Diminuir letra" onClick={() => setFont(-0.1)}>A-</Button><span aria-live="polite">{Math.round(prefs.font * 100)}%</span><Button aria-label="Aumentar letra" onClick={() => setFont(0.1)}>A+</Button></div></section>
      <section><h2>Aparência</h2><div className="row">{([['dark', 'Escuro'], ['light', 'Claro'], ['contrast', 'Alto contraste']] as [Theme, string][]).map(([t, l]) => <Button key={t} aria-pressed={prefs.theme === t} className={prefs.theme === t ? 'sel' : ''} onClick={() => setPrefs({ theme: t })}>{l}</Button>)}</div></section>
      <section><h2>Voz da leitura</h2><p className="muted">A voz neural soa mais natural e é gerada no servidor. A voz do aparelho funciona sem internet.</p><div className="row">{([['neural', 'Voz neural'], ['navegador', 'Voz do aparelho']] as const).map(([v, l]) => <Button key={v} aria-pressed={prefs.voice === v} className={prefs.voice === v ? 'sel' : ''} onClick={() => setPrefs({ voice: v })}>{l}</Button>)}</div></section>
      <section><h2>Demonstração</h2><label className="check"><input type="checkbox" checked={failing} onChange={(e) => setFailing(e.target.checked)} />Simular falha de conexão (mostra os estados de erro)</label></section>
    </div>
  );
}

function Bairros() {
  const db = useDb();
  const me = useMe();
  const [picker, setPicker] = useState(false);
  if (!canFollow(me)) return <EmptyState title="Visitantes não seguem bairros" text="Entre como morador para seguir." />;
  return (
    <div className="pad">
      <div className="row between"><h2>Bairros que você segue</h2><Button variant="primary" onClick={() => setPicker(true)}>Seguir um bairro</Button></div>
      {me.followed.length ? <ul className="vol-list">{me.followed.map((b) => <li key={b}><Link href={`/bairro/${b}`}>{bairroName(db, b)}</Link><Button onClick={() => act(() => api.unfollowBairro(actorId(), b), 'Deixou de seguir.')}>Deixar de seguir</Button></li>)}</ul> : <EmptyState title="Nenhum bairro seguido" />}
      <BairroPicker open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}

function Privacy() {
  const db = useDb();
  const me = useMe();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState('');
  const contact = db.relatos.filter((r) => r.authorId === me.id).map((r) => db.relatoContacts[r.id]).find(Boolean);
  if (me.role === 'visitante') return <EmptyState title="Visitantes não têm conta" text="Guardamos apenas o nome e a idade informados em cada comentário." />;
  const remove = async () => {
    const ok = await act(() => api.deleteAccount(actorId()).then(() => true));
    if (ok) { setPrefs({ actorHandle: 'visitante' }); setAsk(false); toast('Conta e dados apagados.'); router.push('/'); }
  };
  return (
    <div className="pad stack">
      <h2>O que a plataforma sabe sobre você</h2>
      <dl className="dl">
        <dt>Nome</dt><dd>{me.name}</dd>
        <dt>Bairros seguidos</dt><dd>{me.followed.length ? me.followed.map((b) => bairroName(db, b)).join(', ') : 'Nenhum'}</dd>
        <dt>Localização</dt><dd>{me.locationAllowed ? me.location : 'Não guardamos. Só com sua permissão.'}{me.locationAllowed && <> <Button onClick={() => act(() => api.setLocation(actorId(), false), 'Localização apagada.')}>Apagar</Button></>}</dd>
        <dt>Contato</dt><dd>{contact ? `${contact.fullName}, ${contact.phone}, ${contact.address}` : 'Nenhum dado de contato enviado.'}</dd>
        <dt>Quem vê seu contato</dt><dd>Só jornalistas e administradores.</dd>
        <dt>Salvos</dt><dd>{me.saved.length} itens</dd>
      </dl>
      <section className="danger-zone"><h3>Apagar conta e dados</h3><p>Remove bairros seguidos, salvos, localização e dados de contato. Seus relatos ficam anônimos.</p><Button variant="danger" onClick={() => setAsk(true)}>Apagar minha conta</Button></section>
      <Modal open={ask} onClose={() => setAsk(false)} title="Apagar conta e dados?">
        <p>Esta ação não pode ser desfeita.</p>
        <Field id="del" label="Digite APAGAR para confirmar"><input id="del" value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>
        <div className="row end"><Button variant="ghost" onClick={() => setAsk(false)}>Cancelar</Button><Button variant="danger" disabled={typed !== 'APAGAR'} onClick={remove}>Apagar definitivamente</Button></div>
      </Modal>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'acess' | 'bairros' | 'priv'>('acess');
  return (
    <>
      <PageHeader title="Configurações" />
      <Tabs label="Configurações" value={tab} onChange={setTab} tabs={[{ id: 'acess', label: 'Acessibilidade' }, { id: 'bairros', label: 'Bairros' }, { id: 'priv', label: 'Privacidade' }]} />
      {tab === 'acess' && <Accessibility />}{tab === 'bairros' && <Bairros />}{tab === 'priv' && <Privacy />}
    </>
  );
}
