// Regras de negócio puras. Podem migrar como estão para guards e services do NestJS.
import type { AlertType, Bairro, Relato, RelatoDraft, RelatoStatus, Role, Street, Topic, User } from './types';

export const INFORMAL_SEAL = 'INFORMAL · NÃO VERIFICADO · PODE SER FALSO';
export const INFORMAL_WARNING =
  'Este conteúdo foi enviado por um morador e não foi confirmado pela redação. Pode conter informações incorretas ou falsas.';
export const SPEECH_PREFIX = 'Atenção: relato de morador, ainda não verificado e pode ser falso.';
export const AUTHOR_ACK =
  'Entendo que meu relato será exibido como não verificado e que informações falsas podem ser removidas e levar ao bloqueio da conta.';
export const CONTACT_NOTICE = 'Seus dados de contato são visíveis apenas para a redação.';
export const NEIGHBOR_NOTE =
  'Confirmação de vizinhos não torna o relato verdadeiro: só ajuda a redação a priorizar a apuração.';

export const TOPIC_LABEL: Record<Topic, string> = {
  transito: 'Trânsito', obras: 'Obras', agua: 'Falta d’água', seguranca: 'Segurança', alagamento: 'Alagamento',
  vacinacao: 'Vacinação', saude: 'Saúde', educacao: 'Educação', cultura: 'Cultura', comercio: 'Comércio',
  transporte: 'Transporte', 'meio-ambiente': 'Meio ambiente', geral: 'Geral',
};
export const ALERT_TYPES: AlertType[] = ['transito', 'obras', 'agua', 'seguranca', 'alagamento', 'vacinacao'];
export const STATUS_LABEL: Record<RelatoStatus, string> = {
  enviado: 'Enviado', apuracao: 'Em apuração', confirmado: 'Confirmado pela redação', falso: 'Falso / Não confirmado',
};
export const ROLE_LABEL: Record<Role, string> = {
  visitante: 'Visitante', morador: 'Morador', jornalista: 'Jornalista', moderador: 'Moderador', admin: 'Admin',
};

export type Verdict = { ok: true } | { ok: false; reason: string };
const yes: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

export const isGuest = (u: User) => u.role === 'visitante';
export const canSeeContact = (u: User) => u.role === 'jornalista' || u.role === 'admin';
export const canAudit = (u: User) => u.role === 'jornalista';
/** Confirmar casos, ligar/tirar itens e corrigir a etapa: jornalista e admin. */
export const canEditCases = (u: User) => u.role === 'jornalista' || u.role === 'admin';
export const canModerate = (u: User) => u.role === 'moderador';
export const canAdmin = (u: User) => u.role === 'admin';
export const canFollow = (u: User) => !isGuest(u);
export const canSave = (u: User) => !isGuest(u);

export function canPublishRelato(u: User): Verdict {
  if (isGuest(u)) return no('Entre como morador para publicar um relato.');
  if (u.blocked) return no('Esta conta foi bloqueada por publicar informação falsa de forma recorrente.');
  return yes;
}

/** Regras: 1 por usuário por relato; autor não confirma; relato falso não recebe confirmação. */
export function canConfirm(u: User, r: Relato): Verdict {
  if (isGuest(u)) return no('Entre como morador para dizer que também viu.');
  if (u.blocked) return no('Esta conta está bloqueada.');
  if (r.authorId === u.id) return no('Você enviou este relato, então não pode confirmá-lo.');
  if (r.status === 'falso') return no('Relato marcado como falso não recebe confirmações.');
  if (r.status === 'confirmado') return no('A redação já concluiu a apuração deste relato.');
  if (r.confirmations.includes(u.id)) return no('Você já disse que viu isso. Cada pessoa confirma uma vez.');
  return yes;
}

export function canAssume(u: User, r: Relato): Verdict {
  if (!canAudit(u)) return no('Só jornalistas apuram relatos.');
  if (r.status !== 'enviado') return no('Este relato já está com a apuração em andamento ou concluída.');
  return yes;
}

