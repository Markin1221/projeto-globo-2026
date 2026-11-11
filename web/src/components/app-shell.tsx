'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Bookmark, Compass, Gavel, Home, LayoutDashboard, Map, Menu, Megaphone, Newspaper, Settings, Siren, Tv, User as UserIcon, Users, Route, Radar } from 'lucide-react';
import type { Role } from '@/domain/types';
import { boot, setFont, setPrefs, useDb, useMe, useUi } from '@/store';
import { DemoGuide, LiveBanner, NEXT_THEME, ProfileSwitcher, RightRail, SpeechBar, THEME_LABEL, Toasts, UserLine } from './shell-parts';
import { SimpleMode } from './simple-mode';
import { ErrorState, Modal, Skeleton } from './ui';

interface NavItem { href: string; label: string; icon: typeof Home; roles?: Role[]; badge?: 'notif' | 'alerts' }
const NAV: NavItem[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/explorar', label: 'Explorar', icon: Compass },
  { href: '/mapa', label: 'Mapa', icon: Map },
  { href: '/telejornais', label: 'Telejornais', icon: Tv },
  { href: '/relatos', label: 'Relatos dos moradores', icon: Users },
  { href: '/casos', label: 'Acompanhamento', icon: Route },
  { href: '/alertas', label: 'Alertas', icon: Siren, badge: 'alerts' },
  { href: '/notificacoes', label: 'Notificações', icon: Bell, badge: 'notif' },
  { href: '/relatar', label: 'Relatar', icon: Megaphone },
  { href: '/salvos', label: 'Salvos', icon: Bookmark },
  { href: '/perfil', label: 'Perfil', icon: UserIcon },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/jornalista', label: 'Painel do Jornalista', icon: Newspaper, roles: ['jornalista'] },
  { href: '/moderacao', label: 'Moderação', icon: Gavel, roles: ['moderador'] },
  { href: '/admin', label: 'Admin', icon: LayoutDashboard, roles: ['admin'] },
];
const BOTTOM = ['/', '/mapa', '/relatar', '/alertas'];

function useBadges() {
  const db = useDb();
  const me = useMe();
  return {
    notif: db.notifications.filter((n) => n.userId === me.id && !n.read).length,
    alerts: db.alerts.filter((a) => a.active && me.followed.includes(a.bairroId)).length,
  };
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  const badges = useBadges();
  return (
    <>
      {items.map((n) => {
        const on = n.href === '/' ? path === '/' : path.startsWith(n.href);
        const Icon = n.icon;
        const count = n.badge ? badges[n.badge] : 0;
        return (
          <Link key={n.href} href={n.href} className={on ? 'nav-link on' : 'nav-link'} title={n.label} aria-label={count > 0 ? `${n.label}, ${count} novos` : n.label} aria-current={on ? 'page' : undefined} onClick={onNavigate}>
            <span className="nav-icon"><Icon size={23} aria-hidden />{count > 0 && <span className="nav-badge">{count}<span className="sr-only"> novos</span></span>}</span>
            <span className="nav-label">{n.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export const Logo = () => <span className="logo" aria-hidden><Radar size={26} strokeWidth={1.7} /></span>;

function FullShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { prefs } = useUi();
  const path = usePathname();
  const main = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => !n.roles || n.roles.includes(me.role));
  const firstRender = useRef(true);
  // Na troca de rota, leva o foco ao conteúdo; na primeira carga, preserva o link de pular.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [path]);
  return (
    <div className="shell">
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <nav className="side" aria-label="Principal">
        <Link href="/" className="brand" aria-label="Amigo da Vizinhança, início"><Logo /><span className="brand-copy">Amigo da Vizinhança<small>Informação perto de você</small></span></Link>
        <div className="side-links">
          <div className="nav-group"><p className="nav-section-label">Descobrir</p><NavLinks items={items.filter((n) => NAV.indexOf(n) < 6)} /></div>
          <div className="nav-group"><p className="nav-section-label">Seu espaço</p><NavLinks items={items.filter((n) => NAV.indexOf(n) >= 6 && !n.roles)} /></div>
          {items.some((n) => n.roles) && <div className="nav-group"><p className="nav-section-label">Redação</p><NavLinks items={items.filter((n) => n.roles)} /></div>}
        </div>
        <div className="side-foot"><UserLine /><ProfileSwitcher /><p className="sample-note">Protótipo. Todo o conteúdo é de exemplo.</p></div>
      </nav>
      <main id="conteudo" className="center" ref={main} tabIndex={-1}>{children}</main>
      <RightRail />
      <LiveBanner />
      <nav className="bottom" aria-label="Atalhos">
        <NavLinks items={BOTTOM.map((h) => NAV.find((n) => n.href === h)!)} />
        <button type="button" className="nav-link" onClick={() => setMore(true)}><span className="nav-icon"><Menu size={23} aria-hidden /></span><span className="nav-label">Mais</span></button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Menu">
        <div className="more-view" role="group" aria-label="Aparência">
          <button type="button" className="btn btn-outline" onClick={() => setFont(-0.1)} aria-label="Diminuir a letra">A−</button>
          <button type="button" className="btn btn-outline" onClick={() => setFont(0.1)} aria-label="Aumentar a letra">A+</button>
          <button type="button" className="btn btn-outline" onClick={() => setPrefs({ theme: NEXT_THEME[prefs.theme] })}>Tema: {THEME_LABEL[prefs.theme]}</button>
        </div>
        <div className="more-links"><NavLinks items={items} onNavigate={() => setMore(false)} /></div>
        <ProfileSwitcher />
      </Modal>
      <DemoGuide />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const { prefs } = useUi();
  useEffect(() => { boot().then(() => setReady('ready'), () => setReady('error')); }, [attempt]);
  if (ready === 'loading') return <div className="boot"><Skeleton rows={3} /></div>;
  if (ready === 'error') return <div className="boot"><ErrorState onRetry={() => { setReady('loading'); setAttempt((a) => a + 1); }} /></div>;
  return (
    <>
      {prefs.simple ? <SimpleMode /> : <FullShell>{children}</FullShell>}
      <SpeechBar />
      <Toasts />
    </>
  );
}
