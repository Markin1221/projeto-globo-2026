// Exemplo de cliente de ingestão: é o formato que o seu scraper deve enviar.
// Não raspa nenhum site; só manda notícias fictícias para mostrar o contrato.
//
// Uso: API_URL=http://localhost/api INGEST_API_KEY=sua-chave node scripts/ingestao-exemplo.mjs
const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';
const KEY = process.env.INGEST_API_KEY;
if (!KEY) { console.error('Defina INGEST_API_KEY (a mesma do .env do servidor).'); process.exit(1); }

const now = Date.now();
const body = {
  sourceId: 'g1-pe', // fonte cadastrada no Admin > Fontes
  items: [
    {
      url: 'https://exemplo.invalid/pe/noticia-teste-1', // chave de deduplicação: mesma URL = mesma notícia
      externalId: 'teste-1',
      title: 'Chuva deixa ruas alagadas em Casa Amarela e na Várzea (exemplo)',
      summary: 'Moradores relatam pontos de alagamento depois da chuva da tarde.',
      body: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
      publishedAt: new Date(now - 30 * 60e3).toISOString(),
      imageUrl: undefined,
      authorName: 'Redação (exemplo)',
      // opcional: tema; se faltar, a API classifica pelo texto
      // opcional: bairroIds: ['casa-amarela'] para forçar bairros além dos detectados
    },
  ],
};

const res = await fetch(`${API_URL}/ingest/news`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ingest-key': KEY },
  body: JSON.stringify(body),
});
console.log(res.status, JSON.stringify(await res.json(), null, 2));
