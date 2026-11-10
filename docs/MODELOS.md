# Modelos de apoio

Análises automáticas ajudam a redação e o morador: onde a notícia se passa, utilidade, triagem de relatos, relatos por assunto, resumos com IA e acompanhamento de casos. Nenhuma decide sozinha o que é verdade: pela regra do produto, só um jornalista confirma ou descarta um relato. Tudo roda dentro da API, sem custo; só os resumos usam um serviço de IA externo, e só se ele estiver configurado.

O código está em `api/src/ml/`.

## 1. Onde a notícia se passa (`location.ts`, `places.ts`)

Para cada notícia que entra pelo scraper, a API responde duas perguntas.

**É do Recife ou de outro lugar?** O resultado é `recife`, `rmr` (Região Metropolitana), `pe` (resto do estado), `fora` ou `indefinido`. As menções a cidades e estados são pesadas pelo lugar onde aparecem: título vale 3, linha fina 2, texto 1. Nomes que também são palavras comuns ("Escada", "Paulista", "Natal") só contam com preposição de lugar antes ("em Escada"). Siglas entre parênteses, como "(RR)" ou "(PB)", indicam fora do estado.

O feed "Grande Recife" esconde as notícias marcadas como `pe` e `fora`. Elas continuam no banco.

**De qual bairro?** São três camadas, da mais confiável para a menos:

| Camada | Exemplo | Como aparece |
| --- | --- | --- |
| Nome do bairro no texto | "moradores da Várzea" | bairro normal (`detectado`) |
| Ponto de referência ou via conhecida | "Instituto Ricardo Brennand" → Várzea | "(estimado)" (`referencia`) |
| Classificador Naive Bayes | texto sem nome nem ponto conhecido | "(estimado)" (`previsto`) |

O classificador aprende com as notícias que já têm bairro. Os nomes dos bairros são apagados do texto de treino, para ele aprender o contexto: ruas, escolas, mercados, instituições. Ele só marca um bairro quando tem pelo menos 60% de confiança e boa margem sobre o segundo colocado, e quando o bairro tem 3 ou mais exemplos.

Para ensinar novos pontos de referência, acrescente em `LANDMARKS` (`places.ts`) ou cadastre vias na tabela `streets`.

## 2. Utilidade para o dia a dia (`utility.ts`)

É uma nota de 0 a 100. Trânsito, falta d'água ou luz, chuva, vacinação, prazos, transporte e obras sobem a nota; celebridades, entretenimento e esporte baixam. Ela é usada no filtro "Só o que muda o dia a dia" da página inicial e na escolha do destaque do "Resumo do dia".

## 3. Triagem de relatos (`triage.ts`)

Aparece só para jornalista, moderador e admin: na fila do Painel do Jornalista (com opção de ordenar por prioridade ou risco) e no relato aberto. O público nunca vê.

| Sinal | O que observa |
| --- | --- |
| Risco | Segunda mão ("me disseram", "vi no grupo", "encaminhada"), tom alarmista, tudo em maiúsculas, números difíceis de checar, link ou propaganda, ponto no mapa longe do bairro, texto citando outro bairro, autor com relatos falsos. |
| Confiança | Autor com relatos confirmados, anexo, notícia oficial recente sobre o mesmo tema no bairro, outros moradores relatando algo parecido. |
| Utilidade | Descrição curta ou genérica, referência vaga, categoria que parece errada, possível duplicado de outro relato. |
| Modelo aprendido | Naive Bayes treinado com os relatos que a redação confirmou ou marcou como falsos. Com menos de 30 decisões, pesa menos e o painel avisa. |

A **prioridade sugerida** combina confirmações, urgência do tema e recência. Um boato de risco alto com muitas confirmações também sobe, porque precisa ser checado antes de se espalhar.

## Aprendizado contínuo

Os modelos retreinam ao iniciar a API, depois de cada lote do scraper e depois de cada decisão da redação. Admin > Painel da redação > Modelos de apoio mostra quantos exemplos cada modelo tem e o acerto medido em 20% das notícias e decisões separadas para teste. O acerto só aparece quando há dados suficientes: 20 notícias de teste ou 30 decisões.

