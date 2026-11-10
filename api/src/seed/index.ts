import type { Alert, Comment, Notification, Report } from '../../../shared/domain/types';
import { ARTICLES } from './articles';
import { ago, BAIRROS, CITIES, hours, PROGRAMS, STREETS, USERS } from './base';
import { RELATO_CONTACTS, RELATOS } from './relatos';
import { SEGMENTS } from './segments';

const c = (id: string, target: Comment['target'], d: number, authorId: string | null, text: string, parentId?: string, guest?: Comment['guest']): Comment =>
  ({ id, target, createdAt: ago(d), text, parentId, guest, authorId: authorId ?? undefined });

const COMMENTS: Comment[] = [
  c('c1', 'segment:t1', hours(4), 'jose', 'Essa rua é o caminho da feira. Até carrinho de mão sofre para passar.'),
  c('c2', 'segment:t1', hours(3.6), 'lucia', 'Seu José, o senhor registrou o protocolo? Ajuda a cobrar.', 'c1'),
  c('c3', 'segment:t1', hours(3), null, 'Passei hoje e o desvio está mal sinalizado.', undefined, { fullName: 'Antônia Ribeiro', age: 44 }),
  c('c4', 'segment:t3', hours(6), 'marina', 'Levei 50 minutos do Pina ao centro.'),
  c('c5', 'segment:t5', 1.5, 'rafael', 'Aqui em casa voltou fraca ontem à noite.'),
  c('c6', 'segment:t5', 1.3, 'bruno', 'Obrigado, Rafael. Em qual rua? Vamos checar com a companhia.', 'c5'),
  c('c7', 'relato:r1', hours(2), 'marina', 'Passei aí faz pouco tempo e estava mesmo escorrendo bastante.'),
  c('c8', 'relato:r1', hours(1.5), 'jose', 'Mandei foto para a associação também.', 'c7'),
  c('c9', 'relato:r6', 1, 'lucia', 'Isso é um risco de saúde, precisa de atenção.'),
  c('c10', 'article:m3', hours(10), 'jose', 'Já era hora. Quando chove, molha toda a mercadoria.'),
  c('c11', 'article:m3', hours(9), null, 'Compra muita gente da feira aqui do Alto, tomara que dure.', undefined, { fullName: 'Pedro Henrique Sá', age: 29 }),
  c('c12', 'relato:r2', hours(5), 'rafael', 'Isso é spam, compre seguidores neste link.'),
  c('c13', 'segment:t2', 0.8, 'lucia', 'Estamos avisando as famílias de casa em casa.'),
  c('c14', 'article:m12', 4, 'rafael', 'O calendário não bate com a minha rua.'),
];

const al = (id: string, bairroId: string, type: Alert['type'], severity: Alert['severity'], d: number, title: string, detail: string, source: string): Alert =>
  ({ id, bairroId, type, severity, createdAt: ago(d), title, detail, source, active: true });

