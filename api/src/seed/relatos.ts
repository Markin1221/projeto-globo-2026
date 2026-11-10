import type { MediaAttachment, Relato, RelatoContact, RelatoStatus, Topic } from '../../../shared/domain/types';
import { ago, hours } from './base';

const neighbors = (n: number) => Array.from({ length: n }, (_, i) => `vizinho-${i + 1}`);

interface Row {
  id: string; d: number; status: RelatoStatus; title: string; category: Topic; description: string; bairroId: string; street: string;
  reference: string; authorId: string; n: number; assigneeId?: string; note?: string; article?: string; media?: MediaAttachment;
}

const rows: Row[] = [
  { id: 'r1', d: hours(3), status: 'enviado', title: 'Água subindo na ladeira perto do mercadinho', category: 'alagamento', description: 'Depois da chuva da tarde, a água começou a descer forte pela ladeira e entrou em duas garagens.', bairroId: 'casa-amarela', street: 'Rua Alto do Céu', reference: 'Mercadinho da esquina', authorId: 'lucia', n: 6, media: { type: 'foto', name: 'ladeira.jpg' } },
  // Relatos do mesmo assunto, para mostrar o agrupamento e o resumo.
  { id: 'r16', d: hours(2.5), status: 'enviado', title: 'Escadaria do Alto virou cachoeira com a chuva', category: 'alagamento', description: 'A água desce forte pela escadaria e já tem lama entrando nas casas de baixo. Os idosos não conseguem passar.', bairroId: 'casa-amarela', street: 'Rua Alto do Céu', reference: 'Escadaria azul', authorId: 'jose', n: 4 },
  { id: 'r17', d: hours(1.5), status: 'enviado', title: 'Barreira começou a ceder atrás das casas depois da chuva', category: 'alagamento', description: 'Com a chuva forte, caiu terra da barreira no quintal e a parede ficou rachada. Estamos com medo de dormir em casa.', bairroId: 'casa-amarela', street: 'Rua Alto do Céu', reference: 'Depois do mercadinho', authorId: 'rafael', n: 2 },
  { id: 'r18', d: hours(20), status: 'enviado', title: 'Torneira seca há três dias na Várzea', category: 'agua', description: 'Desde sábado a água não chega na rua. A gente está comprando garrafão e pegando água no vizinho que tem cisterna.', bairroId: 'varzea', street: 'Rua da Várzea', reference: 'Perto da igreja', authorId: 'lucia', n: 5 },
  { id: 'r19', d: hours(16), status: 'enviado', title: 'Sem água desde o fim de semana', category: 'agua', description: 'A companhia falou em manutenção na adutora, mas o abastecimento não voltou nenhum dia desta semana. A caixa d’água secou e o carro-pipa não passou por aqui.', bairroId: 'varzea', street: 'Rua do Rio', reference: 'Em frente ao campinho', authorId: 'jose', n: 3 },
  { id: 'r2', d: hours(7), status: 'enviado', title: 'Ônibus não subiu o morro hoje de manhã', category: 'transporte', description: 'Fiquei mais de uma hora no ponto e nenhum ônibus apareceu. Os vizinhos disseram que a linha mudou.', bairroId: 'casa-amarela', street: 'Estrada do Arraial', reference: 'Ponto em frente à farmácia', authorId: 'jose', n: 4 },
  { id: 'r3', d: 1, status: 'enviado', title: 'Poste com fiação solta na calçada', category: 'seguranca', description: 'A fiação está baixa e encosta em quem passa. Já liguei para a companhia, mas ninguém veio.', bairroId: 'varzea', street: 'Rua da Várzea', reference: 'Perto da praça', authorId: 'rafael', n: 3, media: { type: 'video', name: 'fiacao.mp4' } },
  { id: 'r4', d: 1.6, status: 'enviado', title: 'Falta de remédio no posto do bairro', category: 'saude', description: 'Fui buscar remédio de pressão e disseram que só chega no mês que vem.', bairroId: 'nova-descoberta', street: 'Rua Principal', reference: 'Posto de saúde', authorId: 'lucia', n: 2 },
  { id: 'r5', d: 2.2, status: 'enviado', title: 'Calçada cedeu em frente à escola', category: 'obras', description: 'Abriu um buraco na calçada na hora da saída dos alunos. Colocaram um galho para sinalizar.', bairroId: 'torre', street: 'Rua da Madalena', reference: 'Portão da escola', authorId: 'rafael', n: 1 },
  { id: 'r6', d: hours(30), status: 'apuracao', title: 'Vazamento de esgoto na rua da feira', category: 'obras', description: 'O esgoto corre pela sarjeta há três dias e o cheiro está forte perto das bancas.', bairroId: 'casa-amarela', street: 'Estrada do Arraial', reference: 'Lateral da feira', authorId: 'jose', n: 11, assigneeId: 'helena' },
  { id: 'r7', d: 2.5, status: 'apuracao', title: 'Barreira com rachadura depois da chuva', category: 'alagamento', description: 'Apareceu uma rachadura grande na barreira atrás das casas. Estamos com medo de dormir aqui.', bairroId: 'ibura', street: 'Córrego do Alto', reference: 'Escadaria azul', authorId: 'lucia', n: 9, assigneeId: 'bruno', media: { type: 'foto', name: 'barreira.jpg' } },
  { id: 'r8', d: 3, status: 'apuracao', title: 'Semáforo piscando em cruzamento movimentado', category: 'transito', description: 'O sinal fica no amarelo piscante desde ontem e já houve duas batidas leves.', bairroId: 'afogados', street: 'Avenida Principal', reference: 'Em frente ao mercado', authorId: 'rafael', n: 5, assigneeId: 'helena' },
  { id: 'r9', d: 5, status: 'falso', title: 'Vacina da praça estaria vencida', category: 'vacinacao', description: 'Me disseram no grupo da rua que as vacinas do mutirão estão fora da validade.', bairroId: 'casa-forte', street: 'Praça de Casa Forte', reference: 'Tendas do mutirão', authorId: 'rafael', n: 2, assigneeId: 'bruno', note: 'A redação checou os lotes com a Secretaria de Saúde e conferiu as validades no local. Todos estavam dentro do prazo. A informação não procede.' },
  { id: 'r10', d: 7, status: 'falso', title: 'Ponte da Torre vai ser interditada amanhã', category: 'transito', description: 'Vi em uma mensagem encaminhada que a ponte será fechada por um mês.', bairroId: 'torre', street: 'Rua da Madalena', reference: 'Ponte de pedestres', authorId: 'rafael', n: 1, assigneeId: 'helena', note: 'A prefeitura informou que não há interdição prevista. O laudo está em andamento e a passagem segue liberada.' },
  { id: 'r11', d: 10, status: 'falso', title: 'Água da Várzea estaria contaminada', category: 'agua', description: 'Estão dizendo que a água fez dezenas de pessoas passarem mal na comunidade.', bairroId: 'varzea', street: 'Rua da Várzea', reference: 'Comunidade do rio', authorId: 'lucia', n: 3, assigneeId: 'bruno', note: 'A redação procurou os postos de saúde da área e não encontrou registro de casos. A análise da companhia não apontou contaminação.' },
  { id: 'r15', d: 12, status: 'falso', title: 'Assalto em série na orla durante a madrugada', category: 'seguranca', description: 'Áudio que circula fala em vários assaltos na mesma noite perto da praia.', bairroId: 'boa-viagem', street: 'Avenida Boa Viagem', reference: 'Segundo jardim', authorId: 'jose', n: 2, assigneeId: 'helena', note: 'A Secretaria de Defesa Social não tem registro das ocorrências citadas. O áudio circula desde 2023 e não corresponde a fato recente.' },
  { id: 'r12', d: 5, status: 'confirmado', title: 'Poste caído bloqueando a passagem', category: 'seguranca', description: 'O poste caiu de manhã e ficou atravessado na rua, com fios no chão.', bairroId: 'nova-descoberta', street: 'Rua Principal', reference: 'Depois da padaria', authorId: 'lucia', n: 14, assigneeId: 'helena', note: 'A equipe esteve no local e a concessionária confirmou a queda.', article: 'm23', media: { type: 'foto', name: 'poste.jpg' } },
  { id: 'r13', d: 10, status: 'confirmado', title: 'Água jorrando na calçada há dois dias', category: 'agua', description: 'Tem um cano estourado e a água desce rua abaixo sem parar.', bairroId: 'agua-fria', street: 'Rua da Fonte', reference: 'Em frente à igreja', authorId: 'jose', n: 8, assigneeId: 'bruno', note: 'A companhia de saneamento confirmou o rompimento.', article: 'm24' },
  { id: 'r14', d: 14.5, status: 'confirmado', title: 'Semáforo apagado no cruzamento', category: 'transito', description: 'O sinal apagou e os carros estão passando sem ordem nenhuma.', bairroId: 'espinheiro', street: 'Rua do Espinheiro', reference: 'Perto do colégio', authorId: 'marina', n: 7, assigneeId: 'helena', note: 'A autarquia de trânsito confirmou a pane.', article: 'm25' },
  // Morador conta o andamento de um caso (não verificado).
  { id: 'r20', d: 1.2, status: 'enviado', title: 'Estão ajeitando a calçada da escola', category: 'obras', description: 'Chegou uma equipe de manhã e cercou o buraco da calçada em frente à escola. Disseram que conserta até amanhã.', bairroId: 'torre', street: 'Rua da Madalena', reference: 'Portão da escola', authorId: 'lucia', n: 2 },
];