/** Só um jornalista humano decide. Nenhuma automação chama esta transição. */
export function canDecide(u: User, r: Relato): Verdict {
  if (!canAudit(u)) return no('Só jornalistas mudam o status da apuração.');
  if (r.status !== 'apuracao') return no('Assuma a apuração antes de decidir.');
  if (r.assigneeId !== u.id) return no('Esta apuração está com outro jornalista.');
  return yes;
}

export function validateGuest(fullName: string, age: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (fullName.trim().split(/\s+/).length < 2) errors.fullName = 'Informe nome e sobrenome.';
  const n = Number(age);
  if (!age.trim() || !Number.isInteger(n)) errors.age = 'Informe sua idade em números.';
  else if (n < 13) errors.age = 'É preciso ter 13 anos ou mais para comentar.';
  else if (n > 120) errors.age = 'Confira a idade informada.';
  return errors;
}

export function validateRelato(d: RelatoDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.title.trim().length < 8) e.title = 'Escreva um título com pelo menos 8 letras.';
  if (!d.category) e.category = 'Escolha uma categoria.';
  if (d.description.trim().length < 20) e.description = 'Conte o que aconteceu com pelo menos 20 letras.';
  if (!d.bairroId) e.bairroId = 'Escolha o bairro onde aconteceu.';
  if (d.street.trim().length < 3) e.street = 'Informe a rua.';
  if (d.reference.trim().length < 3) e.reference = 'Informe um ponto de referência.';
  if (!d.occurredAt) e.occurredAt = 'Informe a data e a hora.';
  else if (new Date(d.occurredAt).getTime() > Date.now() + 60000) e.occurredAt = 'A data não pode estar no futuro.';
  if (d.fullName.trim().split(/\s+/).length < 2) e.fullName = 'Informe nome e sobrenome.';
  const age = Number(d.age);
  if (!d.age.trim() || !Number.isInteger(age)) e.age = 'Informe sua idade em números.';
  else if (age < 13) e.age = 'É preciso ter 13 anos ou mais para enviar um relato.';
  else if (age > 120) e.age = 'Confira a idade informada.';
  if (d.phone.replace(/\D/g, '').length < 10) e.phone = 'Informe telefone ou WhatsApp com DDD.';
  if (d.address.trim().length < 5) e.address = 'Informe seu endereço.';
  if (!d.ackUnverified) e.ackUnverified = 'Marque o aceite para publicar.';
  return e;
}

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** index: posição no texto sem acentos (stripAccents), útil para recortar o trecho que gerou a detecção. */
export interface Detection { bairroId: string; match: string; kind: 'bairro' | 'rua'; index: number }
export const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Detecta bairros citados e separa "Avenida Boa Viagem" (via) de "Boa Viagem" (bairro). */
export function detectBairros(text: string, bairros: Bairro[]): Detection[] {
  const hay = stripAccents(text).toLowerCase();
  const names = bairros.flatMap((b) => [b.name, ...b.aliases].map((n) => ({ id: b.id, n: normalize(n) })))
    .sort((a, b) => b.n.length - a.n.length);
  const used: [number, number][] = [];
  const found: Detection[] = [];
  for (const { id, n } of names) {
    const re = new RegExp(`(^|[^a-z])(${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^a-z])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay))) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (used.some(([a, b]) => start < b && end > a)) continue;
      used.push([start, end]);
      const before = hay.slice(Math.max(0, start - 12), start);
      const kind = /(rua|avenida|av\.|travessa|estrada)( d[aeo]s?)? $/.test(before) ? 'rua' : 'bairro';
      found.push({ bairroId: id, match: m[2], kind, index: start });
    }
  }
  return found;
}

export interface PlaceCandidate {
  key: string;
  kind: 'bairro' | 'rua';
  label: string;
  detail: string;
  bairroId: string;
  /** Texto de confirmação quando há risco de confusão. */
  confirm?: string;
}

export function searchPlaces(query: string, bairros: Bairro[], streets: Street[]): PlaceCandidate[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const byId = new Map(bairros.map((b) => [b.id, b]));
  const out: PlaceCandidate[] = [];
  for (const b of bairros) {
    if (!b.active || ![b.name, ...b.aliases].some((n) => normalize(n).includes(q))) continue;
    const twin = b.confusableWith.map((id) => byId.get(id)).filter(Boolean) as Bairro[];
    out.push({
      key: `b-${b.id}`, kind: 'bairro', label: b.name, detail: `Bairro na região ${b.region}`, bairroId: b.id,
      confirm: twin.length
        ? `Você quer seguir ${b.name}, na região ${b.region}? Este não é ${twin.map((t) => `${t.name} (${t.region})`).join(' nem ')}.`
        : undefined,
    });
  }
  for (const s of streets) {
    if (!normalize(s.name).includes(q)) continue;
    const b = byId.get(s.bairroId);
    if (!b) continue;
    out.push({
      key: `s-${s.name}`, kind: 'rua', label: s.name, detail: `Via no bairro ${b.name}`, bairroId: b.id,
      confirm: `${s.name} é uma via, não um bairro. Ela fica em ${b.name}. Quer seguir o bairro ${b.name}?`,
    });
  }
  return out;
}

export function relatoSpeech(r: Pick<Relato, 'title' | 'description'>, bairro?: string) {
  return `${SPEECH_PREFIX} ${r.title}.${bairro ? ` Em ${bairro}.` : ''} ${r.description}`;
}

export function relatoShareText(r: Relato, bairro: string, url: string) {
  return [`⚠ ${INFORMAL_SEAL}`, INFORMAL_WARNING, '', `${r.title} (${bairro})`, r.description, '', `Status: ${STATUS_LABEL[r.status]}`, url].join('\n');
}

const TOPIC_HINTS: [Topic, RegExp][] = [
  ['alagamento', /alag|enchente|inunda|chuva forte|barreira|desliza|transbord/],
  ['agua', /falta d.agua|abastecimento|compesa|adutora|sem agua|vazamento de agua/],
  ['vacinacao', /vacin|imuniza/],
  ['transito', /transito|engarraf|interdi|semaforo|congestion|acidente/],
  ['transporte', /onibus|\bmetro\b|terminal integrado|\bbrt\b|ciclovia/],
  ['obras', /\bobras?\b|buraco|asfalt|paviment|drenagem|cratera/],
  ['seguranca', /assalt|policia|homicid|\btiros?\b|crime|roubo|furto|\bpres[oa]s?\b|assassin/],
  ['saude', /saude|hospital|upa\b|ubs\b|dengue|medico/],
  ['educacao', /escola|aluno|matricula|creche|universidade|professor/],
  ['meio-ambiente', /lixo|mangue|poluicao|esgoto|arvore|meio ambiente/],
  // "feira" sozinha: não pega "quinta-feira".
  ['comercio', /\bcomercio|(?<![\w-])feiras?\b|\bmercado publico|lojista|consumidor/],
  ['cultura', /cultura|festival|carnaval|maracatu|frevo|\bshows?\b|teatro|sao joao|cinema|\bfilme/],
];
/** Tema provável de um texto. Heurística simples para conteúdo que chega sem tema (ex.: scraper). */
export function classifyTopic(text: string): Topic {
  const hay = normalize(text);
  return TOPIC_HINTS.find(([, re]) => re.test(hay))?.[0] ?? 'geral';
}

/** Ajusta siglas e abreviações para a leitura em voz alta soar natural. */
export function speechText(text: string) {
  return text
    .replace(/\bNE([12])\b/g, (_, n) => `ene é ${n === '1' ? 'um' : 'dois'}`)
    .replace(/\bBDPE\b/g, 'Bom Dia Pernambuco')
    .replace(/\bPE\b/g, 'Pernambuco')
    .replace(/\b(\d{1,2})h(\d{2})\b/g, '$1 horas e $2')
    .replace(/\b(\d{1,2})h\b/g, '$1 horas')
    .replace(/\bSeg\.\s/g, 'segunda ').replace(/\bsex\.(?=[,\s])/g, 'sexta').replace(/\bsáb\.(?=[,\s])/g, 'sábado')
    .replace(/\s+/g, ' ').trim();
}

/** Distância aproximada em km entre dois pontos (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
export function nearestBairro<T extends { lat: number; lng: number; active: boolean }>(p: { lat: number; lng: number }, bairros: T[]): T | undefined {
  return bairros.filter((b) => b.active).sort((x, y) => distanceKm(p, x) - distanceKm(p, y))[0];
}
