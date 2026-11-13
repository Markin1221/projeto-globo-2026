'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Gavel, Home, X, LayoutDashboard, Map, Menu, Megaphone, Newspaper, Route, Settings, Siren, Tv, Users } from 'lucide-react';
import type { Role } from '@/domain/types';
import { boot, setFont, setPrefs, useDb, useMe, useUi } from '@/store';
import { LiveBanner, ModeToggle, NEXT_THEME, ProfileSwitcher, RightRail, SpeechBar, THEME_LABEL, Toasts, UserLine } from './shell-parts';
import { NETWORK, SiteHeader } from './site-header';
import { SimpleMode } from './simple-mode';
import { ErrorState, Skeleton } from './ui';

// group: onde o item aparece no menu lateral. 'mais': só no menu "Mais" do celular (fica fora do caminho, mas acessível).
interface NavItem { href: string; label: string; icon: typeof Home; roles?: Role[]; badge?: 'notif' | 'alerts'; group: 'descobrir' | 'espaco' | 'redacao' | 'mais' }
const NAV: NavItem[] = [
  { href: '/', label: 'Início', icon: Home, group: 'descobrir' },
  { href: '/mapa', label: 'Mapa', icon: Map, group: 'descobrir' },
  { href: '/telejornais', label: 'Telejornais', icon: Tv, group: 'descobrir' },
  { href: '/relatos', label: 'Relatos dos moradores', icon: Users, group: 'descobrir' },
  { href: '/alertas', label: 'Alertas', icon: Siren, badge: 'alerts', group: 'espaco' },
  { href: '/notificacoes', label: 'Notificações', icon: Bell, badge: 'notif', group: 'espaco' },
  { href: '/relatar', label: 'Relatar', icon: Megaphone, group: 'espaco' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings, group: 'espaco' },
  { href: '/casos', label: 'Casos e agenda', icon: Route, group: 'mais' },
  { href: '/jornalista', label: 'Painel do Jornalista', icon: Newspaper, roles: ['jornalista'], group: 'redacao' },
  { href: '/moderacao', label: 'Moderação', icon: Gavel, roles: ['moderador'], group: 'redacao' },
  { href: '/admin', label: 'Admin', icon: LayoutDashboard, roles: ['admin'], group: 'redacao' },
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
            <span className="nav-icon"><Icon size={26} strokeWidth={on ? 2.4 : 1.8} aria-hidden />{count > 0 && <span className="nav-badge">{count}<span className="sr-only"> novos</span></span>}</span>
            <span className="nav-label">{n.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export { Logo } from './brand';

/** Menu em gaveta pela esquerda, no padrão da globo.com: conta, seções do app, sites da Globo e acessibilidade. */
function MenuDrawer({ open, onClose, items }: { open: boolean; onClose: () => void; items: NavItem[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { prefs } = useUi();
  const me = useMe();
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (open && !el.open) { setClosing(false); el.showModal(); }
    if (!open && el.open) el.close();
  }, [open]);
  // Fecha com animação (desliza de volta) antes de sumir.
  const close = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    setClosing(true); setTimeout(() => { setClosing(false); onClose(); }, 200);
  };
  const app = items.filter((n) => n.group !== 'redacao');
  const staff = items.filter((n) => n.group === 'redacao');
  return (
    <dialog ref={ref} className={`drawer ${closing ? 'closing' : ''}`} aria-label="Menu" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === ref.current) close(); }}>
      {open && (
        <div className="drawer-body">
          <div className="drawer-top">
            <Link href="/perfil" className="drawer-account" onClick={close}>
              <UserLine />
              <small>{me.role === 'visitante' ? 'Acesse sua conta ou escolha um perfil abaixo' : 'Ver meu perfil'}</small>
            </Link>
            <button type="button" className="icon-btn" aria-label="Fechar o menu" onClick={close}><X size={22} aria-hidden /></button>
          </div>
          <nav className="drawer-section" aria-label="GloboVila">
            <p className="drawer-label">GloboVila</p>
            <div className="drawer-links"><NavLinks items={app} onNavigate={close} /></div>
          </nav>
          {staff.length > 0 && (
            <nav className="drawer-section" aria-label="Redação">
              <p className="drawer-label">Redação</p>
              <div className="drawer-links"><NavLinks items={staff} onNavigate={close} /></div>
            </nav>
          )}
          <nav className="drawer-section" aria-label="Sites da Globo">
            <p className="drawer-label">Sites da Globo</p>
            <ul className="drawer-sites">{NETWORK.map((n) => <li key={n.href}><a href={n.href} className={n.cls}><span className="site-dot" aria-hidden />{n.label}</a></li>)}</ul>
          </nav>
          <section className="drawer-section" aria-label="Acessibilidade">
            <p className="drawer-label">Acessibilidade</p>
            <ModeToggle />
            <div className="more-view" role="group" aria-label="Aparência">
              <button type="button" className="btn btn-outline" onClick={() => setFont(-0.1)} aria-label="Diminuir a letra">A−</button>
              <button type="button" className="btn btn-outline" onClick={() => setFont(0.1)} aria-label="Aumentar a letra">A+</button>
              <button type="button" className="btn btn-outline" onClick={() => setPrefs({ theme: NEXT_THEME[prefs.theme] })}>Tema: {THEME_LABEL[prefs.theme]}</button>
            </div>
          </section>
          <section className="drawer-section"><ProfileSwitcher /></section>
        </div>
      )}
    </dialog>
  );
}

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
    <>
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <SiteHeader onMenu={() => setMore(true)} />
      <div className="shell globovila-shell">
      <main id="conteudo" className="center" ref={main} tabIndex={-1}>{children}</main>
      <RightRail />
      <LiveBanner />
      <nav className="bottom" aria-label="Atalhos">
        <NavLinks items={BOTTOM.map((h) => NAV.find((n) => n.href === h)!)} />
        <button type="button" className="nav-link" onClick={() => setMore(true)}><span className="nav-icon"><Menu size={23} aria-hidden /></span><span className="nav-label">Mais</span></button>
      </nav>
      <MenuDrawer open={more} onClose={() => setMore(false)} items={items} />
    </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const { prefs } = useUi();
  useEffect(() => { boot().then(() => setReady('ready'), () => setReady('error')); }, [attempt]);
  if (ready === 'loading') return <><SiteHeader /><div className="boot"><Skeleton rows={3} /></div></>;
  if (ready === 'error') return <><SiteHeader /><div className="boot"><ErrorState onRetry={() => { setReady('loading'); setAttempt((a) => a + 1); }} /></div></>;
  return (
    <>
      {prefs.simple ? <><SiteHeader simple /><SimpleMode /></> : <FullShell>{children}</FullShell>}
      <SpeechBar />
      <Toasts />
    </>
  );
}
