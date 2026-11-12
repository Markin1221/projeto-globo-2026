// Modelo de domínio compartilhado entre web e api. É o formato que a API devolve.
// As tabelas correspondentes estão em db/migrations/001_init.sql.

export type Role = 'visitante' | 'morador' | 'jornalista' | 'moderador' | 'admin';
export type RelatoStatus = 'enviado' | 'apuracao' | 'confirmado' | 'falso';
export type AlertType = 'transito' | 'obras' | 'agua' | 'seguranca' | 'alagamento' | 'vacinacao';
export type Topic = AlertType | 'saude' | 'educacao' | 'cultura' | 'comercio' | 'transporte' | 'meio-ambiente' | 'geral';
export type ContentType = 'segment' | 'article' | 'relato' | 'comment';
/** Chave estável de conteúdo: "tipo:id". */
export type ContentKey = `${ContentType}:${string}`;
export interface LatLng { lat: number; lng: number }

export interface City { id: string; name: string; state: string; lat: number; lng: number; zoom: number }

export interface Bairro {
  id: string;
  cityId: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  aliases: string[];
  /** Bairros com nome parecido, usados na confirmação de desambiguação. */
  confusableWith: string[];
  active: boolean;
  /** Limite do bairro em GeoJSON (Polygon ou MultiPolygon), quando importado. */
  boundary?: unknown;
}

export interface Street { name: string; bairroId: string }

export interface User {
  id: string;
  name: string;
  handle: string;
  role: Role;
  bio: string;
  bairroId?: string;
  followed: string[];
  /** Só vem preenchido para o próprio usuário. */
  saved: ContentKey[];
  blocked: boolean;
  hue: number;
  locationAllowed: boolean;
  location?: string;
  deleted?: boolean;
}

/** Fonte de conteúdo: programa de TV ou portal. Configurável no Admin. */
export interface Program {
  id: string;
  name: string;
  short: string;
  schedule: string;
  kind: 'telejornal' | 'esporte' | 'comunitario' | 'portal';
  active: boolean;
}

export interface TranscriptLine { t: number; speaker: string; text: string }

export interface Segment {
  id: string;
  programId: string;
  title: string;
  airedAt: number;
  durationSec: number;
  bairroIds: string[];
  topic: Topic;
  summary: string;
  whatChanges: string[];
  audioDescription: string[];
  transcript: TranscriptLine[];
  issue?: { key: string; label: string };
  live?: boolean;
  utility?: number;
  caseStage?: CaseStage;
  caseUnlinked?: boolean;
}

export interface Article {
  id: string;
  kind: 'materia' | 'post';
  title: string;
  lead: string;
  body: string[];
  bairroIds: string[];
  topic: Topic;
  authorId?: string;
  /** Assinatura vinda da fonte externa (ex.: scraper), quando não há usuário. */
  authorName?: string;
  sourceId?: string;
  url?: string;
  imageUrl?: string;
  publishedAt: number;
  issue?: { key: string; label: string };
  /** Preenchido quando a matéria nasceu de um relato confirmado pela redação. */
  originRelatoId?: string;
  /** Onde a notícia se passa, segundo o modelo de localização. */
  locationScope?: LocationScope;
  locationCity?: string;
  /** Utilidade para o dia a dia do morador (0 a 100). */
  utility?: number;
  /** Bairros inferidos sem o nome no texto: por ponto de referência ou pelo modelo. */
  estimated?: EstimatedBairro[];
  caseStage?: CaseStage;
  caseUnlinked?: boolean;
}

export type LocationScope = 'recife' | 'rmr' | 'pe' | 'fora' | 'indefinido';
export interface EstimatedBairro { bairroId: string; how: 'referencia' | 'previsto'; confidence: number; reason: string }

export interface MediaAttachment { type: 'foto' | 'video' | 'audio'; name: string }

