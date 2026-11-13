import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/atkinson-hyperlegible-next/index.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './design.css';
import './globovila.css';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'gvila',
  description: 'GloboVila: o radar do seu bairro. Saiba sempre que ele for pauta nos telejornais. Protótipo com dados de exemplo.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Aplica tema e tamanho de fonte antes da primeira pintura, evitando flash.
const prefsScript = `try{var p=JSON.parse(localStorage.getItem('bairro-em-pauta:prefs')||'{}');document.documentElement.dataset.theme=p.theme||'light';if(p.font)document.documentElement.style.fontSize=(p.font*100)+'%'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: prefsScript }} /></head>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
