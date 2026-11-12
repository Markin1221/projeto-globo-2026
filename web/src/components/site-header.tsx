'use client';
// Cabeçalho no padrão dos portais da Globo: barra de sites, faixa com MENU e logo e seções.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CircleUserRound, Menu, Search, X } from 'lucide-react';
import { Logo } from './brand';

/** Sites da rede, como links de texto nas cores de cada um (sem reproduzir logotipos). */
export const NETWORK = [
  { href: 'https://www.globo.com/', label: 'globo.com', cls: 'network-globo' },
  { href: 'https://g1.globo.com/', label: 'g1', cls: 'network-g1' },
  { href: 'https://ge.globo.com/', label: 'ge', cls: 'network-ge' },
  { href: 'https://gshow.globo.com/', label: 'gshow', cls: 'network-gshow' },
  { href: 'https://globoplay.globo.com/', label: 'globoplay', cls: 'network-globoplay' },
  { href: 'https://receitas.globo.com/', label: 'receitas', cls: 'network-receitas' },
  { href: 'https://www.globo.com/globopop/', label: 'globopop', cls: 'network-globopop' },
];

const sections = [
  ['/', 'Últimas'], ['/explorar', 'Bairros'], ['/mapa', 'Mapa da região'],
  ['/telejornais', 'Telejornais'], ['/relatos', 'Voz dos moradores'],
  ['/casos', 'Acompanhamento'], ['/alertas', 'Alertas'],
];
/** Busca no cabeçalho: um clique expande o campo e Enter mostra os resultados. */
function HeaderSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const expand = () => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); };
  const close = () => { setOpen(false); setQ(''); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return input.current?.focus();
    router.push(`/busca?q=${encodeURIComponent(term)}`);
    window.dispatchEvent(new CustomEvent('gv-search', { detail: term }));
    input.current?.blur();
  };
  return (
    <form role="search" className={`header-search ${open ? 'open' : ''}`} onSubmit={submit}
      onClick={() => !open && expand()}
      onBlur={(e) => { if (!q && !e.currentTarget.contains(e.relatedTarget as Node)) close(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { close(); input.current?.blur(); } }}>
      <button type={open ? 'submit' : 'button'} className="header-search-icon" aria-label={open ? 'Pesquisar' : 'Abrir busca'} onClick={(e) => { if (!open) { e.preventDefault(); expand(); } }}><Search size={20} aria-hidden /></button>
      <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="BUSCAR" aria-label="Buscar bairro, tema ou palavra" tabIndex={open ? 0 : -1} />
      {open && q && <button type="button" className="header-search-clear" aria-label="Limpar busca" onClick={() => { setQ(''); input.current?.focus(); }}><X size={18} aria-hidden /></button>}
    </form>
  );
}

export function SiteHeader({ onMenu }: { onMenu?: () => void }) {
  const path = usePathname();
  return <header className="site-header">
    <nav className="network-bar" aria-label="Sites da Globo">
      <div className="network-links">
        {NETWORK.map((n) => <a key={n.href} href={n.href} className={n.cls}>{n.label}</a>)}
        <Link href="/" className="network-gvila" aria-label="GloboVila">gvila</Link>
      </div>
    </nav>
    <div className="masthead">
      <div className="masthead-inner">
        <div className="masthead-left">
          {onMenu ? <button className="masthead-action" type="button" onClick={onMenu} aria-haspopup="dialog"><Menu size={26} aria-hidden /><span>MENU</span></button>
            : <Link href="/" className="masthead-action"><Menu size={26} aria-hidden /><span>MENU</span></Link>}
        </div>
        <Link href="/" className="masthead-brand" aria-label="GloboVila, início"><Logo /></Link>
        <div className="masthead-tools">
          <HeaderSearch />
          <Link href="/perfil" className="masthead-action" aria-label="Meu perfil"><CircleUserRound size={26} aria-hidden /><span>PERFIL</span></Link>
        </div>
      </div>
    </div>
    <nav className="section-bar" aria-label="Seções GloboVila">
      {sections.map(([href, label]) => <Link key={href} href={href} aria-current={(href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined}>{label}</Link>)}
    </nav>
  </header>;
}