export interface Relato {
  id: string;
  title: string;
  category: Topic;
  description: string;
  media?: MediaAttachment;
  bairroId: string;
  street: string;
  reference: string;
  pin?: LatLng;
  occurredAt: number;
  createdAt: number;
  authorId: string;
  status: RelatoStatus;
  /** Ids de quem confirmou. Confirmações simuladas da demo vêm como "sim-N". */
  confirmations: string[];
  assigneeId?: string;
  newsroomNote?: string;
  officialArticleId?: string;
  history: { status: RelatoStatus; at: number; by?: string }[];
  issue?: { key: string; label: string };
  caseStage?: CaseStage;
  caseUnlinked?: boolean;
}

/** Tabela separada de propósito: a API só entrega a jornalista, admin e ao próprio autor. */
export interface RelatoContact {
  fullName: string;
  age: number;
  phone: string;
  address: string;
  acceptsContact: boolean;
}

export interface Comment {
  id: string;
  target: ContentKey;
  parentId?: string;
  authorId?: string;
  guest?: { fullName: string; age: number };
  text: string;
  createdAt: number;
}

export interface Alert {
  id: string;
  bairroId: string;
  type: AlertType;
  title: string;
  detail: string;
  severity: 'info' | 'atencao' | 'urgente';
  createdAt: number;
  source: string;
  active: boolean;
}

/** Reportagem planejada pela redação. bairroId null = o Recife inteiro. */
export type AgendaOutlet = 'g1' | 'ne1' | 'ne2';
export interface AgendaItem {
  id: string;
  title: string;
  note?: string;
  /** AAAA-MM-DD, no horário do Recife. */
  date: string;
  /** HH:MM, quando já tem horário. */
  time?: string;
  outlet: AgendaOutlet;
  cityId: string;
  bairroId: string | null;
}

export interface Report {
  id: string;
  target: ContentKey;
  reason: string;
  detail: string;
  reporterId?: string;
  createdAt: number;
  status: 'aberta' | 'procedente' | 'improcedente';
}

export interface Notification {
  id: string;
  userId: string;
  kind: 'ao-vivo' | 'relato' | 'comentario' | 'alerta' | 'sistema' | 'redacao';
  title: string;
  body: string;
  href: string;
  createdAt: number;
  read: boolean;
}

export interface LiveState {
  programId: string;
  bairroId: string;
  segmentId: string;
  lines: TranscriptLine[];
  shown: number;
  detectedAt: number;
  finished: boolean;
  finishedAt?: number;
}

export interface Meta { seededAt: number; tts: boolean; demoMode: boolean; ai: boolean }

/** Relatos do mesmo assunto, agrupados pelo servidor. id = id do relato mais antigo do grupo. */
export interface RelatoGroup {
  id: string;
  relatoIds: string[];
  category: Topic;
  bairroIds: string[];
  keywords: string[];
  title: string;
  firstAt: number;
  lastAt: number;
  confirmations: number;
}

/** Etapa de um problema acompanhado: surgiu, estão resolvendo, foi resolvido. */
export type CaseStage = 'problema' | 'andamento' | 'resolvido';
export type CaseItemKind = 'segment' | 'article' | 'relato';
export interface CaseItem {
  kind: CaseItemKind;
  id: string;
  at: number;
  title: string;
  stage: CaseStage;
  /** texto: detectada pelas palavras da notícia; redacao: escolhida por um jornalista. */
  stageBy: 'texto' | 'redacao';
  /** false para relatos de moradores (não verificados). */
  official: boolean;
}
/** Linha do tempo de um problema. id = chave do caso confirmado ou "auto-<id do primeiro item>". */
export interface Case {
  id: string;
  title: string;
  /** true quando a redação confirmou o caso (tem chave em issues). */
  confirmed: boolean;
  bairroIds: string[];
  topic: Topic;
  items: CaseItem[];
  /** Etapa atual segundo as fontes oficiais. */
  stage: CaseStage;
  /** Já esteve em andamento ou resolvido e voltou a ser problema. */
  reopened: boolean;
  /** Relatos de moradores mais novos que a última notícia oficial. */
  newerInformal: { count: number; stage: CaseStage } | null;
  reached: Partial<Record<CaseStage, number>>;
  firstAt: number;
  lastAt: number;
}

