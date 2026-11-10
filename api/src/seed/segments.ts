import type { Segment, Topic, TranscriptLine } from '../../../shared/domain/types';
import { ago, hours } from './base';

const A = 'Apresentação', R = 'Reportagem', M = 'Morador';
const lines = (rows: [number, string, string][]): TranscriptLine[] => rows.map(([t, speaker, text]) => ({ t, speaker, text }));

function s(id: string, programId: string, d: number, title: string, bairroIds: string[], topic: Topic, durationSec: number, summary: string,
  whatChanges: string[], audioDescription: string[], rows: [number, string, string][], issue?: Segment['issue']): Segment {
  return { id, programId, airedAt: ago(d), title, bairroIds, topic, durationSec, summary, whatChanges, audioDescription, transcript: lines(rows), issue };
}

const BURACO = { key: 'buraco-alto-ceu', label: 'Buraco na Rua Alto do Céu' };
const AGUA = { key: 'agua-varzea', label: 'Falta d’água na Várzea' };

export const SEGMENTS: Segment[] = [
  s('t1', 'ne1', hours(5), 'Buraco na Rua Alto do Céu volta a abrir e complica a subida dos ônibus', ['casa-amarela'], 'obras', 142,
    'A cratera na Rua Alto do Céu, em Casa Amarela, reabriu depois da chuva da madrugada. Ônibus estão fazendo desvio e a prefeitura promete reparo até sexta.',
    ['A linha que sobe o morro faz desvio pela Estrada do Arraial até sexta.', 'Quem desce a pé deve usar a calçada do lado direito.', 'Protocolo de reclamação: anote o número para acompanhar o reparo.'],
    ['Repórter de capa de chuva aponta para uma cratera no asfalto, cercada por cones laranja.', 'Um ônibus manobra devagar para desviar.', 'Moradora mostra a água acumulada na frente de casa.'],
    [[0, A, 'A chuva da madrugada reabriu um buraco que já tinha sido motivo de reclamação em Casa Amarela.'], [12, R, 'Estou na Rua Alto do Céu, onde a cratera ocupa quase toda a pista.'], [31, M, 'É a terceira vez. Tapam, chove, abre de novo.'], [58, R, 'Os ônibus estão desviando pela Estrada do Arraial, o que aumenta a viagem em cerca de 15 minutos.'], [92, R, 'A prefeitura informou que uma equipe faz o reparo definitivo até sexta-feira.'], [128, A, 'A gente volta ao assunto se o prazo não for cumprido.']], BURACO),
  s('t2', 'ne2', 1, 'Defesa Civil vistoria barreiras no Alto de Nova Descoberta e Casa Amarela', ['nova-descoberta', 'casa-amarela'], 'alagamento', 168,
    'Técnicos vistoriaram 12 pontos de barreira na Zona Norte. Quatro famílias receberam orientação para deixar as casas se a chuva voltar forte.',
    ['Se a sirene ou o aviso por SMS tocar, procure o abrigo da escola municipal.', 'Observe rachaduras novas nas paredes e avise a Defesa Civil pelo 0800.', 'Lonas estão sendo instaladas nos pontos mais críticos.'],
    ['Técnicos de colete laranja caminham em uma encosta coberta por lona preta.', 'Imagem aérea mostra casas próximas a um barranco.'],
    [[0, A, 'A Defesa Civil fez hoje uma vistoria nas áreas de barreira da Zona Norte.'], [15, R, 'Em Nova Descoberta, doze pontos foram avaliados.'], [44, R, 'No limite com Casa Amarela, quatro famílias foram orientadas a sair em caso de chuva forte.'], [80, M, 'A gente dorme de ouvido em pé quando o céu fecha.'], [121, R, 'A previsão é de pancadas moderadas até quinta-feira.'], [155, A, 'O número da Defesa Civil está na tela.']]),
  s('t3', 'bom-dia-pe', hours(9), 'Faixa interditada na Avenida Boa Viagem deixa trânsito lento na Zona Sul', ['boa-viagem', 'pina'], 'transito', 96,
    'Reparo na rede de drenagem interdita uma faixa no sentido centro. A lentidão chega ao Pina nos horários de pico.',
    ['Saia 20 minutos mais cedo no sentido centro.', 'A Avenida Domingos Ferreira é a rota sugerida.', 'A interdição vai até domingo.'],
    ['Imagem aérea de longa fila de carros junto à praia, ainda com o céu amanhecendo.', 'Operários trabalham atrás de grades amarelas.'],
    [[0, A, 'Bom dia. Quem sai da Zona Sul precisa de paciência hoje.'], [10, R, 'Em Boa Viagem, uma faixa está fechada para reparo na drenagem.'], [38, R, 'A fila já chega ao Pina no sentido centro.'], [64, R, 'A orientação é usar a Domingos Ferreira.'], [88, A, 'Atualizamos em instantes.']]),
  s('t4', 'ne1', 1.2, 'Comerciantes da Boa Vista cobram iluminação nas ruas do centro', ['boa-vista'], 'comercio', 121,
    'Lojistas da Boa Vista dizem que as vendas caem depois das 17h por causa da pouca iluminação. A prefeitura prevê troca de lâmpadas em 30 dias.',
    ['Troca de lâmpadas prevista para os próximos 30 dias.', 'Reclamações de poste apagado podem ser feitas pelo aplicativo da prefeitura.'],
    ['Comerciante baixa a porta de uma loja ao entardecer em uma rua pouco iluminada.'],
    [[0, A, 'Comerciantes da Boa Vista reclamam de ruas escuras no fim do dia.'], [14, R, 'Depois das cinco da tarde, o movimento aqui cai pela metade.'], [40, M, 'O cliente tem receio de andar até o ponto de ônibus.'], [78, R, 'A prefeitura prevê a troca das lâmpadas em até 30 dias.'], [112, A, 'Vamos acompanhar.']]),
  s('t5', 'ne2', 2, 'Moradores da Várzea estão há quatro dias com abastecimento irregular', ['varzea'], 'agua', 134,
    'Manutenção em uma adutora afetou a Várzea. A companhia de saneamento promete normalizar até o fim de semana e enviar carros-pipa para pontos críticos.',
    ['Previsão de normalização: até domingo.', 'Carros-pipa vão atender escolas e postos de saúde primeiro.', 'Evite armazenar água em recipientes sem tampa.'],
    ['Moradora enche baldes em uma torneira de quintal.', 'Caminhão-pipa estacionado diante de uma escola.'],
    [[0, A, 'Na Várzea, quatro dias com as torneiras quase secas.'], [13, R, 'A manutenção em uma adutora afetou o abastecimento.'], [46, M, 'A gente acorda de madrugada para encher balde.'], [82, R, 'A companhia promete normalizar até domingo.'], [120, A, 'Carros-pipa vão reforçar os pontos críticos.']], AGUA),
  s('t6', 'ne1', 3, 'Canal transborda no Ibura e rua fica intransitável', ['ibura'], 'alagamento', 118,
    'Acúmulo de lixo agravou o transbordo de um canal no Ibura. A limpeza emergencial começou nesta manhã.',
    ['Evite contato com a água da enchente por risco de leptospirose.', 'A coleta extra de lixo passa nesta semana.'],
    ['Rua coberta por água barrenta até a altura dos pneus de um carro parado.'],
    [[0, A, 'No Ibura, o canal voltou a transbordar.'], [11, R, 'A água invadiu a rua e chegou às calçadas.'], [50, M, 'O lixo entope tudo, e a água volta para dentro de casa.'], [88, R, 'A limpeza emergencial começou de manhã.'], [108, A, 'Atenção ao risco de doenças.']]),
  s('t7', 'bom-dia-pe', 2.3, 'Mudança no retorno de Afogados altera o caminho de quem vai ao centro', ['afogados'], 'transito', 88,
    'A autarquia de trânsito mudou o retorno próximo ao mercado de Afogados. Sinalização provisória fica por 15 dias.',
    ['O retorno antigo está fechado.', 'Agentes orientam motoristas das 6h às 9h.'],
    ['Agente de trânsito de colete faz sinal para carros junto a cones.'],
    [[0, A, 'Atenção, motorista que passa por Afogados.'], [9, R, 'O retorno perto do mercado mudou de lugar.'], [41, R, 'A sinalização provisória vai ficar por 15 dias.'], [75, A, 'Fique atento às placas.']]),
  s('t8', 'ne1', 5, 'Obra de drenagem chega à Madalena e à Torre', ['madalena', 'torre'], 'obras', 110,
    'Galerias novas devem reduzir alagamentos entre Madalena e Torre. A previsão de conclusão é de oito meses.',
    ['Trechos serão interditados em etapas.', 'Linhas de ônibus podem mudar de ponto.'],
    ['Retroescavadeira abre uma vala ao lado de uma rua arborizada.'],
    [[0, A, 'Uma obra esperada há anos começou.'], [12, R, 'As galerias vão passar pela Madalena e pela Torre.'], [60, M, 'Se resolver o alagamento, a gente aguenta a poeira.'], [96, A, 'A previsão é de oito meses.']]),
  s('t9', 'ne2', 6, 'Praça de Casa Forte recebe mutirão de vacinação no sábado', ['casa-forte'], 'vacinacao', 74,
    'O mutirão atende adultos e crianças das 8h às 16h. É preciso levar documento com foto e caderneta.',
    ['Leve documento com foto e caderneta de vacinação.', 'Atendimento das 8h às 16h, sem agendamento.'],
    ['Tendas brancas montadas em uma praça com muitas árvores.'],
    [[0, A, 'Sábado tem vacinação na Praça de Casa Forte.'], [10, R, 'O atendimento vai das oito da manhã às quatro da tarde.'], [44, R, 'Basta levar documento e caderneta.'], [66, A, 'Não precisa agendar.']]),
  s('t10', 'bom-dia-pe', 8, 'Linha de ônibus da Imbiribeira ganha reforço no horário de pico', ['imbiribeira'], 'transporte', 69,
    'Dois veículos a mais vão operar das 6h às 8h. Passageiros ainda pedem abrigo no terminal.',
    ['Mais dois ônibus das 6h às 8h.', 'Horários atualizados no aplicativo de transporte.'],
    ['Passageiros em fila embarcam em um ônibus ao amanhecer.'],
    [[0, A, 'Boa notícia para quem pega ônibus na Imbiribeira.'], [11, R, 'A linha ganhou dois veículos no pico.'], [46, M, 'Ajuda, mas falta cobertura para a chuva.'], [64, A, 'Seguimos de olho.']]),
  s('t11', 'ne2', 10, 'Voluntários limpam o manguezal do Pina', ['pina'], 'meio-ambiente', 92,
    'Mutirão retirou cerca de uma tonelada de resíduos do mangue. Pescadores pedem coleta regular.',
    ['Novo mutirão está previsto para o mês que vem.', 'Inscrições na associação de moradores.'],
    ['Voluntários de luvas retiram garrafas plásticas entre raízes de mangue.'],
    [[0, A, 'No Pina, um mutirão pelo mangue.'], [12, R, 'Cerca de uma tonelada de lixo foi retirada.'], [52, M, 'O caranguejo está sumindo por causa do plástico.'], [86, A, 'Bom exemplo.']]),
  s('t12', 'calendario-pe', 12, 'Agenda cultural: maracatu e feira de artesanato em Beberibe', ['beberibe'], 'cultura', 80,
    'Sábado tem cortejo de maracatu e feira de artesanato gratuitos no bairro.',
    ['Entrada gratuita.', 'A rua principal fecha para carros das 14h às 20h.'],
    ['Batuqueiros de roupas coloridas tocam alfaias em uma rua enfeitada com bandeirolas.'],
    [[0, A, 'A agenda desta semana passa por Beberibe.'], [10, R, 'Tem cortejo de maracatu no sábado à tarde.'], [44, R, 'E feira de artesanato até a noite.'], [72, A, 'Tudo gratuito.']]),
  s('t13', 'ne1', 1.5, 'Chuva provoca deslizamento de barreira em Cavaleiro', ['jaboatao-cavaleiro'], 'alagamento', 84,
    'Uma barreira deslizou em Cavaleiro, em Jaboatão dos Guararapes. Ninguém ficou ferido, e duas casas foram interditadas.',
    ['Duas casas estão interditadas pela Defesa Civil.', 'Quem mora em área de risco deve ligar para o 0800.'],
    ['Barro e lona preta cobrem parte de uma escadaria.'],
    [[0, A, 'Em Jaboatão, a chuva provocou um deslizamento.'], [11, R, 'Foi aqui em Cavaleiro, durante a madrugada.'], [46, M, 'A gente ouviu o estalo e saiu correndo.'], [76, A, 'Ninguém ficou ferido.']]),
  s('t14', 'bom-dia-pe', 4, 'Rio Doce: moradores reclamam de ônibus lotados no início da manhã', ['olinda-rio-doce'], 'transporte', 78,
    'Passageiros de Rio Doce, em Olinda, relatam espera de até 40 minutos. O consórcio promete reforço.',
    ['Reforço de dois veículos prometido para a próxima semana.'],
    ['Fila longa em um terminal de ônibus ao amanhecer.'],
    [[0, A, 'Em Olinda, reclamação de quem depende de ônibus.'], [10, R, 'No terminal de Rio Doce, a fila dobra a esquina.'], [44, M, 'Passam três lotados antes de eu conseguir subir.'], [70, A, 'O consórcio promete reforço.']]),
];

