// Leitura do banco para o formato de domínio compartilhado (shared/domain/types.ts).
import { canModerate, canSeeContact } from '../../shared/domain/rules';
import type { Article, Bairro, ContentKey, Db, LiveState, Relato, RelatoStatus, Segment, User } from '../../shared/domain/types';
import { q, type Conn } from './db';
import { clusterRelatos } from './ml/cluster';
import { buildCases } from './ml/cases';
import { aiEnabled } from './ai';

const ms = (d: Date | null) => (d ? d.getTime() : 0);
export const DEMO_MODE = (process.env.DEMO_MODE ?? 'true') !== 'false';
export const NEWS_LIMIT = Number(process.env.SNAPSHOT_NEWS_LIMIT ?? 600);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GUEST: User = { id: 'guest', name: 'Visitante', handle: 'visitante', role: 'visitante', bio: '', followed: [], saved: [], blocked: false, hue: 210, locationAllowed: false };

function group<T, K extends string>(rows: T[], k: (r: T) => K) {
  const m = new Map<K, T[]>();
  for (const r of rows) { const key = k(r); const arr = m.get(key); if (arr) arr.push(r); else m.set(key, [r]); }
  return m;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function toUser(r: Row, followed: string[], saved: ContentKey[], self: boolean): User {
  return {
    id: r.id, name: r.name, handle: r.handle, role: r.role, bio: r.bio, bairroId: r.home_bairro_id ?? undefined, followed,
    saved: self ? saved : [], blocked: r.blocked, hue: r.hue, deleted: !!r.deleted_at,
    locationAllowed: self ? r.location_allowed : false, location: self ? r.location_label ?? undefined : undefined,
  };
}

export async function loadUser(id: string, c?: Conn): Promise<User | null> {
  if (!UUID.test(id)) return null;
  const [r] = await q('select * from users where id = $1 and deleted_at is null', [id], c);
  if (!r) return null;
  const f = await q<{ bairro_id: string }>('select bairro_id from user_follows where user_id = $1 order by created_at', [id], c);
  const s = await q<{ target_type: string; target_id: string }>('select target_type, target_id from user_saves where user_id = $1 order by created_at desc', [id], c);
  return toUser(r, f.map((x) => x.bairro_id), s.map((x) => `${x.target_type}:${x.target_id}` as ContentKey), true);
}

export async function loadBairros(c?: Conn): Promise<Bairro[]> {
  const rows = await q('select * from bairros order by name', [], c);
  const al = group(await q('select * from bairro_aliases', [], c), (r: Row) => r.bairro_id);
  const cf = group(await q('select * from bairro_confusions', [], c), (r: Row) => r.bairro_id);
  return rows.map((r: Row) => ({
    id: r.id, cityId: r.city_id, name: r.name, region: r.region, lat: r.lat, lng: r.lng, active: r.active,
    aliases: (al.get(r.id) ?? []).map((a: Row) => a.alias), confusableWith: (cf.get(r.id) ?? []).map((a: Row) => a.other_id),
    ...(r.boundary ? { boundary: r.boundary } : {}),
  }));
}

function relatoFrom(r: Row, confirmations: string[], history: Relato['history'], officialArticleId?: string): Relato {
  return {
    id: r.id, title: r.title, category: r.category, description: r.description, media: r.media_type ? { type: r.media_type, name: r.media_name } : undefined,
    bairroId: r.bairro_id, street: r.street, reference: r.reference, pin: r.pin_lat != null ? { lat: r.pin_lat, lng: r.pin_lng } : undefined,
    occurredAt: ms(r.occurred_at), createdAt: ms(r.created_at), authorId: r.author_id, status: r.status as RelatoStatus, confirmations,
    assigneeId: r.assignee_id ?? undefined, newsroomNote: r.newsroom_note ?? undefined, officialArticleId, history,
    caseStage: r.case_stage ?? undefined, caseUnlinked: r.case_unlinked || undefined,
  };
}
const confirmationIds = (rows: Row[]) => rows.map((x: Row, i: number) => x.user_id ?? `sim-${i + 1}`);

export async function loadRelato(id: string, c?: Conn): Promise<Relato | null> {
  if (!UUID.test(id)) return null;
  const [r] = await q('select * from relatos where id = $1', [id], c);
  if (!r) return null;
  const cf = await q('select user_id from relato_confirmations where relato_id = $1 order by id', [id], c);
  const h = await q('select status, at, by_user from relato_status_history where relato_id = $1 order by at, id', [id], c);
  const [art] = await q('select id from news_items where origin_relato_id = $1 limit 1', [id], c);
  return relatoFrom(r, confirmationIds(cf), h.map((x: Row) => ({ status: x.status, at: ms(x.at), by: x.by_user ?? undefined })), art?.id);
}

export async function seededAt() {
  const [m] = await q("select value from app_meta where key = 'seeded_at'");
  return m ? Number(m.value) : 0;
}

/** Tudo o que a tela precisa, já filtrado pelo papel de quem pede. */
export async function snapshot(viewer: User | null, live: LiveState | null): Promise<Db> {
  const mod = !!viewer && canModerate(viewer);
  const staff = !!viewer && canSeeContact(viewer);

  const [cities, bairros, streets, usersRows, follows, sources, news, relRows, confRows, histRows, comRows, alertRows, hidden, locked, meta] = await Promise.all([
    q('select * from cities where active order by (id <> \'recife\'), name'),
    loadBairros(),
    q('select name, bairro_id from streets order by name'),
    q('select * from users where deleted_at is null order by created_at, name'),
    q('select user_id, bairro_id from user_follows order by created_at'),
    q('select * from sources order by created_at, id'),
    q('select * from news_items order by published_at desc limit $1', [NEWS_LIMIT]),
    q('select * from relatos order by created_at desc'),
    q('select relato_id, user_id from relato_confirmations order by id'),
    q('select relato_id, status, at, by_user from relato_status_history order by at, id'),
    q('select * from comments order by created_at limit 5000'),
    q('select * from alerts where active order by created_at desc'),
    q('select target_type, target_id from hidden_content'),
    q('select target_type, target_id from locked_threads'),
    seededAt(),
  ]);

  const newsIds = news.map((n: Row) => n.id);
  const [nb, tl, origins] = await Promise.all([
    q('select news_item_id, bairro_id, method, confidence, matched_text from news_item_bairros where news_item_id = any($1)', [newsIds]),
    q("select news_item_id, t_sec, speaker, text from transcript_lines where news_item_id = any($1) order by t_sec, id", [newsIds]),
    q('select id, origin_relato_id from news_items where origin_relato_id is not null'),
  ]);
  const nbBy = group(nb, (r: Row) => r.news_item_id);
  const tlBy = group(tl, (r: Row) => r.news_item_id);
  const issues = new Map((await q('select * from issues')).map((r: Row) => [r.id, r.label]));
  const issueOf = (id: string | null) => (id ? { key: id, label: issues.get(id) ?? id } : undefined);

  const hiddenKeys = hidden.map((h: Row) => `${h.target_type}:${h.target_id}` as ContentKey);
  const isHidden = (k: string) => hiddenKeys.includes(k as ContentKey);

  const segments: Segment[] = [];
  const articles: Article[] = [];
  for (const n of news) {
    const bairroIds = (nbBy.get(n.id) ?? []).map((x: Row) => x.bairro_id);
    if (n.kind === 'trecho') {
      if (!mod && isHidden(`segment:${n.id}`)) continue;
      segments.push({
        id: n.id, programId: n.source_id, title: n.title, airedAt: ms(n.published_at), durationSec: n.duration_sec ?? 60, bairroIds, topic: n.topic_id,
        summary: n.summary, whatChanges: n.what_changes, audioDescription: n.audio_description, issue: issueOf(n.issue_id), live: n.is_live, utility: n.utility ?? undefined, caseStage: n.case_stage ?? undefined, caseUnlinked: n.case_unlinked || undefined,
        transcript: (tlBy.get(n.id) ?? []).map((l: Row) => ({ t: l.t_sec, speaker: l.speaker, text: l.text })),
      });
    } else {
      if (!mod && isHidden(`article:${n.id}`)) continue;
      articles.push({
        id: n.id, kind: n.kind, title: n.title, lead: n.summary, body: String(n.body).split(/\n\s*\n/).filter(Boolean), bairroIds, topic: n.topic_id,
        authorId: n.author_id ?? undefined, authorName: n.author_name ?? undefined, sourceId: n.source_id ?? undefined, url: n.url ?? undefined,
        imageUrl: n.image_url ?? undefined, publishedAt: ms(n.published_at), issue: issueOf(n.issue_id), originRelatoId: n.origin_relato_id ?? undefined,
        locationScope: n.location_scope ?? undefined, locationCity: n.location_city ?? undefined, utility: n.utility ?? undefined, caseStage: n.case_stage ?? undefined, caseUnlinked: n.case_unlinked || undefined,
        estimated: (nbBy.get(n.id) ?? []).filter((x: Row) => x.method === 'referencia' || x.method === 'previsto')
          .map((x: Row) => ({ bairroId: x.bairro_id, how: x.method, confidence: x.confidence ?? 0, reason: x.matched_text ?? '' })),
      });
    }
  }

  const followBy = group(follows, (r: Row) => r.user_id);
  const users = usersRows.map((r: Row) => toUser(r, (followBy.get(r.id) ?? []).map((f: Row) => f.bairro_id), viewer && viewer.id === r.id ? viewer.saved : [], viewer?.id === r.id));

  const confBy = group(confRows, (r: Row) => r.relato_id);
  const histBy = group(histRows, (r: Row) => r.relato_id);
  const originBy = new Map(origins.map((o: Row) => [o.origin_relato_id, o.id]));
  const relatos = relRows.filter((r: Row) => mod || !isHidden(`relato:${r.id}`)).map((r: Row) => relatoFrom(
    r, confirmationIds(confBy.get(r.id) ?? []), (histBy.get(r.id) ?? []).map((x: Row) => ({ status: x.status, at: ms(x.at), by: x.by_user ?? undefined })), originBy.get(r.id),
  ));
  const relIssue = new Map(relRows.map((x: Row) => [x.id, x.issue_id as string | null]));
  for (const r of relatos) r.issue = issueOf(relIssue.get(r.id) ?? null);
  const visibleRelatos = relatos.filter((r) => !hiddenKeys.includes(`relato:${r.id}` as ContentKey));

  const contactRows = staff
    ? await q('select * from relato_contacts')
    : viewer ? await q('select c.* from relato_contacts c join relatos r on r.id = c.relato_id where r.author_id = $1', [viewer.id]) : [];
  const relatoContacts = Object.fromEntries(contactRows.map((c: Row) => [c.relato_id, { fullName: c.full_name, age: c.age, phone: c.phone, address: c.address, acceptsContact: c.accepts_contact }]));

  const reports = mod || viewer?.role === 'admin'
    ? (await q('select * from reports order by created_at desc')).map((r: Row) => ({ id: r.id, target: `${r.target_type}:${r.target_id}` as ContentKey, reason: r.reason, detail: r.detail, reporterId: r.reporter_id ?? undefined, createdAt: ms(r.created_at), status: r.status }))
    : [];
  const notifications = viewer
    ? (await q('select * from notifications where user_id = $1 order by created_at desc limit 200', [viewer.id])).map((n: Row) => ({ id: n.id, userId: n.user_id, kind: n.kind, title: n.title, body: n.body, href: n.href, createdAt: ms(n.created_at), read: n.read }))
    : [];

  return {
    meId: viewer?.id ?? null,
    meta: { seededAt: meta, tts: !!process.env.TTS_URL, demoMode: DEMO_MODE, ai: aiEnabled() },
    cities: cities.map((c: Row) => ({ id: c.id, name: c.name, state: c.state, lat: c.lat, lng: c.lng, zoom: c.zoom })),
    bairros, streets: streets.map((s: Row) => ({ name: s.name, bairroId: s.bairro_id })), users,
    programs: sources.map((s: Row) => ({ id: s.id, name: s.name, short: s.short, schedule: s.schedule, kind: s.kind, active: s.active })),
    segments, articles, relatos, relatoContacts,
    comments: comRows.filter((c: Row) => mod || !isHidden(`comment:${c.id}`)).map((c: Row) => ({
      id: c.id, target: `${c.target_type}:${c.target_id}` as ContentKey, parentId: c.parent_id ?? undefined, authorId: c.author_id ?? undefined,
      guest: c.guest_name ? { fullName: c.guest_name, age: c.guest_age } : undefined, text: c.text, createdAt: ms(c.created_at),
    })),
    alerts: alertRows.map((a: Row) => ({ id: a.id, bairroId: a.bairro_id, type: a.type, title: a.title, detail: a.detail, severity: a.severity, createdAt: ms(a.created_at), source: a.source_label, active: a.active })),
    reports, notifications,
    lockedThreads: locked.map((l: Row) => `${l.target_type}:${l.target_id}` as ContentKey),
    hiddenContent: mod ? hiddenKeys : [],
    live,
    relatoGroups: clusterRelatos(visibleRelatos.filter((r) => r.status !== 'falso'), bairros),
    cases: buildCases(segments.filter((x) => !isHidden(`segment:${x.id}`)), articles.filter((x) => !isHidden(`article:${x.id}`)), visibleRelatos, bairros),
  };
}
