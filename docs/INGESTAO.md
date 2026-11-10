# Ingestão de notícias (scraper)

## Scraper do g1 Pernambuco (pronto)

`scraper/g1.mjs` lê o g1 PE e alimenta o banco. Não precisa instalar nada além do Node 20+.

```bash
# No servidor, com INGEST_API_KEY preenchida no .env:
docker compose --profile scraper up -d          # roda a cada 15 min (SCRAPER_MINUTOS), 3 páginas por vez
docker compose logs -f scraper                  # acompanhar

# Carga histórica, uma vez (ex.: tudo desde janeiro):
docker compose run --rm scraper node g1.mjs --paginas 200 --desde 2026-01-01

# Refazer bairros e tema das notícias já gravadas (depois de ajustar a detecção):
docker compose run --rm scraper node g1.mjs --paginas 200 --desde 2026-01-01 --reprocessar

# Testar sem gravar nada:
docker compose run --rm scraper node g1.mjs --paginas 2 --simular
```

Fora do Docker: `API_URL=http://localhost/api INGEST_API_KEY=... node scraper/g1.mjs --simular`. Todas as opções estão no topo do arquivo.

O que ele faz:

1. Junta os links de notícias do RSS do g1 PE e das páginas da listagem (`/pe/pernambuco/` e `/pe/pernambuco/index/feed/pagina-N.ghtml`).
2. Pergunta à API (`POST /api/ingest/known`) quais já estão no banco e só baixa os novos.
3. De cada matéria, lê os metadados estruturados da página (JSON-LD `NewsArticle` e Open Graph): título, linha fina, data, foto e autor.
4. Mantém só o que cita Recife, Olinda, Jaboatão ou um bairro cadastrado (`--tudo` desliga o filtro).
5. Envia em lotes de 20. A API detecta os bairros e avisa quem segue.

Cuidados embutidos: uma requisição por vez, 1,5 s de intervalo (`--intervalo`), respeita o `robots.txt`, se identifica no User-Agent e tenta de novo com espera em erros 429 e 5xx.

O texto completo da matéria é usado só para detectar os bairros (campo `detectText`) e não é gravado: o app mostra título, linha fina e o link para o g1. Para guardar o texto, use `--guardar-corpo`, somente com autorização da Globo.

Se o g1 mudar o layout e o scraper parar de achar notícias, os pontos a ajustar são a expressão `ARTICLE_RE` (formato dos links) e a função `discover` (endereço das páginas da listagem). A leitura da matéria usa metadados estruturados, que costumam mudar menos.

## Formato da API

O scraper não escreve direto no banco. Ele envia lotes para a API, que cuida de deduplicar, detectar bairros, classificar o tema, registrar a execução e avisar quem segue os bairros.

## Endpoint

`POST /api/ingest/news`

Cabeçalhos:

- `content-type: application/json`
- `x-ingest-key: <INGEST_API_KEY do .env>`

Corpo:

```json
{
  "sourceId": "g1-pe",
  "items": [
    {
      "url": "https://g1.globo.com/pe/pernambuco/noticia/....ghtml",
      "externalId": "opcional, id da notícia na fonte",
      "title": "Título",
      "summary": "Linha fina ou resumo",
      "body": "Parágrafos separados por linha em branco",
      "publishedAt": "2026-11-09T19:30:00-03:00",
      "imageUrl": "https://...",
      "authorName": "Assinatura",
      "topic": "alagamento",
      "bairroIds": ["casa-amarela"],
      "kind": "materia",
      "transcript": [{ "t": 0, "speaker": "Repórter", "text": "..." }],
      "durationSec": 120
    }
  ]
}
```

Obrigatórios: `url`, `title`, `publishedAt`. Até 200 itens por lote.

