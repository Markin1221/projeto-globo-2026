#!/usr/bin/env node
// Scraper do g1 Pernambuco para o Bairro em Pauta. Sem dependências (Node 20+).
//
// Como funciona:
//   1. Descobre links de notícias no RSS do g1 PE e nas páginas da listagem (pagina-1, pagina-2...).
//   2. Pergunta à API quais links ela já tem e só baixa os novos.
//   3. De cada matéria, lê os metadados estruturados (JSON-LD e Open Graph): título, linha fina, data, foto, autor.
//   4. Mantém só as notícias que citam Recife, Olinda, Jaboatão ou algum bairro cadastrado.
//   5. Envia em lotes para POST /api/ingest/news. A API deduplica, detecta os bairros e avisa quem segue.
//
// Por padrão o corpo da matéria só é usado para detectar bairros (campo detectText) e não é guardado:
// o app mostra título, linha fina e o link "Ler na fonte original". Use --guardar-corpo só com autorização.
//
// Uso:
//   API_URL=http://localhost/api INGEST_API_KEY=... node scraper/g1.mjs                # uma passada (5 páginas)
//   node scraper/g1.mjs --paginas 100 --desde 2026-01-01                               # carga histórica
//   node scraper/g1.mjs --a-cada 15                                                    # fica rodando a cada 15 min
//   node scraper/g1.mjs --simular                                                      # mostra o que enviaria, sem enviar
//
// Opções:
//   --paginas N        páginas da listagem a percorrer (padrão 5; cada página tem ~10 notícias)
//   --desde AAAA-MM-DD para de paginar quando uma página inteira for mais antiga que a data
//   --a-cada M         repete a cada M minutos (modo serviço)
//   --intervalo S      segundos entre requisições ao g1 (padrão 1.5, mínimo 0.5)
//   --tudo             não filtra: envia todas as notícias de Pernambuco
//   --guardar-corpo    guarda o texto da matéria no banco (só com autorização da Globo)
//   --simular          não envia nada para a API, só mostra
//   --reprocessar      baixa de novo também o que já está no banco e refaz bairros e tema (use depois de ajustar a detecção)
//   --secao URL        listagem a usar (padrão https://g1.globo.com/pe/pernambuco/)

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const API_URL = (process.env.API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
const KEY = process.env.INGEST_API_KEY;
const SOURCE_ID = process.env.SOURCE_ID ?? 'g1-pe';
const SECTION = opt('secao', process.env.G1_SECTION ?? 'https://g1.globo.com/pe/pernambuco/').replace(/\/?$/, '/');
const ORIGIN = new URL(SECTION).origin;
const RSS = process.env.G1_RSS ?? `${ORIGIN}/rss/g1${new URL(SECTION).pathname}`;
const PAGES = Math.max(1, Number(opt('paginas', 5)));
const SINCE = opt('desde') ? new Date(`${opt('desde')}T00:00:00-03:00`) : null;
const EVERY = Number(opt('a-cada', 0));
const DELAY = Math.max(0.5, Number(opt('intervalo', 1.5))) * 1000;
const ALL = flag('tudo');
const KEEP_BODY = flag('guardar-corpo');
const DRY = flag('simular');
const REPROCESS = flag('reprocessar');
const UA = process.env.SCRAPER_USER_AGENT ?? 'BairroEmPautaBot/0.1 (projeto Rec\'n\'Play 2026)';

if (!KEY && !DRY) { console.error('Defina INGEST_API_KEY (a mesma do .env do servidor) ou use --simular.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

// --- HTTP educado: uma requisição por vez, com intervalo, respeitando o robots.txt ------------
let last = 0;
let robots = null;
let blockedCount = 0;
// Links já lidos e descartados (fora da área, sem data): não baixa de novo enquanto o processo roda.
const rejected = new Set();
async function polite(url) {
  const wait = last + DELAY - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
}
async function get(url, { tries = 3 } = {}) {
  if (!(await allowed(url))) { blockedCount++; log(`robots.txt não permite (${lastBlockRule}):`, url); return null; }
  for (let i = 1; i <= tries; i++) {
    await polite(url);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { log(`HTTP ${res.status} em ${url}, tentando de novo`); await sleep(5000 * i); continue; }
      if (!res.ok) { log(`HTTP ${res.status} em ${url}`); return null; }
      return await res.text();
    } catch (e) {
      log(`Falha ao baixar ${url}: ${e.message}`);
      await sleep(3000 * i);
    }
  }
  return null;
}

async function allowed(url) {
  if (robots === null) {
    robots = [];
    try {
      await polite();
      const res = await fetch(`${ORIGIN}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      if (res.ok) robots = parseRobots(await res.text());
    } catch { /* sem robots.txt: segue */ }
  }
  const u = new URL(url);
  const path = u.pathname + u.search;
  // Regra mais específica (padrão mais longo) vence; empate favorece Allow, como no padrão do robots.txt.
  const match = robots.filter((r) => r.re.test(path)).sort((a, b) => b.len - a.len || Number(b.allow) - Number(a.allow))[0];
  if (match && !match.allow) lastBlockRule = match.raw;
  return !match || match.allow;
}
let lastBlockRule = '';

/** Lê o robots.txt em grupos de User-agent e usa o grupo mais específico para o nosso robô (ou o "*"). */
function parseRobots(txt) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    if (k === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current || (k !== 'allow' && k !== 'disallow')) continue;
      if (!v) continue; // "Disallow:" vazio libera tudo
      const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
      current.rules.push({ re, len: v.replace(/\*/g, '').length, allow: k === 'allow', raw: `${k === 'allow' ? 'Allow' : 'Disallow'}: ${v}` });
    }
  }
  const token = UA.split('/')[0].toLowerCase();
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

// --- Descoberta de links ------------------------------------------------------------------------
const ARTICLE_RE = new RegExp(`${ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${new URL(SECTION).pathname}noticia/\\d{4}/\\d{2}/\\d{2}/[\\w\\-.%]+?\\.ghtml`, 'g');
const links = (html) => [...new Set((html ?? '').replace(/\\\//g, '/').match(ARTICLE_RE) ?? [])];

async function discover(pages) {
  const found = [];
  const rss = await get(RSS);
  if (rss) found.push({ page: 0, urls: links(rss) });
  for (let p = 1; p <= pages; p++) {
    const html = await get(p === 1 ? SECTION : `${SECTION}index/feed/pagina-${p}.ghtml`);
    if (!html) { log(`Listagem terminou na página ${p}.`); break; }
    const urls = links(html);
    if (!urls.length) { log(`Página ${p} sem notícias; parando.`); break; }
    found.push({ page: p, urls });
  }
  return found;
}

// --- Leitura da matéria ---------------------------------------------------------------------------
const decode = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();
const meta = (html, prop) => {
  const re = new RegExp(`<meta\\s(?:[^>"']|"[^"]*"|'[^']*')*?(?:property|name|itemprop)=["']${prop}["'](?:[^>"']|"[^"]*"|'[^']*')*>`, 'i');
  const tag = html.match(re)?.[0];
  // A aspa que abre o valor é a que fecha: títulos com aspas ou apóstrofos não são cortados.
  return tag ? decode(tag.match(/content=(["'])([\s\S]*?)\1/i)?.[2]) : undefined;
};

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      // Alguns sites deixam quebras de linha cruas dentro das strings; o JSON.parse não aceita.
      const data = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, ' '));
      const stack = Array.isArray(data) ? data : [data];
      while (stack.length) {
        const x = stack.shift();
        if (!x || typeof x !== 'object') continue;
        if (Array.isArray(x['@graph'])) stack.push(...x['@graph']);
        out.push(x);
      }
    } catch { /* JSON-LD inválido: ignora */ }
  }
  return out.find((x) => /NewsArticle|Article|ReportageNewsArticle/.test([].concat(x['@type']).join(' '))) ?? {};
}

function paragraphs(html) {
  const body = [...html.matchAll(/<p[^>]*class=["'][^"']*content-text__container[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decode(m[1]));
  if (body.length) return body.filter(Boolean);
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? '';
  return [...article.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decode(m[1])).filter((p) => p.length > 40);
}

async function readArticle(url) {
  const html = await get(url);
  if (!html) return null;
  const ld = jsonLd(html);
  const cleanTitle = (t) => String(t ?? '').replace(/\s*[|\-–]\s*g1\s*$/i, '').trim();
  const title = cleanTitle(decode(ld.headline) || meta(html, 'og:title') || decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]));
  const summary = decode(ld.description) || meta(html, 'og:description') || meta(html, 'description') || '';
  const published = ld.datePublished || meta(html, 'article:published_time') || meta(html, 'datePublished');
  const image = [].concat(ld.image ?? []).map((i) => (typeof i === 'string' ? i : i?.url)).find(Boolean) || meta(html, 'og:image');
  const author = [].concat(ld.author ?? []).map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ') || undefined;
  if (!title || !published || Number.isNaN(new Date(published).getTime())) { log('Sem título ou data, pulando:', url); return null; }
  const text = paragraphs(html).join('\n\n') || decode(ld.articleBody);
  return {
    url: url.split('#')[0].split('?')[0],
    externalId: url.match(/\/([^/]+)\.ghtml$/)?.[1],
    title, summary, publishedAt: new Date(published).toISOString(),
    imageUrl: image || undefined, authorName: author,
    ...(KEEP_BODY ? { body: text } : { detectText: text.slice(0, 20000) }),
  };
}

// --- Filtro: só o que interessa ao Grande Recife --------------------------------------------------
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let placeRe = null;
async function loadPlaces() {
  if (ALL) return;
  const names = new Set(['recife', 'olinda', 'jaboatao', 'regiao metropolitana do recife', 'grande recife']);
  try {
    const res = await fetch(`${API_URL}/snapshot`, { signal: AbortSignal.timeout(20000) });
    const db = await res.json();
    for (const c of db.cities ?? []) names.add(norm(c.name));
    // Nomes curtos e comuns (Torre, Pina...) geram muito falso positivo no filtro; a API faz a detecção fina.
    for (const b of db.bairros ?? []) for (const n of [b.name, ...(b.aliases ?? [])]) if (n.length >= 7) names.add(norm(n));
  } catch { log('Não consegui ler bairros da API; filtrando só por nome de cidade.'); }
  placeRe = new RegExp(`(^|[^a-z])(${[...names].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^a-z]|$)`);
}
const relevant = (a) => ALL || placeRe.test(norm(`${a.title} ${a.summary} ${a.body ?? a.detectText ?? ''}`));

// --- API ----------------------------------------------------------------------------------------
async function api(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-key': KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? ''}`);
  return json;
}
async function known(urls) {
  if (DRY || !urls.length) return new Set();
  const out = new Set();
  for (let i = 0; i < urls.length; i += 500) (await api('/ingest/known', { urls: urls.slice(i, i + 500) })).known.forEach((u) => out.add(u));
  return out;
}

async function run() {
  const blockedAtStart = blockedCount;
  log(`Lendo ${SECTION} (até ${PAGES} páginas)${SINCE ? `, desde ${opt('desde')}` : ''}${DRY ? ', modo simulação' : ''}.`);
  await loadPlaces();
  const pages = await discover(PAGES);
  const all = [...new Set(pages.flatMap((p) => p.urls))];
  const have = REPROCESS ? new Set() : await known(all);
  log(`${all.length} links encontrados, ${have.size} já no banco.`);

  const batch = [];
  const stats = { lidas: 0, enviadas: 0, foraDaArea: 0, antigas: 0, falhas: 0 };
  const flush = async () => {
    if (!batch.length) return;
    const items = batch.splice(0);
    if (DRY) { items.forEach((i) => log('[simulação]', i.publishedAt.slice(0, 10), i.title)); stats.enviadas += items.length; return; }
    try {
      const { report } = await api('/ingest/news', { sourceId: SOURCE_ID, items, force: REPROCESS });
      stats.enviadas += items.length;
      for (const r of report) if (r.status !== 'igual') log(`${r.status}: ${r.url}${r.bairroIds?.length ? ` [${r.bairroIds.join(', ')}]` : ''}`);
    } catch (e) { stats.falhas += items.length; log('Falha ao enviar lote:', e.message); }
  };

  for (const { page, urls } of pages) {
    let older = 0, seen = 0;
    for (const url of urls) {
      if (have.has(url) || rejected.has(url)) continue;
      have.add(url);
      const before = blockedCount;
      const a = await readArticle(url);
      if (!a) { if (blockedCount === before) stats.falhas++; rejected.add(url); continue; }
      stats.lidas++; seen++;
      if (SINCE && new Date(a.publishedAt) < SINCE) { stats.antigas++; older++; continue; }
      if (!relevant(a)) { stats.foraDaArea++; rejected.add(url); continue; }
      batch.push(a);
      if (batch.length >= 20) await flush();
    }
    if (SINCE && page > 0 && seen > 0 && older === seen) { log(`Página ${page} inteira anterior a ${opt('desde')}; parando.`); break; }
  }
  await flush();
  log(`Fim: ${stats.lidas} lidas, ${stats.enviadas} enviadas, ${stats.foraDaArea} fora do Grande Recife, ${stats.antigas} antigas, ${blockedCount - blockedAtStart} bloqueadas pelo robots.txt, ${stats.falhas} falhas.`);
}

do {
  try { await run(); } catch (e) { log('Erro na passada:', e.message); }
  if (EVERY > 0) { log(`Próxima passada em ${EVERY} min.`); await sleep(EVERY * 60000); }
} while (EVERY > 0);
