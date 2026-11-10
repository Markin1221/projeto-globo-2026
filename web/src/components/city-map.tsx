'use client';
// Mapa real (OpenStreetMap via CARTO) com os bairros sobrepostos, coloridos pelo volume de notícias.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type * as Leaflet from 'leaflet';
import { nearestBairro } from '@/domain/rules';
import { newsVolume } from '@/domain/selectors';
import type { Bairro, City, Db, LatLng } from '@/domain/types';
import { useUi } from '@/store';

export const volumeLevel = (v: number) => (v === 0 ? 0 : v <= 1 ? 1 : v <= 3 ? 2 : v <= 5 ? 3 : 4);
export const LEVEL_TEXT = ['Sem notícias', '1 notícia', '2 a 3', '4 a 5', '6 ou mais'];

type Mode =
  | { kind: 'volume'; followed: string[] }
  | { kind: 'pick'; pin?: LatLng; selected?: string; onPick: (p: LatLng & { bairroId: string }) => void }
  | { kind: 'show'; pin?: LatLng; selected?: string };

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#c8102e';

export function CityMap({ db, city, mode, label, height = 460 }: { db: Db; city?: City; mode: Mode; label: string; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const router = useRouter();
  const { prefs } = useUi();
  const [ready, setReady] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const cityId = city?.id ?? db.bairros.find((b) => b.id === (mode.kind !== 'volume' ? mode.selected : ''))?.cityId ?? db.cities[0]?.id;
  const cityObj = db.cities.find((c) => c.id === cityId);
  const bairros = db.bairros.filter((b) => b.active && (mode.kind !== 'volume' || b.cityId === cityId));

  // Cria o mapa uma vez.
  useEffect(() => {
    let alive = true;
    import('leaflet').then((mod) => {
      if (!alive || !el.current || map.current) return;
      L.current = mod;
      const m = mod.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
      m.on('click', (e: Leaflet.LeafletMouseEvent) => {
        const md = modeRef.current;
        if (md.kind !== 'pick') return;
        const p = { lat: e.latlng.lat, lng: e.latlng.lng };
        const near = nearestBairro(p, db.bairros);
        if (near) md.onPick({ ...p, bairroId: near.id });
      });
      map.current = m;
      layer.current = mod.layerGroup().addTo(m);
      setReady(true);
    });
    return () => { alive = false; map.current?.remove(); map.current = null; layer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const mod = L.current, m = map.current, g = layer.current;
    if (!mod || !m || !g) return;
    const dark = prefs.theme !== 'light';
    tiles.current?.remove();
    tiles.current = mod.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      subdomains: 'abcd', maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(m);
    g.clearLayers();
    const md = modeRef.current;
    const colors = [0, 1, 2, 3, 4].map((i) => cssVar(`--m${i}`));
    const mark = cssVar('--mark');
    const text = cssVar('--text');

    const shape = (b: Bairro, style: Leaflet.PathOptions, r: number) => b.boundary
      ? mod.geoJSON(b.boundary as GeoJSON.GeoJsonObject, { style })
      : mod.circleMarker([b.lat, b.lng], { ...style, radius: r });

    if (md.kind === 'volume') {
      for (const b of bairros) {
        const v = newsVolume(db, b.id);
        const lv = volumeLevel(v);
        const followed = md.followed.includes(b.id);
        const s = shape(b, { color: followed ? text : colors[Math.max(lv, 1)], weight: followed ? 3 : 1.5, fillColor: colors[lv], fillOpacity: lv === 0 ? 0.35 : 0.72 }, 12 + lv * 4);
        s.bindTooltip(`<strong>${b.name}</strong><br>${v} ${v === 1 ? 'notícia' : 'notícias'}`, { direction: 'top', permanent: false, className: 'map-tip' });
        s.on('click', () => router.push(`/bairro/${b.id}`));
        s.addTo(g);
        mod.marker([b.lat, b.lng], {
          interactive: false, keyboard: false,
          icon: mod.divIcon({ className: 'map-label', html: `<span>${b.name}</span>`, iconSize: [0, 0] }),
        }).addTo(g);
      }
    } else {
      for (const b of bairros) {
        if (b.id !== md.selected) continue;
        shape(b, { color: mark, weight: 3, fillColor: mark, fillOpacity: 0.18 }, 26).addTo(g);
      }
      if (md.pin) mod.circleMarker([md.pin.lat, md.pin.lng], { radius: 9, color: '#1b1400', weight: 2, fillColor: mark, fillOpacity: 1 }).addTo(g);
    }
  }

  // Redesenha quando dados, modo ou tema mudam.
  useEffect(() => { draw(); });

  // Enquadra a cidade (ou o ponto) quando a cidade ou o alvo mudam.
  const sel = mode.kind !== 'volume' ? mode.selected : undefined;
  const pinKey = mode.kind !== 'volume' && mode.pin ? `${mode.pin.lat.toFixed(4)},${mode.pin.lng.toFixed(4)}` : '';
  useEffect(() => {
    const m = map.current, mod = L.current;
    if (!m || !mod) return;
    const md = modeRef.current;
    const focus = md.kind !== 'volume' ? (md.pin ?? db.bairros.find((b) => b.id === md.selected)) : undefined;
    if (focus) { m.setView([focus.lat, focus.lng], md.kind === 'pick' ? 14 : 15); return; }
    const pts = bairros.map((b) => [b.lat, b.lng] as [number, number]);
    if (pts.length > 1) m.fitBounds(mod.latLngBounds(pts), { padding: [36, 36] });
    else if (cityObj) m.setView([cityObj.lat, cityObj.lng], cityObj.zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cityId, sel, pinKey]);

  return <div ref={el} className="city-map" style={{ height }} role="application" aria-label={label} />;
}

export function MapLegend() {
  return (
    <ul className="legend" aria-label="Legenda do volume de notícias">
      {LEVEL_TEXT.map((t, i) => <li key={t}><span className={`swatch lv${i}`} aria-hidden />{t}</li>)}
    </ul>
  );
}