const ALERTS: Alert[] = [
  al('a1', 'casa-amarela', 'obras', 'atencao', hours(5), 'Desvio na Rua Alto do Céu', 'Ônibus desviam pela Estrada do Arraial até sexta.', 'NE1'),
  al('a2', 'casa-amarela', 'alagamento', 'urgente', hours(2), 'Risco de alagamento no Alto', 'Pancadas fortes previstas até as 21h. Evite as ladeiras.', 'Defesa Civil'),
  al('a3', 'casa-forte', 'vacinacao', 'info', 2, 'Mutirão de vacinação no sábado', 'Praça de Casa Forte, das 8h às 16h, sem agendamento.', 'NE2'),
  al('a4', 'varzea', 'agua', 'atencao', 1, 'Abastecimento irregular', 'Normalização prevista até domingo.', 'Companhia de saneamento'),
  al('a5', 'boa-viagem', 'transito', 'atencao', hours(9), 'Faixa interditada na avenida', 'Lentidão no sentido centro até domingo.', 'Bom Dia PE'),
  al('a6', 'ibura', 'alagamento', 'urgente', 3, 'Canal com nível alto', 'Evite contato com a água da enchente.', 'NE1'),
  al('a7', 'madalena', 'obras', 'info', 5, 'Interdição em etapas', 'Obra de drenagem muda pontos de ônibus.', 'NE1'),
  al('a8', 'boa-vista', 'seguranca', 'info', 1.2, 'Reforço de iluminação em 30 dias', 'Troca de lâmpadas nas ruas comerciais.', 'NE1'),
  al('a10', 'jaboatao-piedade', 'alagamento', 'atencao', 0.9, 'Ressaca na orla de Piedade', 'Evite o calçadão nos três pontos atingidos.', 'Portal'),
  al('a11', 'olinda-bairro-novo', 'obras', 'info', 2.4, 'Calçadão em obras', 'Trecho da orla interditado por dois meses.', 'Portal'),
  al('a9', 'espinheiro', 'transito', 'info', 0.6, 'Tapa-buraco à noite', 'Trechos com pare e siga das 22h às 5h.', 'Portal'),
];

const rp = (id: string, target: Report['target'], reason: string, detail: string, reporterId: string, d: number): Report =>
  ({ id, target, reason, detail, reporterId, createdAt: ago(d), status: 'aberta' });

const REPORTS: Report[] = [
  rp('d1', 'comment:c12', 'Spam ou propaganda', 'Link suspeito no comentário.', 'marina', hours(4)),
  rp('d2', 'relato:r8', 'Informação possivelmente falsa', 'Passei lá e o sinal estava funcionando.', 'jose', 1),
  rp('d3', 'comment:c14', 'Ofensa ou discurso de ódio', 'Comentário em tom agressivo.', 'lucia', 3),
  rp('d4', 'relato:r5', 'Dados pessoais expostos', 'A foto mostra a placa de um carro.', 'marina', 1.5),
  rp('d5', 'comment:c3', 'Informação possivelmente falsa', 'O desvio está sinalizado.', 'jose', hours(2)),
];

const n = (id: string, userId: string, kind: Notification['kind'], d: number, title: string, body: string, href: string, read = false): Notification =>
  ({ id, userId, kind, createdAt: ago(d), title, body, href, read });

const NOTIFICATIONS: Notification[] = [
  n('n1', 'marina', 'alerta', 0.6, 'Alerta no Espinheiro', 'Tapa-buraco à noite, com pare e siga.', '/alertas'),
  n('n2', 'marina', 'redacao', 14, 'Seu relato foi confirmado pela redação', 'Semáforo apagado no cruzamento virou post oficial.', '/materia/m25', true),
  n('n3', 'jose', 'ao-vivo', hours(5), 'Casa Amarela esteve no NE1', 'Buraco na Rua Alto do Céu voltou a abrir.', '/trecho/t1'),
  n('n4', 'helena', 'relato', hours(3), 'Novo relato em Casa Amarela', 'Água subindo na ladeira perto do mercadinho.', '/relatos/r1'),
  n('n5', 'camila', 'sistema', hours(4), 'Nova denúncia para tratar', 'Comentário com link suspeito.', '/moderacao'),
  n('n6', 'paulo', 'sistema', 1, 'Tejipió e Campo Grande seguem sem cobertura', 'Veja os bairros invisíveis no painel.', '/admin'),
];

export function createSeed() {
  return {
    cities: CITIES, bairros: BAIRROS, streets: STREETS, users: USERS, programs: PROGRAMS, segments: SEGMENTS, articles: ARTICLES,
    relatos: RELATOS, relatoContacts: RELATO_CONTACTS, comments: COMMENTS, alerts: ALERTS, reports: REPORTS, notifications: NOTIFICATIONS,
    lockedThreads: ['article:m17'] as const,
  };
}
