// Cliente da API NestJS. Mantém o último snapshot em memória e recarrega quando o servidor avisa (SSE).
import type { Bairro, ContentKey, Db, Program, RelatoDraft, RelatoSummary, Role, Topic, CaseItemKind, CaseStage, DaySummaryData } from '@/domain/types';

export class DomainError extends Error {}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const TOKEN_KEY = 'bairro-em-pauta:token';

export const EMPTY_DB: Db = {
  meId: null, meta: { seededAt: 0, tts: false, demoMode: true, ai: false }, relatoGroups: [], cases: [], cities: [], bairros: [], streets: [], users: [], programs: [], segments: [], articles: [],
  relatos: [], relatoContacts: {}, comments: [], alerts: [], reports: [], notifications: [], lockedThreads: [], hiddenContent: [], live: null,
};

function readToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function writeToken(t: string | null) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* sem persistência */ } }

export class HttpApi {
  private db: Db = EMPTY_DB;
  private listeners = new Set<() => void>();
  private token: string | null = null;
  private source: EventSource | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  loaded = false;
  /** Quando ligado, as ações falham de propósito, para demonstrar os estados de erro. */
  failing = false;

  snapshot = () => this.db;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(db: Db) { this.db = db; this.loaded = true; this.listeners.forEach((l) => l()); }