O botão "Reanalisar todas as notícias", na mesma tela, recalcula localização e utilidade com as regras atuais. Para refazer a detecção usando o texto completo do g1, rode o scraper com `--reprocessar`.

## Limites

- Os modelos são simples de propósito: são explicáveis (cada sinal diz o motivo), rodam em milissegundos e não precisam de GPU nem de serviço pago. Com milhares de notícias e centenas de decisões, vale testar um modelo de linguagem para a triagem, mantendo a decisão final com a redação.
- Com poucos dados, o classificador de bairro erra bastante. Por isso ele só entra quando nada mais funciona, e sempre aparece como "estimado".

## 4. Relatos agrupados por assunto (`cluster.ts`)

Relatos do mesmo assunto aparecem juntos em "Relatos dos moradores > Por assunto" e no Painel do Jornalista. Dois relatos entram no mesmo grupo quando foram enviados com até 3 dias de diferença e somam pelo menos 0,45 de semelhança:

- 0,55 × semelhança do texto (TF-IDF, cosseno);
- 0,25 se a categoria é a mesma;
- 0,20 se o bairro é o mesmo (0,10 se fica a menos de 2 km).

Na prática, mesmo bairro e mesma categoria já formam grupo. Em bairros vizinhos ou com categorias diferentes, o texto precisa ser parecido. Relatos falsos ou ocultos nunca entram.

## 5. Resumo dos relatos (`ai.ts`)

O botão "Resumir" gera um resumo no estilo dos resumos de grupo: título, o que está acontecendo, os pontos principais, o que pode ser urgente (com link para cada relato) e uma orientação de segurança. Ele existe para um grupo, para todos os relatos dos últimos 7 dias, para os bairros que a pessoa segue e para a página de um bairro.

Provedores de IA, configurados no `.env` (o primeiro que estiver preenchido é usado; `AI_PROVIDER` força um):

| Provedor | Custo | Como ligar | Modelo padrão |
| --- | --- | --- | --- |
| Groq | grátis, sem cartão | `GROQ_API_KEY` (console.groq.com) | `llama-3.3-70b-versatile` |
| Ollama | grátis, roda local | `OLLAMA_URL` (container `--profile ia-local` ou Ollama do seu PC) | `qwen2.5:3b` |
| Gemini | grátis com limites | `GEMINI_API_KEY` (aistudio.google.com) | `gemini-flash-latest` |
| Claude | pago | `ANTHROPIC_API_KEY` (console.anthropic.com) | `claude-haiku-5-5` |

- **Groq** é o recomendado para o site no ar: é rápido, escreve bem em português e, pelas regras do serviço, não guarda os dados enviados. O plano gratuito tem limite diário de pedidos, e o cache dos resumos ajuda a ficar dentro dele.
- **Ollama** não precisa de conta nem de internet, mas sem placa de vídeo um resumo pode levar de 20 s a 1 min, e um modelo pequeno (3B) escreve pior que o do Groq. Pede cerca de 4 GB de RAM livres.
- **Gemini:** no plano gratuito, o Google pode usar os textos enviados para melhorar os produtos dele.
- Planos gratuitos às vezes respondem "alta demanda" (erro 503) ou demoram. O app tenta o modelo principal duas vezes e depois um modelo reserva mais leve (`gemini-flash-lite-latest` no Gemini, `llama-3.1-8b-instant` no Groq); troque os reservas em `AI_FALLBACK_MODELS`, separados por vírgula. Só se todos falharem entra o resumo automático, e ele não fica guardado: o próximo pedido tenta a IA de novo.
- Os limites e os nomes de modelo dos planos gratuitos mudam com frequência. Se um modelo sair do ar, troque em `AI_MODEL`.
- **Sem nada configurado, ou se a IA falhar:** o app gera um resumo automático (contagem, assuntos principais e relatos com palavras de risco). A demo nunca fica sem resumo.

Cuidados embutidos:

- Para a IA vão só título, descrição, categoria, bairro, rua, referência, status e confirmações. Nome, telefone e endereço dos autores nunca saem do banco.
- As instruções à IA exigem "moradores relatam" (nunca afirmar como fato), proíbem inventar dados e mandam ignorar qualquer instrução escrita dentro de um relato. A resposta é validada, e ids de relato inventados são descartados.
- O resumo leva o selo de não verificado, e a leitura em voz alta começa pelo aviso obrigatório.
- Cada resumo fica guardado (`ai_summaries`) e só é refeito quando chega relato novo, muda um status ou muda o número de confirmações. Há também um limite de 10 resumos novos por minuto por endereço (`AI_RATE_PER_MIN`), para controlar o custo.

## 6. Resumo do dia do bairro (`ai.ts`, `POST /api/resumos/dia`)

Aparece no topo do Início e da página de cada bairro. Usa só fontes oficiais: trechos de telejornal e matérias das últimas 48 horas (ou as 4 mais recentes, se o bairro estiver parado) e até 4 alertas ativos. Relatos de moradores nunca entram. A IA devolve 3 frases curtas. O resultado fica guardado por dia (horário do Recife) e é refeito quando entra notícia ou alerta novo no bairro. Enquanto a IA responde, a tela mostra o resumo automático; se ela falhar, o automático fica, com a etiqueta "Resumo automático".

## 7. Acompanhamento de casos (`cases.ts`)

Liga notícias, trechos e relatos sobre o mesmo problema e mostra o progresso: **Problema → Em andamento → Resolvido**. Aparece em "Acompanhamento", na aba do bairro, numa caixa nas páginas de matéria, trecho e relato e no Modo Simples ("Situação do problema: em andamento").

**Como os itens se ligam**, em ordem:

1. Itens que a redação ligou ao mesmo caso (`issue_id`). Dois casos confirmados nunca se juntam.
2. Relato que virou matéria entra no caso da matéria.
3. Automático: mesmo bairro, até 60 dias de diferença e texto parecido (TF-IDF, sem nomes de bairro e palavras genéricas como "moradores" e "rua"). A nota é 0,7 × texto + 0,3 se o tema é o mesmo; precisa de 0,42 e texto com pelo menos 0,28. Com o mesmo tema e até 10 dias de diferença, basta 0,12 de texto (com bônus de 0,08). Itens de um caso confirmado também atraem notícias novas parecidas.

Grupos só de relatos ficam em "Relatos por assunto". Um relato com a matéria que o confirmou, sem mudança de etapa, não vira caso.

**Etapa de cada item**, pelas palavras do título (se ele não disser nada, da linha fina ou descrição), nesta ordem:

| Primeiro que bater | Etapa | Exemplos |
| --- | --- | --- |
| Voltou a piorar | Problema | "não resolve", "volta a abrir", "cresce", "de novo", "ainda sem" |
| Promessa ou previsão | Em andamento | "promete normalizar", "deve ser liberado", "até sexta" |
| Solução | Resolvido | "consertada", "ajeitaram", "tapado", "concluída", "liberada", "volta a funcionar" |
| Falta de algo | Problema | "sem sinalização", "sem luz", "apagado" |
| Ação em curso | Em andamento | "obra", "equipe", "estão consertando", "isola", "mutirão", "vistoria", "rodízio" |
| Problema | Problema | "abriu", "cedeu", "falta", "alagamento", "buraco", "reclamam" |

**Progresso do caso:** a etapa atual é a da notícia oficial mais recente. Relatos de moradores aparecem na linha do tempo com o selo de não verificado e não mudam o progresso. Se um relato for mais novo que a última notícia, o caso avisa ("depois da última notícia oficial, um morador relatou: problema. Ainda não verificado"). Se o caso já esteve em andamento ou resolvido e voltou a ser problema, aparece "Voltou a ser problema".

**O que a redação faz** (jornalista e admin): confirmar ou renomear o caso, corrigir a etapa de um item (vale sobre a detectada), tirar um item do caso (ele deixa de ser ligado automaticamente) e ligar uma notícia ou relato a um caso, pela página do item. Rotas: `POST /api/casos/confirmar`, `/casos/ligar`, `/casos/etapa`.

**Limites:** a etapa por palavras erra em títulos ambíguos ("obra causa buraco" vira "em andamento"), e a ligação automática pode juntar dois problemas diferentes do mesmo bairro e tema em poucos dias. Por isso casos automáticos aparecem como "Ligação automática" até a redação confirmar.