const contacts: Record<string, Omit<RelatoContact, 'acceptsContact'>> = {
  lucia: { fullName: 'Lúcia Barbosa de Lima', age: 52, phone: '(81) 90000-0101', address: 'Rua de exemplo, 10, Casa Amarela' },
  jose: { fullName: 'José Ferreira da Silva', age: 71, phone: '(81) 90000-0102', address: 'Rua de exemplo, 22, Casa Amarela' },
  rafael: { fullName: 'Rafael Monteiro Santos', age: 23, phone: '(81) 90000-0103', address: 'Rua de exemplo, 35, Várzea' },
  marina: { fullName: 'Marina Albuquerque Pires', age: 38, phone: '(81) 90000-0104', address: 'Rua de exemplo, 48, Casa Amarela' },
};

export const RELATOS: Relato[] = rows.map((r) => {
  const createdAt = ago(r.d);
  const history: Relato['history'] = [{ status: 'enviado', at: createdAt }];
  if (r.status !== 'enviado') history.push({ status: 'apuracao', at: createdAt + 36e5, by: r.assigneeId });
  if (r.status === 'confirmado' || r.status === 'falso') history.push({ status: r.status, at: createdAt + 864e4, by: r.assigneeId });
  return {
    id: r.id, title: r.title, category: r.category, description: r.description, bairroId: r.bairroId, street: r.street, reference: r.reference, media: r.media,
    occurredAt: createdAt - 18e5, createdAt, authorId: r.authorId, status: r.status, confirmations: neighbors(r.n), assigneeId: r.assigneeId,
    newsroomNote: r.note, officialArticleId: r.article, history,
  };
});

export const RELATO_CONTACTS: Record<string, RelatoContact> = Object.fromEntries(
  rows.map((r) => [r.id, { ...contacts[r.authorId], acceptsContact: r.id !== 'r5' }]),
);
export const USER_CONTACTS = contacts;
