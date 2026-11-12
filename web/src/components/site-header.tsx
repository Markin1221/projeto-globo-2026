'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, CircleUserRound } from 'lucide-react';
import { Logo } from './brand';

const sections = [
  ['/', 'Últimas'], ['/explorar', 'Bairros'], ['/mapa', 'Mapa da região'],
  ['/telejornais', 'Telejornais'], ['/relatos', 'Voz dos moradores'],
  ['/casos', 'Acompanhamento'], ['/alertas', 'Alertas'],
];

export function SiteHeader({ onMenu }: { onMenu?: () => void }) {
  const path = usePathname();
  return <header className="site-header">
    <nav className="network-bar" aria-label="Portais Globo">
      <div className="network-links">
        <a href="https://www.globo.com/" className="network-globo">globo.com</a>
        <a href="https://g1.globo.com/" className="network-g1">g1</a>
        <a href="https://ge.globo.com/" className="network-ge">ge</a>
        <a href="https://gshow.globo.com/" className="network-gshow">gshow</a>
        <Link href="/" className="network-gvila" aria-label="GloboVila">gvila</Link>
      </div>
      <span className="network-caption">Informação perto de você</span>
    </nav>
    <div className="masthead">
      <div className="masthead-inner">
        {onMenu ? <button className="masthead-action" type="button" onClick={onMenu} aria-haspopup="dialog"><Menu size={26} aria-hidden /><span>Menu</span></button>
          : <Link href="/explorar" className="masthead-action"><Menu size={26} aria-hidden /><span>Bairros</span></Link>}
        <Link href="/" className="masthead-brand" aria-label="GloboVila, início"><Logo /></Link>
        <div className="masthead-tools">
          <Link href="/busca" className="masthead-action" aria-label="Buscar"><Search size={24} aria-hidden /><span>Buscar</span></Link>
          <Link href="/perfil" className="masthead-action" aria-label="Meu perfil"><CircleUserRound size={26} aria-hidden /><span>Meu perfil</span></Link>
        </div>
      </div>
    </div>
    <nav className="section-bar" aria-label="Seções GloboVila">
      {sections.map(([href, label]) => <Link key={href} href={href} aria-current={(href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined}>{label}</Link>)}
    </nav>
  </header>;
}