/** Roteiros de "ao vivo". {B} é o bairro; a Rua Boa Vista testa a desambiguação via x bairro. */
export const LIVE_SCRIPTS: { title: string; topic: Topic; summary: string; whatChanges: string[]; lines: [string, string][] }[] = [
  {
    title: 'Ao vivo: chuva forte provoca alagamento em {B}', topic: 'alagamento',
    summary: 'Chuva forte alaga vias de {B}. Equipes de trânsito orientam desvios, e a Defesa Civil está em alerta.',
    whatChanges: ['Evite as vias alagadas de {B} nas próximas horas.', 'Em caso de risco, ligue para a Defesa Civil no 0800.', 'Ônibus podem atrasar na região.'],
    lines: [
      [A, 'Vamos agora às informações sobre a chuva que atinge a cidade neste momento.'],
      [R, 'Estou na Rua Boa Vista, que apesar do nome não fica no bairro da Boa Vista.'],
      [R, 'Aqui em {B}, a água já tomou boa parte da pista e subiu na calçada.'],
      [M, 'Em vinte minutos encheu tudo, nunca vi subir tão rápido.'],
      [R, 'Agentes de trânsito orientam os motoristas a evitar a região.'],
      [A, 'A Defesa Civil pede atenção de quem mora em áreas de risco.'],
    ],
  },
];