- `sourceId` precisa existir em Admin > Fontes. O seed já traz `g1-pe` e `portal`.
- `kind: "trecho"` com `transcript` cadastra um trecho de telejornal com transcrição clicável.
- `topic` aceita: transito, obras, agua, seguranca, alagamento, vacinacao, saude, educacao, cultura, comercio, transporte, meio-ambiente, geral. Se faltar, a API classifica pelo texto.

Resposta: `{ runId, report: [{ url, status: "criado" | "atualizado" | "igual" | "erro", id, bairroIds }] }`.

Reenviar a mesma URL é seguro: se o conteúdo não mudou, nada acontece; se mudou, a notícia é atualizada e os bairros são detectados de novo.

Teste com `node api/scripts/ingestao-exemplo.mjs` (veja o cabeçalho do arquivo).

## Como os bairros são detectados

Título, resumo, corpo e transcrição passam pela mesma detecção usada no telejornal ao vivo (`shared/domain/rules.ts`, `detectBairros`):

- considera nomes e apelidos cadastrados (tabela `bairro_aliases`);
- ignora vias com nome de bairro ("Avenida Boa Viagem" não conta como Boa Viagem; cadastre vias em `streets`);
- para nomes que também são palavras comuns (Torre, Pina, Graças, Várzea, Boa Vista...), exige letra maiúscula e uma preposição de lugar antes ("na Torre", "das Graças"), e descarta nomes de pessoas, santas e instituições ("Maria das Graças", "Nossa Senhora do Carmo") e expressões como "graças a" e "torre de energia".

Cada vínculo fica em `news_item_bairros` com `method = 'detectado'` e o trecho do texto que disparou (`matched_text`), para revisão. Para ver por que uma notícia caiu em um bairro:

```bash
docker compose exec db psql -U bairro bairro -c "select nb.bairro_id, nb.matched_text from news_item_bairros nb join news_items n on n.id = nb.news_item_id where n.title ilike '%Juliette%'"
```
 Bairros passados em `bairroIds` ficam com `method = 'manual'` e não são apagados em reprocessamentos.

## Tabelas que o scraper alimenta

| Tabela | Papel |
| --- | --- |
| `sources` | Fonte (G1 PE, NE1...). Cadastre antes de enviar. |
| `ingest_runs` | Uma linha por lote: recebidas, novas, atualizadas, ignoradas. Aparece em Admin > Fontes. |
| `news_items` | A notícia. `url` é única; `content_hash` detecta mudança; `raw` guarda o payload original para reprocessar. |
| `news_item_bairros` | Em quais bairros a notícia foi pauta. |
| `transcript_lines` | Linhas de transcrição, para trechos de vídeo. |
| `topics`, `issues` | Tema e assunto recorrente (para a linha do tempo do bairro). |

O esquema completo está em `db/migrations/001_init.sql`. Para mudar o banco, crie `002_....sql` na mesma pasta; a API aplica as migrações novas ao iniciar.

## Antes de raspar o G1

- Confira os termos de uso e o `robots.txt` do site, e use um intervalo educado entre requisições.
- O texto e as fotos das matérias têm direitos autorais. O caminho mais seguro é guardar título, resumo, data e link, e mandar o leitor para a matéria original (a página da notícia já mostra "Ler na fonte original"). Como o projeto é para o Desafio Globo, vale pedir à organização um feed ou autorização.
- Imagens são exibidas direto da URL de origem (`imageUrl`); nada é copiado para o servidor.

## Limites reais dos bairros no mapa

Por padrão o mapa mostra um círculo no centro de cada bairro. Para desenhar os limites reais:

```bash
cd api
DATABASE_URL=postgres://bairro:SENHA@localhost:5432/bairro \
  node scripts/importar-limites.mjs bairros.geojson --cidade recife --campo NOME_DO_CAMPO --criar
```

O GeoJSON de bairros do Recife está no portal de dados abertos da prefeitura. Abra o arquivo para ver qual propriedade tem o nome do bairro e passe em `--campo`. As coordenadas precisam estar em WGS84 (EPSG:4326).
