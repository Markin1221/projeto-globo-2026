# Bairro em Pauta

Radar de notícias locais para o Desafio Globo no Rec'n'Play 2026. O app avisa o morador quando o bairro dele vira pauta nos telejornais e portais, organiza o acervo por bairro e acompanha cada problema até a solução. Os relatos de moradores ficam separados, com um aviso permanente de que não foram verificados. O conteúdo que vem no banco é de exemplo; com o scraper, entram notícias reais do g1 PE.

## O que o app faz

| Para quem | O quê |
| --- | --- |
| Morador | Segue bairros, recebe a tarja quando o bairro aparece num telejornal ao vivo e vê o resumo do dia feito por IA. Navega pelo mapa da cidade sobre o OpenStreetMap e acompanha casos ("o buraco foi consertado?"). Pode enviar um relato e confirmar o de um vizinho. |
| Quem tem dificuldade para ler | Modo Simples: notícias em letras grandes, filtro por bairro no topo, leitura em voz alta uma por uma, voz neural em português e a situação de cada problema. |
| Jornalista | Fila de relatos com triagem automática (risco, prioridade, possíveis duplicados), relatos agrupados por assunto com resumo, confirmação ou descarte, que só um humano faz, e acompanhamento dos casos. |
| Moderador e admin | Denúncias, conteúdo oculto, fontes, bairros, modelos e histórico das importações do g1. |

Regras que não mudam: todo relato carrega o selo **INFORMAL · NÃO VERIFICADO · PODE SER FALSO**; só um jornalista muda o status de um relato; nome, telefone e endereço de quem relata só aparecem para a redação e para o próprio autor; nenhuma IA decide o que é fato.

## Pastas

| Pasta | O que é |
| --- | --- |
| `web/` | Front em Next.js 16 (React 19). Mapa com Leaflet e OpenStreetMap. |
| `api/` | API em NestJS 11 com PostgreSQL (`pg`, SQL direto). Modelos em `api/src/ml/`, IA em `api/src/ai.ts`. |
| `shared/` | Tipos e regras de negócio usados pelos dois lados. |
| `db/migrations/` | Esquema do banco. A API aplica as migrações novas ao iniciar. |
| `tts/` | Voz neural em português (Piper), em um container próprio. |
| `scraper/` | Scraper do g1 PE que alimenta o banco. |
| `docs/INGESTAO.md` | Como usar o scraper e o formato da ingestão. |
| `docs/MODELOS.md` | Localização das notícias, utilidade, triagem, relatos por assunto, resumos com IA e acompanhamento de casos. |

## Colocar no ar com Docker

Num servidor com Docker e Docker Compose (uma VPS com 2 GB de RAM basta):

```bash
cp .env.example .env      # troque as senhas e segredos
docker compose up -d --build
```

O site abre na porta 80. Para ter HTTPS, aponte um domínio (registro A) para o IP do servidor, coloque `SITE_ADDRESS=seu-dominio.com.br` no `.env` e rode `docker compose up -d` de novo. O Caddy emite o certificado sozinho; as portas 80 e 443 precisam estar abertas.

| Serviço | Papel |
| --- | --- |
| `caddy` | Porta pública. Manda `/api` para a API e o resto para o site. |
| `web` | Next.js em modo standalone. |
| `api` | NestJS. Na primeira subida cria as tabelas e carrega os dados de exemplo. |
| `db` | PostgreSQL 16, com os dados no volume `pgdata`. |
| `tts` | Voz neural. Se não subir, o app usa a voz do navegador. |
| `scraper` | Só com `--profile scraper`. Busca notícias do g1 PE. |
| `ollama` | Só com `--profile ia-local`. IA local para os resumos. |

Depois de atualizar o código, rode `docker compose up -d --build` de novo. As migrações novas são aplicadas sozinhas e os dados continuam.

Comandos úteis:

```bash
docker compose logs -f api                                 # acompanhar a API
docker compose exec api node dist/api/src/main.js --reset  # apagar tudo e recarregar os exemplos
docker compose exec db psql -U bairro bairro               # abrir o banco
```

### Abrir pelo celular na mesma rede

