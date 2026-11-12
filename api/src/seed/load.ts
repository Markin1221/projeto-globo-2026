// Carrega os dados de exemplo no banco. Os ids do seed ("m1", "marina") viram UUIDs determinísticos.
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { TOPIC_LABEL } from '../../../shared/domain/rules';
import type { ContentKey } from '../../../shared/domain/types';
import { createSeed } from './index';
import { seedAgenda } from './agenda';

export function sid(key: string) {
  const h = createHash('md5').update(`bairro-em-pauta:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const PREFIX = { segment: 'seg', article: 'art', relato: 'rel', comment: 'com' } as const;
const userId = (id: string) => sid(`user:${id}`);
const key = (k: ContentKey) => { const [t, id] = k.split(':') as [keyof typeof PREFIX, string]; return { type: t, id: sid(`${PREFIX[t]}:${id}`) }; };
const href = (h: string) => h
  .replace(/^\/materia\/(\w+)$/, (_, id) => `/materia/${sid(`art:${id}`)}`)
  .replace(/^\/trecho\/(\w+)$/, (_, id) => `/trecho/${sid(`seg:${id}`)}`)
  .replace(/^\/relatos\/(\w+)$/, (_, id) => `/relatos/${sid(`rel:${id}`)}`);
const d = (ms: number) => new Date(ms);

export async function seedDatabase(c: PoolClient) {
  const S = createSeed();
  const run = (sql: string, params: unknown[]) => c.query(sql, params);

  for (const city of S.cities) await run('insert into cities (id, name, state, lat, lng, zoom) values ($1,$2,$3,$4,$5,$6)', [city.id, city.name, city.state, city.lat, city.lng, city.zoom]);
  for (const b of S.bairros) {
    await run('insert into bairros (id, city_id, name, region, lat, lng) values ($1,$2,$3,$4,$5,$6)', [b.id, b.cityId, b.name, b.region, b.lat, b.lng]);
    for (const a of b.aliases) await run('insert into bairro_aliases (bairro_id, alias) values ($1,$2)', [b.id, a]);
  }
  for (const b of S.bairros) for (const o of b.confusableWith) await run('insert into bairro_confusions (bairro_id, other_id) values ($1,$2) on conflict do nothing', [b.id, o]);
  for (const s of S.streets) await run('insert into streets (bairro_id, name) values ($1,$2)', [s.bairroId, s.name]);
  for (const [id, label] of Object.entries(TOPIC_LABEL)) await run('insert into topics (id, label) values ($1,$2)', [id, label]);

  const issues = new Map<string, string>();
  for (const x of [...S.segments, ...S.articles]) if (x.issue) issues.set(x.issue.key, x.issue.label);
  for (const [id, label] of issues) await run('insert into issues (id, label) values ($1,$2)', [id, label]);

  const t0 = Date.now() - 60000;
  for (const [i, p] of S.programs.entries()) {
    await run('insert into sources (id, name, short, kind, schedule, base_url, created_at) values ($1,$2,$3,$4,$5,$6,$7)', [p.id, p.name, p.short, p.kind, p.schedule, p.baseUrl ?? null, d(t0 + i)]);
  }

  for (const u of S.users) {
    await run('insert into users (id, name, handle, role, bio, home_bairro_id, hue) values ($1,$2,$3,$4,$5,$6,$7)', [userId(u.id), u.name, u.handle, u.role, u.bio, u.bairroId ?? null, u.hue]);
    for (const b of u.followed) await run('insert into user_follows (user_id, bairro_id) values ($1,$2)', [userId(u.id), b]);
  }

  for (const s of S.segments) {
    const id = sid(`seg:${s.id}`);
    await run(`insert into news_items (id, kind, source_id, title, summary, topic_id, published_at, duration_sec, what_changes, audio_description, issue_id)
      values ($1,'trecho',$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, s.programId, s.title, s.summary, s.topic, d(s.airedAt), s.durationSec, s.whatChanges, s.audioDescription, s.issue?.key ?? null]);
    for (const b of s.bairroIds) await run('insert into news_item_bairros (news_item_id, bairro_id) values ($1,$2)', [id, b]);
    for (const l of s.transcript) await run('insert into transcript_lines (news_item_id, t_sec, speaker, text) values ($1,$2,$3,$4)', [id, l.t, l.speaker, l.text]);
  }

  for (const r of S.relatos) {
    const id = sid(`rel:${r.id}`);
    await run(`insert into relatos (id, title, category, description, media_type, media_name, bairro_id, street, reference, occurred_at, created_at, author_id, status, assignee_id, newsroom_note)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, r.title, r.category, r.description, r.media?.type ?? null, r.media?.name ?? null, r.bairroId, r.street, r.reference, d(r.occurredAt), d(r.createdAt), userId(r.authorId), r.status, r.assigneeId ? userId(r.assigneeId) : null, r.newsroomNote ?? null]);
    const ct = S.relatoContacts[r.id];
    if (ct) await run('insert into relato_contacts (relato_id, full_name, age, phone, address, accepts_contact) values ($1,$2,$3,$4,$5,$6)', [id, ct.fullName, ct.age, ct.phone, ct.address, ct.acceptsContact]);
    for (let i = 0; i < r.confirmations.length; i++) await run('insert into relato_confirmations (relato_id, created_at) values ($1,$2)', [id, d(r.createdAt + (i + 1) * 6e5)]);
    for (const h of r.history) await run('insert into relato_status_history (relato_id, status, at, by_user) values ($1,$2,$3,$4)', [id, h.status, d(h.at), h.by ? userId(h.by) : null]);
  }

  for (const a of S.articles) {
    const id = sid(`art:${a.id}`);
    await run(`insert into news_items (id, kind, source_id, title, summary, body, topic_id, author_id, published_at, issue_id, origin_relato_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, a.kind, a.sourceId ?? null, a.title, a.lead, a.body.join('\n\n'), a.topic, a.authorId ? userId(a.authorId) : null, d(a.publishedAt), a.issue?.key ?? null, a.originRelatoId ? sid(`rel:${a.originRelatoId}`) : null]);
    for (const b of a.bairroIds) await run('insert into news_item_bairros (news_item_id, bairro_id) values ($1,$2)', [id, b]);
  }

  for (const cm of S.comments) {
    const t = key(cm.target);
    await run('insert into comments (id, target_type, target_id, parent_id, author_id, guest_name, guest_age, text, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [sid(`com:${cm.id}`), t.type, t.id, cm.parentId ? sid(`com:${cm.parentId}`) : null, cm.authorId ? userId(cm.authorId) : null, cm.guest?.fullName ?? null, cm.guest?.age ?? null, cm.text, d(cm.createdAt)]);
  }
  for (const a of S.alerts) {
    await run('insert into alerts (bairro_id, type, title, detail, severity, source_label, created_at) values ($1,$2,$3,$4,$5,$6,$7)', [a.bairroId, a.type, a.title, a.detail, a.severity, a.source, d(a.createdAt)]);
  }
  for (const r of S.reports) {
    const t = key(r.target);
    await run('insert into reports (target_type, target_id, reason, detail, reporter_id, created_at) values ($1,$2,$3,$4,$5,$6)', [t.type, t.id, r.reason, r.detail, r.reporterId ? userId(r.reporterId) : null, d(r.createdAt)]);
  }
  for (const n of S.notifications) {
    await run('insert into notifications (user_id, kind, title, body, href, read, created_at) values ($1,$2,$3,$4,$5,$6,$7)', [userId(n.userId), n.kind, n.title, n.body, href(n.href), n.read, d(n.createdAt)]);
  }
  for (const k of S.lockedThreads) { const t = key(k); await run('insert into locked_threads (target_type, target_id) values ($1,$2)', [t.type, t.id]); }
  await run("insert into app_meta (key, value) values ('seeded_at', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(Date.now())]);
  await seedAgenda(c);
}