  async request<T = unknown>(method: string, path: string, body?: unknown, opts: { raw?: boolean } = {}): Promise<T> {
    if (this.failing && method !== 'GET') throw new DomainError('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    const res = await fetch(`${BASE}${path}`, {
      method, cache: 'no-store',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).catch(() => { throw new DomainError('Sem conexão com o servidor. Verifique a internet e tente de novo.'); });
    if (!res.ok) {
      const msg = await res.json().then((j) => (Array.isArray(j?.message) ? j.message[0] : j?.message)).catch(() => null);
      throw new DomainError(msg || 'Não foi possível concluir. Tente de novo.');
    }
    if (opts.raw) return res as unknown as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async init() {
    this.token = readToken();
    await this.refresh();
    if (this.db.meId === null && this.token) { this.token = null; writeToken(null); }
    this.connect();
  }

  async refresh() {
    const db = await this.request<Db>('GET', '/snapshot');
    this.set(db);
  }
  private scheduleRefresh() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => { this.refreshTimer = null; this.refresh().catch(() => undefined); }, 120);
  }
  private connect() {
    if (typeof EventSource === 'undefined') return;
    this.source?.close();
    this.source = new EventSource(`${BASE}/events`);
    this.source.onmessage = (e) => { if (e.data === 'change') this.scheduleRefresh(); };
    // Ao reconectar, recarrega para não perder mudanças.
    this.source.onopen = () => { if (this.loaded) this.scheduleRefresh(); };
  }

  /** Mutação: chama a API e já recarrega o snapshot, sem esperar o aviso do servidor. */
  private async mutate<T>(method: string, path: string, body?: unknown): Promise<T> {
    const out = await this.request<T>(method, path, body);
    await this.refresh();
    return out;
  }

  async login(userId: string | null) {
    if (!userId) { this.token = null; writeToken(null); await this.refresh(); return; }
    const { token } = await this.request<{ token: string }>('POST', '/auth/demo', { userId });
    this.token = token; writeToken(token);
    await this.refresh();
  }

  followBairro = (_a: string, bairroId: string) => this.mutate<void>('POST', '/me/follows', { bairroId });
  unfollowBairro = (_a: string, bairroId: string) => this.mutate<void>('DELETE', `/me/follows/${encodeURIComponent(bairroId)}`);
  toggleSave = async (_a: string, key: ContentKey) => (await this.mutate<{ saved: boolean }>('PUT', '/me/saved', { key })).saved;
  setLocation = (_a: string, allowed: boolean, label?: string) => this.mutate<void>('PUT', '/me/location', { allowed, label });
  deleteAccount = async (_a: string) => { await this.request('DELETE', '/me'); this.token = null; writeToken(null); await this.refresh(); };

  createRelato = (_a: string, draft: RelatoDraft) => this.mutate<{ id: string }>('POST', '/relatos', draft);
  confirmRelato = (_a: string, id: string) => this.mutate<void>('POST', `/relatos/${id}/confirmations`);
  /** O servidor só entrega contatos a jornalista, admin e ao próprio autor. */
  getRelatoContact = (_a: string, id: string) => this.db.relatoContacts[id] ?? null;
  assumeRelato = (_a: string, id: string) => this.mutate<void>('POST', `/relatos/${id}/assume`);
  decideRelato = (_a: string, id: string, verdict: 'confirmado' | 'falso', note: string) => this.mutate<{ articleId: string | null }>('POST', `/relatos/${id}/decision`, { verdict, note });
  simulateNeighbors = async (id: string, count: number) => (await this.mutate<{ added: number }>('POST', `/relatos/${id}/simulate-neighbors`, { count })).added;

  addComment = (_a: string, input: { target: ContentKey; parentId?: string; text: string; guest?: { fullName: string; age: string } }) => this.mutate<void>('POST', '/comments', input);
  createReport = (_a: string, input: { target: ContentKey; reason: string; detail: string }) => this.mutate<void>('POST', '/reports', input);
  publishOfficial = (_a: string, input: { title: string; lead: string; bairroId: string; topic: Topic }) => this.mutate<{ id: string }>('POST', '/posts', input);

  resolveReport = (_a: string, id: string, status: 'procedente' | 'improcedente') => this.mutate<void>('PATCH', `/reports/${id}`, { status });
  setHidden = (_a: string, key: ContentKey, hidden: boolean) => this.mutate<void>('PUT', '/moderation/hidden', { key, hidden });
  setThreadLocked = (_a: string, key: ContentKey, locked: boolean) => this.mutate<void>('PUT', '/moderation/locked', { key, locked });
  setBlocked = (_a: string, userId: string, blocked: boolean) => this.mutate<void>('PUT', `/users/${userId}/blocked`, { blocked });
  setRole = (_a: string, userId: string, role: Role) => this.mutate<void>('PUT', `/users/${userId}/role`, { role });

  addProgram = (_a: string, input: Pick<Program, 'name' | 'short' | 'schedule' | 'kind'> & { baseUrl?: string }) => this.mutate<void>('POST', '/sources', input);
  setProgramActive = (_a: string, id: string, active: boolean) => this.mutate<void>('PATCH', `/sources/${id}`, { active });
  addBairro = (_a: string, input: Pick<Bairro, 'name' | 'region' | 'cityId'>) => this.mutate<void>('POST', '/bairros', input);
  setBairroActive = (_a: string, id: string, active: boolean) => this.mutate<void>('PATCH', `/bairros/${id}`, { active });

  markRead = (_a: string, id?: string) => this.mutate<void>('POST', '/notifications/read', { id });
  startLive = () => this.mutate<{ segmentId: string }>('POST', '/live/start');
  resetDemo = () => this.mutate<void>('POST', '/demo/reset');
  daySummary = (bairroId: string) => this.request<DaySummaryData>('POST', '/resumos/dia', { bairroId });
  summarize = (input: { groupId?: string; bairroIds?: string[] }) => this.request<RelatoSummary>('POST', '/resumos', input);
  confirmCase = (caseId: string, label?: string) => this.mutate<{ key: string }>('POST', '/casos/confirmar', { caseId, label });
  setCaseLink = (kind: CaseItemKind, id: string, caseId: string | null) => this.mutate<void>('POST', '/casos/ligar', { kind, id, caseId });
  setCaseStage = (kind: CaseItemKind, id: string, stage: CaseStage | null) => this.mutate<void>('POST', '/casos/etapa', { kind, id, stage });
  recomputeMl = () => this.mutate<{ updated: number }>('POST', '/ml/recompute');
  ingestRuns = () => this.request<{ id: string; source_name: string; started_at: string; received: number; created: number; updated: number; skipped: number }[]>('GET', '/ingest/runs');

  /** Áudio da voz neural (Piper). Lança erro se o serviço de voz não estiver disponível. */
  async tts(text: string): Promise<Blob> {
    const res = await this.request<Response>('POST', '/tts', { text }, { raw: true });
    return res.blob();
  }
}

export const api = new HttpApi();