1. No Windows, libere a porta 80 no firewall (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "Bairro em Pauta 80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Any
   ```
2. Rode `ipconfig` e anote o "Endereço IPv4" do Wi-Fi (ignore os de VPN e WSL).
3. No celular, no mesmo Wi-Fi, abra `http://ESSE-IP`, com `http://` na frente.

Redes de faculdade, hotel e eventos costumam isolar os aparelhos entre si. Nesse caso, conecte o PC ao roteador do celular.

## Apresentação

O botão **Roteiro da banca**, no canto inferior direito, guia os 7 passos e marca o que já foi feito:

1. Seguir Casa Amarela e ver o resumo do dia.
2. Simular um telejornal ao vivo: a transcrição detecta o bairro e dispara a tarja.
3. Marina envia um relato e três vizinhos confirmam.
4. Ver os relatos por assunto e o resumo com IA.
5. Helena, a jornalista, apura com a ajuda da triagem e confirma o relato, que vira post oficial.
6. Acompanhar o buraco da Rua Alto do Céu: foi tapado e voltou a abrir.
7. Modo Simples em voz alta.

Se sobrar tempo, há atalhos para o mapa, o Painel do Jornalista e o Admin. **Restaurar dados da demo** volta tudo ao início (apaga o que foi feito na demonstração, para todos).

## Rodar na sua máquina, sem Docker para o app

Requer Node 22 e um PostgreSQL 14 ou mais recente.

```bash
docker compose up -d db                  # ou use um Postgres seu
cp .env.example .env                     # e descomente DATABASE_URL
cd api && npm install && npm run dev     # API em http://localhost:3001/api
cd web && npm install && npm run dev     # site em http://localhost:3000
```

O site encaminha `/api` para `http://localhost:3001` (mude com `API_INTERNAL_URL`). Sem o container `tts`, a leitura usa a voz do navegador.

## Banco de dados

O esquema está em `db/migrations/`, comentado:

| Arquivo | O que cria |
| --- | --- |
| `001_init.sql` | Esquema base. |
| `002_inteligencia.sql` | Localização estimada e utilidade das notícias. |
| `003_resumos.sql` | Cache dos resumos com IA. |
| `004_resumo_dia.sql` | Resumo do dia. |
| `005_casos.sql` | Acompanhamento de casos. |

As tabelas, por grupo:

- **Geografia:** `cities`, `bairros` (com centro e limite GeoJSON opcional), `bairro_aliases`, `bairro_confusions` (nomes parecidos) e `streets` (vias com nome de bairro).
- **Notícias:** `sources` (programas e portais), `news_items` (trecho de telejornal, matéria ou post oficial, com `url` única para deduplicar), `news_item_bairros` (com o método: citado, por ponto de referência ou previsto), `transcript_lines`, `topics` e `ingest_runs`.
- **Casos:** `issues` (o caso confirmado). Os itens apontam para ele por `issue_id`, com etapa (`case_stage`) e exclusão (`case_unlinked`) definidas pela redação.
- **Relatos:** `relatos`, `relato_contacts` (tabela separada, só para redação e autor), `relato_confirmations` e `relato_status_history`.
- **IA:** `ai_summaries` (resumos guardados, para não pagar duas vezes).
- **Comunidade:** `comments`, `user_saves`, `reports`, `hidden_content`, `locked_threads`, `alerts` e `notifications`.
- **Pessoas:** `users` e `user_follows`.

Para mudar o esquema, crie `db/migrations/006_....sql`. A API aplica arquivos novos na próxima subida.

## Notícias reais do g1

Preencha `INGEST_API_KEY` no `.env` e rode `docker compose --profile scraper up -d`. O scraper respeita o `robots.txt` e entra por `POST /api/ingest/news`. A API deduplica e descobre o bairro (pelo nome, por ponto de referência ou rua conhecida e, em último caso, pelo modelo). Também identifica se a notícia é do Recife, da região metropolitana ou de fora, e liga a notícia aos casos abertos. Opções como carga histórica (`--paginas`, `--desde`) e reprocessamento estão em `docs/INGESTAO.md`.

## Mapa

O mapa usa OpenStreetMap (camada da CARTO) e mostra cada bairro colorido pelo volume de notícias. Há Recife, Olinda e Jaboatão no exemplo; outras cidades entram pela tabela `cities`. Sem limites importados, cada bairro aparece como círculo no centro aproximado. Para os limites reais, use `api/scripts/importar-limites.mjs` com o GeoJSON da prefeitura (veja `docs/INGESTAO.md`).

## IA para os resumos

A IA escreve o resumo do dia de cada bairro (só com notícias e alertas oficiais) e o resumo dos relatos ("o que tem neste bloco, o que pode ser urgente"). Opções grátis, no `.env`:

| Variável | Serviço |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio |
| `GROQ_API_KEY` | console.groq.com, recomendado para o site no ar |
| `OLLAMA_URL` | IA local, com `docker compose --profile ia-local up -d` |

Se a IA estiver fora ou com "alta demanda", o app tenta de novo, depois um modelo reserva e, no fim, um resumo automático. A tela sempre tem resumo e diz qual dos dois está mostrando. Para a IA nunca vão nome, telefone ou endereço de quem relata. Detalhes em `docs/MODELOS.md`.

Para conferir se a IA está ligada:

```bash
docker compose logs api | grep -i resumo
```

## Voz

A leitura em voz alta usa a voz neural `pt_BR-faber-medium` do Piper, gerada no servidor e guardada em cache. Se o serviço estiver fora, o app usa a melhor voz em português do navegador. Em Configurações > Acessibilidade dá para escolher. Para trocar a voz neural, mude `VOICE` em `tts/Dockerfile` (lista em huggingface.co/rhasspy/piper-voices, pasta `pt/pt_BR`).

## Segurança e o que ainda falta

- `DEMO_MODE=true` deixa qualquer visitante escolher o perfil em "Ver o app como", inclusive jornalista e admin, e restaurar os dados. É o certo para a banca. Antes de abrir para o público, troque por login de verdade e use `DEMO_MODE=false`.
- Nunca publique o `.env`: ele guarda as chaves de IA e os segredos.
- Os dados de contato dos relatos só saem da API para jornalista, admin e o próprio autor.
- Falta:
  - login com senha ou conta Globo;
  - limite de requisições em todas as rotas (hoje só os resumos têm);
  - envio real de foto e áudio;
  - transcrição real (Whisper) dos telejornais;
  - notificações push, incluindo avisar quem segue o bairro quando um caso muda de etapa.

 ᓚᘏᗢ
