'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CityMap, MapLegend } from '@/components/city-map';
import { PageHeader } from '@/components/shell-parts';
import { PageState } from '@/components/ui';
import { newsVolume } from '@/domain/selectors';
import { usePageLoad, useDb, useMe } from '@/store';

const CITY_KEY = 'bairro-em-pauta:city';

export default function MapPage() {
  const db = useDb();
  const me = useMe();
  const { state, retry } = usePageLoad('mapa');
  const [cityId, setCityId] = useState('recife');
  useEffect(() => {
    try { const c = localStorage.getItem(CITY_KEY); if (c) setCityId(c); } catch { /* padrão: Recife */ }
  }, []);
  const choose = (id: string) => { setCityId(id); try { localStorage.setItem(CITY_KEY, id); } catch { /* ok */ } };
  const city = db.cities.find((c) => c.id === cityId) ?? db.cities[0];
  const list = db.bairros.filter((b) => b.active && b.cityId === city?.id).map((b) => ({ b, v: newsVolume(db, b.id) })).sort((a, b) => b.v - a.v);
  return (
    <>
      <PageHeader title="Mapa de notícias" />
      <PageState state={state} retry={retry} rows={2}>
        <div className="map-page">
          <div className="row between">
            <label className="city-select">Cidade
              <select value={city?.id} onChange={(e) => choose(e.target.value)}>{db.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <MapLegend />
          </div>
          {city && <CityMap db={db} city={city} mode={{ kind: 'volume', followed: me.followed }} label={`Mapa de ${city.name} com os bairros coloridos pelo volume de notícias. A lista abaixo traz os mesmos dados.`} />}
          <p className="muted">Quanto mais forte a cor e maior o círculo, mais vezes o bairro foi pauta. Toque em um bairro para abrir. Contorno claro: bairros que você segue.</p>
          <h2>Bairros de {city?.name}</h2>
          <ul className="vol-list">{list.map(({ b, v }) => <li key={b.id}><Link href={`/bairro/${b.id}`}>{b.name}</Link><span>{v} {v === 1 ? 'notícia' : 'notícias'}</span></li>)}</ul>
        </div>
      </PageState>
    </>
  );
}