/** Resumo de relatos (com IA ou automático). Sempre sobre conteúdo não verificado. */
export interface RelatoSummary {
  title: string;
  summary: string;
  points: string[];
  urgent: { text: string; reason: string; relatoIds: string[] }[];
  advice?: string;
  engine: 'ia' | 'automatico';
  model?: string;
  relatoCount: number;
  generatedAt: number;
  cached?: boolean;
  note?: string;
  /** morador: só o essencial; redacao (jornalista e admin): tudo, para decidir se há pauta. */
  audience?: SummaryAudience;
  /** Só para a redação: cada relato com a utilidade estimada para a apuração. */
  items?: { relatoId: string; text: string; util: 'alta' | 'media' | 'baixa'; why: string }[];
  /** Só para a redação: o que checar antes de publicar. */
  checks?: string[];
}
export type SummaryAudience = 'morador' | 'redacao';

/** Resumo do dia de um bairro. Para o morador é uma chamada curta que leva ao trecho do telejornal. */
export interface DaySummaryData {
  bullets: string[];
  engine: 'ia' | 'automatico';
  model?: string;
  generatedAt: number;
  note?: string;
  cached?: boolean;
  audience: SummaryAudience;
  /** Morador: o trecho ou matéria que a chamada convida a ver. */
  watch?: { kind: 'segment' | 'article'; id: string; label: string };
  /** Redação: possíveis pautas e lacunas de cobertura. */
  leads?: string[];
}

/** Triagem de apoio à redação. Só jornalista, moderador e admin recebem. Não decide nada. */
export interface TriageSignal { kind: 'risco' | 'confianca' | 'utilidade' | 'prioridade'; text: string; weight: number; link?: string }
export interface Triage {
  risk: number;
  riskLevel: 'baixo' | 'medio' | 'alto';
  utility: 'baixo' | 'medio' | 'alto';
  priority: number;
  signals: TriageSignal[];
  duplicateOf?: string;
  model?: { pFalse: number; decisions: number };
}
export interface MlStats {
  location: { docs: number; bairros: number; accuracy: number | null; tested: number; trainedAt: number };
  triage: { decisions: number; falsos: number; confirmados: number; accuracy: number | null; trainedAt: number };
}

/** Resposta de GET /api/snapshot, já filtrada pelo papel de quem pede. */
export interface Db {
  meId: string | null;
  meta: Meta;
  cities: City[];
  bairros: Bairro[];
  streets: Street[];
  users: User[];
  programs: Program[];
  segments: Segment[];
  articles: Article[];
  relatos: Relato[];
  relatoContacts: Record<string, RelatoContact>;
  comments: Comment[];
  alerts: Alert[];
  reports: Report[];
  notifications: Notification[];
  lockedThreads: ContentKey[];
  hiddenContent: ContentKey[];
  live: LiveState | null;
  /** Grupos de relatos do mesmo assunto (só relatos visíveis nas listagens). */
  relatoGroups: RelatoGroup[];
  /** Problemas acompanhados ao longo do tempo (notícias + relatos ligados). */
  cases: Case[];
  /** Reportagens planejadas (agenda), dos últimos 60 dias em diante. */
  agenda: AgendaItem[];
  /** Só para a equipe (jornalista, moderador, admin). */
  triage?: Record<string, Triage>;
  /** Só para admin. */
  ml?: MlStats;
}

export type FeedEntry =
  | { kind: 'segment'; at: number; item: Segment }
  | { kind: 'article'; at: number; item: Article };

export interface RelatoDraft {
  title: string;
  category: Topic | '';
  description: string;
  media?: MediaAttachment;
  bairroId: string;
  street: string;
  reference: string;
  pin?: LatLng;
  occurredAt: string;
  fullName: string;
  age: string;
  phone: string;
  address: string;
  acceptsContact: boolean;
  ackUnverified: boolean;
}
