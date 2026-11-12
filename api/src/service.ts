// Casos de uso. Toda escrita passa por aqui e aplica as regras de shared/domain/rules.ts.
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';
import * as R from '../../shared/domain/rules';
import type { Article, ContentKey, LiveState, Program, RelatoDraft, Role, Topic, User } from '../../shared/domain/types';
import { q, tx, type Conn } from './db';
import { DEMO_MODE, GUEST, loadBairros, loadRelato, snapshot, UUID } from './repo';
import { LIVE_SCRIPTS } from './seed/segments';
import { retrainSoon } from './ml/models';

export const bad = (m: string) => new BadRequestException(m);
const pass = (v: R.Verdict) => { if (!v.ok) throw bad(v.reason); };
const who = (v: User | null) => v ?? GUEST;
const slug = (s: string) => R.normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Avisa os navegadores conectados (SSE) que algo mudou. */
export const changes$ = new Subject<string>();
export const emit = () => changes$.next('change');

type Target = { type: 'segment' | 'article' | 'relato' | 'comment'; id: string };
export function parseKey(key: string, allowed: Target['type'][] = ['segment', 'article', 'relato', 'comment']): Target {
  const [type, id] = String(key ?? '').split(':') as [Target['type'], string];
  if (!allowed.includes(type) || !UUID.test(id ?? '')) throw bad('Conteúdo inválido.');
  return { type, id };
}
async function targetExists(t: Target, c?: Conn) {
  const table = t.type === 'relato' ? 'relatos' : t.type === 'comment' ? 'comments' : 'news_items';
  const extra = t.type === 'segment' ? " and kind = 'trecho'" : t.type === 'article' ? " and kind <> 'trecho'" : '';
  const [r] = await q(`select 1 from ${table} where id = $1${extra}`, [t.id], c);
  if (!r) throw new NotFoundException('Conteúdo não encontrado.');
}

interface NotifyInput { kind: string; title: string; body: string; href: string }
async function notify(c: Conn, userIds: Iterable<string | null | undefined>, n: NotifyInput) {
  const ids = [...new Set([...userIds].filter((x): x is string => !!x && UUID.test(x)))];
  if (!ids.length) return;
  await q(`insert into notifications (user_id, kind, title, body, href)
    select u.id, $2, $3, $4, $5 from users u where u.id = any($1) and u.deleted_at is null`, [ids, n.kind, n.title, n.body, n.href], c);
}
const followers = async (bairroId: string, c?: Conn) =>
  (await q<{ user_id: string }>('select f.user_id from user_follows f join users u on u.id = f.user_id where f.bairro_id = $1 and u.deleted_at is null', [bairroId], c)).map((r) => r.user_id);
const usersWithRole = async (role: string, c?: Conn) => (await q<{ id: string }>('select id from users where role = $1 and deleted_at is null', [role], c)).map((r) => r.id);
async function bairroName(id: string, c?: Conn) {
  const [b] = await q<{ name: string }>('select name from bairros where id = $1', [id], c);
  if (!b) throw bad('Bairro não encontrado.');
  return b.name;
}

function need(cond: boolean, msg: string): asserts cond { if (!cond) throw new ForbiddenException(msg); }
const signedIn = (v: User | null, msg = 'Entre como morador para fazer isso.'): User => { need(!!v, msg); return v!; };

// --- Usuário ---------------------------------------------------------------------------------
export async function follow(v: User | null, bairroId: string) {
  const u = signedIn(v, 'Entre como morador para seguir bairros.');
  const [b] = await q('select 1 from bairros where id = $1 and active', [bairroId]);
  if (!b) throw bad('Bairro não encontrado.');
  await q('insert into user_follows (user_id, bairro_id) values ($1,$2) on conflict do nothing', [u.id, bairroId]);
  emit();
}
export async function unfollow(v: User | null, bairroId: string) {
  const u = signedIn(v);
  await q('delete from user_follows where user_id = $1 and bairro_id = $2', [u.id, bairroId]);
  emit();
}
export async function toggleSave(v: User | null, key: string) {
  const u = signedIn(v, 'Entre como morador para salvar.');
  const t = parseKey(key, ['segment', 'article', 'relato']);
  await targetExists(t);
  const del = await q('delete from user_saves where user_id = $1 and target_type = $2 and target_id = $3 returning 1', [u.id, t.type, t.id]);
  if (!del.length) await q('insert into user_saves (user_id, target_type, target_id) values ($1,$2,$3)', [u.id, t.type, t.id]);
  emit();
  return { saved: !del.length };
}
export async function setLocation(v: User | null, allowed: boolean, label?: string) {
  const u = signedIn(v);
  await q('update users set location_allowed = $2, location_label = $3 where id = $1', [u.id, !!allowed, allowed ? String(label ?? '').slice(0, 120) : null]);
  emit();
}
export async function deleteAccount(v: User | null) {
  const u = signedIn(v, 'Visitantes não têm conta para apagar.');
  await tx(async (c) => {
    await q(`update users set name = 'Conta removida', handle = 'removida-' || left(id::text, 8), bio = '', home_bairro_id = null,
      location_allowed = false, location_label = null, deleted_at = now() where id = $1`, [u.id], c);
    await q('delete from user_follows where user_id = $1', [u.id], c);
    await q('delete from user_saves where user_id = $1', [u.id], c);
    await q('delete from notifications where user_id = $1', [u.id], c);
    await q('delete from relato_contacts where relato_id in (select id from relatos where author_id = $1)', [u.id], c);
  });
  emit();
}

// --- Relatos ---------------------------------------------------------------------------------
export async function createRelato(v: User | null, d: RelatoDraft) {
  const u = who(v);
  pass(R.canPublishRelato(u));
  const errors = R.validateRelato(d);
  if (Object.keys(errors).length) throw bad(`Confira os campos: ${Object.values(errors)[0]}`);
  if (!(d.category in R.TOPIC_LABEL)) throw bad('Categoria inválida.');
  const name = await bairroName(d.bairroId);
  const id = await tx(async (c) => {
    const [r] = await q<{ id: string }>(`insert into relatos (title, category, description, media_type, media_name, bairro_id, street, reference, pin_lat, pin_lng, occurred_at, author_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [d.title.trim(), d.category, d.description.trim(), d.media?.type ?? null, d.media?.name?.slice(0, 120) ?? null, d.bairroId, d.street.trim(), d.reference.trim(),
      d.pin?.lat ?? null, d.pin?.lng ?? null, new Date(d.occurredAt), u.id], c);
    await q('insert into relato_contacts (relato_id, full_name, age, phone, address, accepts_contact) values ($1,$2,$3,$4,$5,$6)',
      [r.id, d.fullName.trim(), Number(d.age), d.phone.trim(), d.address.trim(), !!d.acceptsContact], c);
    await q("insert into relato_status_history (relato_id, status, by_user) values ($1, 'enviado', $2)", [r.id, u.id], c);
    await notify(c, await usersWithRole('jornalista', c), { kind: 'relato', title: `Novo relato em ${name}`, body: d.title.trim(), href: `/relatos/${r.id}` });
    return r.id;
  });
  emit();
  return { id };
}

async function relatoOr404(id: string) {
  const r = await loadRelato(id);
  if (!r) throw new NotFoundException('Relato não encontrado.');
  return r;
}

export async function confirmRelato(v: User | null, id: string) {
  const r = await relatoOr404(id);
  const u = who(v);
  pass(R.canConfirm(u, r));
  try { await q('insert into relato_confirmations (relato_id, user_id) values ($1,$2)', [id, u.id]); } catch { throw bad('Você já disse que viu isso. Cada pessoa confirma uma vez.'); }
  emit();
}

export async function assumeRelato(v: User | null, id: string) {
  const r = await relatoOr404(id);
  const u = who(v);
  pass(R.canAssume(u, r));
  await tx(async (c) => {
    const upd = await q("update relatos set status = 'apuracao', assignee_id = $2 where id = $1 and status = 'enviado' returning id", [id, u.id], c);
    if (!upd.length) throw bad('Outro jornalista assumiu este relato agora há pouco.');
    await q("insert into relato_status_history (relato_id, status, by_user) values ($1, 'apuracao', $2)", [id, u.id], c);
    await notify(c, [r.authorId], { kind: 'redacao', title: 'Seu relato está em apuração', body: r.title, href: `/relatos/${id}` });
  });
  emit();
}

/** Só um jornalista humano decide. Nenhuma automação chama esta função. */
export async function decideRelato(v: User | null, id: string, verdict: 'confirmado' | 'falso', note: string) {
  const r = await relatoOr404(id);
  const u = who(v);
  pass(R.canDecide(u, r));
  if (verdict !== 'confirmado' && verdict !== 'falso') throw bad('Decisão inválida.');
  if (String(note ?? '').trim().length < 15) throw bad('Escreva a nota da redação com pelo menos 15 letras.');
  const name = await bairroName(r.bairroId);
  const articleId = await tx(async (c) => {
    await q('update relatos set status = $2, newsroom_note = $3 where id = $1', [id, verdict, note.trim()], c);
    await q('insert into relato_status_history (relato_id, status, by_user) values ($1,$2,$3)', [id, verdict, u.id], c);
    if (verdict === 'falso') {
      await notify(c, [r.authorId], { kind: 'redacao', title: 'Seu relato não foi confirmado', body: `${r.title}. Leia a explicação da redação.`, href: `/relatos/${id}` });
      return null;
    }
    const [a] = await q<{ id: string }>(`insert into news_items (kind, title, summary, body, topic_id, author_id, published_at, origin_relato_id)
      values ('post', $1, $2, $3, $4, $5, now(), $6) returning id`,
    [`${r.title}, confirma a redação`, note.trim(), `${r.description}\n\nLocal: ${r.street}, ${name}. Referência: ${r.reference}.`, r.category, u.id, id], c);
    await q("insert into news_item_bairros (news_item_id, bairro_id, method) values ($1,$2,'manual')", [a.id, r.bairroId], c);
    const fs = await followers(r.bairroId, c);
    await notify(c, [...fs, r.authorId, ...r.confirmations].filter((x) => x !== u.id), {
      kind: 'redacao', title: `Redação confirmou um relato em ${name}`, body: `${r.title}, confirma a redação`, href: `/materia/${a.id}`,
    });
    return a.id;
  });
  emit();
  retrainSoon();
  return { articleId };
}

/** Só para a demonstração: vizinhos fictícios confirmam o relato. */
export async function simulateNeighbors(id: string, count: number) {
  if (!DEMO_MODE) throw new ForbiddenException('Disponível só no modo demonstração.');
  const r = await relatoOr404(id);
  if (r.status === 'falso' || r.status === 'confirmado') throw bad('A apuração deste relato já foi concluída.');
  const n = Math.min(Math.max(1, Number(count) || 1), 20);
  const real = (await q<{ id: string }>(`select id from users where role = 'morador' and not blocked and deleted_at is null and id <> $1
    and id not in (select user_id from relato_confirmations where relato_id = $2 and user_id is not null) limit $3`, [r.authorId, id, n])).map((x) => x.id);
  await q('insert into relato_confirmations (relato_id, user_id) select $1, unnest($2::uuid[])', [id, real]);
  for (let i = real.length; i < n; i++) await q('insert into relato_confirmations (relato_id) values ($1)', [id]);
  emit();
  return { added: n };
}

// --- Comunidade ------------------------------------------------------------------------------
export async function addComment(v: User | null, input: { target: ContentKey; parentId?: string; text: string; guest?: { fullName: string; age: string } }) {
  const u = who(v);
  if (u.blocked) throw bad('Esta conta está bloqueada e não pode comentar.');
  const t = parseKey(input.target, ['segment', 'article', 'relato']);
  await targetExists(t);
  const [lk] = await q('select 1 from locked_threads where target_type = $1 and target_id = $2', [t.type, t.id]);
  if (lk) throw bad('Esta thread foi encerrada e não aceita respostas.');
  const text = String(input.text ?? '').trim();
  if (!text) throw bad('Escreva seu comentário.');
  if (text.length > 2000) throw bad('O comentário pode ter até 2.000 caracteres.');
  if (R.isGuest(u)) {
    const errors = R.validateGuest(input.guest?.fullName ?? '', input.guest?.age ?? '');
    if (Object.keys(errors).length) throw bad(Object.values(errors)[0]);
  }
  let parentAuthor: string | null = null;
  if (input.parentId) {
    if (!UUID.test(input.parentId)) throw bad('Comentário inválido.');
    const [p] = await q('select author_id, target_type, target_id from comments where id = $1', [input.parentId]);
    if (!p || p.target_type !== t.type || p.target_id !== t.id) throw bad('Comentário respondido não encontrado.');
    parentAuthor = p.author_id;
  }
  await tx(async (c) => {
    await q('insert into comments (target_type, target_id, parent_id, author_id, guest_name, guest_age, text) values ($1,$2,$3,$4,$5,$6,$7)',
      [t.type, t.id, input.parentId ?? null, R.isGuest(u) ? null : u.id, R.isGuest(u) ? input.guest!.fullName.trim() : null, R.isGuest(u) ? Number(input.guest!.age) : null, text], c);
    if (parentAuthor && parentAuthor !== u.id) {
      const path = t.type === 'segment' ? 'trecho' : t.type === 'article' ? 'materia' : 'relatos';
      await notify(c, [parentAuthor], { kind: 'comentario', title: `${R.isGuest(u) ? input.guest!.fullName.trim() : u.name} respondeu você`, body: text.slice(0, 140), href: `/${path}/${t.id}` });
    }
  });
  emit();
}

export async function createReport(v: User | null, input: { target: string; reason: string; detail?: string }) {
  if (!String(input.reason ?? '').trim()) throw bad('Escolha um motivo.');
  const t = parseKey(input.target);
  await targetExists(t);
  await tx(async (c) => {
    await q('insert into reports (target_type, target_id, reason, detail, reporter_id) values ($1,$2,$3,$4,$5)', [t.type, t.id, input.reason.slice(0, 80), String(input.detail ?? '').slice(0, 1000), v?.id ?? null], c);
    await notify(c, await usersWithRole('moderador', c), { kind: 'sistema', title: 'Nova denúncia para tratar', body: input.reason, href: '/moderacao' });
  });
  emit();
}

export async function publishOfficial(v: User | null, input: { title: string; lead: string; bairroId: string; topic: Topic }) {
  const u = who(v);
  need(R.canAudit(u), 'Só jornalistas publicam posts oficiais.');
  if (String(input.title ?? '').trim().length < 8 || String(input.lead ?? '').trim().length < 15) throw bad('Preencha título e texto do post.');
  if (!(input.topic in R.TOPIC_LABEL)) throw bad('Tema inválido.');
  const name = await bairroName(input.bairroId);
  const id = await tx(async (c) => {
    const [a] = await q<{ id: string }>("insert into news_items (kind, title, summary, topic_id, author_id, published_at) values ('post',$1,$2,$3,$4,now()) returning id",
      [input.title.trim(), input.lead.trim(), input.topic, u.id], c);
    await q("insert into news_item_bairros (news_item_id, bairro_id, method) values ($1,$2,'manual')", [a.id, input.bairroId], c);
    await notify(c, (await followers(input.bairroId, c)).filter((x) => x !== u.id), { kind: 'redacao', title: `Novo post oficial em ${name}`, body: input.title.trim(), href: `/materia/${a.id}` });
    return a.id;
  });
  emit();
  return { id };
}

// --- Moderação -------------------------------------------------------------------------------
const mod = (v: User | null) => need(!!v && R.canModerate(v), 'Só moderadores fazem esta ação.');
export async function resolveReport(v: User | null, id: string, status: 'procedente' | 'improcedente') {
  mod(v);
  if (!UUID.test(id) || !['procedente', 'improcedente'].includes(status)) throw bad('Denúncia inválida.');
  await q('update reports set status = $2 where id = $1', [id, status]);
  emit();
}
export async function setHidden(v: User | null, key: string, hidden: boolean) {
  mod(v);
  const t = parseKey(key);
  if (hidden) await q('insert into hidden_content (target_type, target_id, hidden_by) values ($1,$2,$3) on conflict do nothing', [t.type, t.id, v!.id]);
  else await q('delete from hidden_content where target_type = $1 and target_id = $2', [t.type, t.id]);
  emit();
}
export async function setLocked(v: User | null, key: string, locked: boolean) {
  mod(v);
  const t = parseKey(key, ['segment', 'article', 'relato']);
  if (locked) await q('insert into locked_threads (target_type, target_id, locked_by) values ($1,$2,$3) on conflict do nothing', [t.type, t.id, v!.id]);
  else await q('delete from locked_threads where target_type = $1 and target_id = $2', [t.type, t.id]);
  emit();
}
export async function setBlocked(v: User | null, userId: string, blocked: boolean) {
  mod(v);
  const [t] = UUID.test(userId) ? await q('select role from users where id = $1', [userId]) : [];
  if (!t) throw new NotFoundException('Usuário não encontrado.');
  if (t.role !== 'morador') throw bad('Só contas de moradores podem ser bloqueadas.');
  await tx(async (c) => {
    await q('update users set blocked = $2 where id = $1', [userId, !!blocked], c);
    await notify(c, [userId], { kind: 'sistema', title: blocked ? 'Sua conta foi bloqueada' : 'Sua conta foi desbloqueada', body: blocked ? 'Motivo: publicação recorrente de informação falsa.' : 'Você pode voltar a participar.', href: '/configuracoes' });
  });
  emit();
}

// --- Administração ---------------------------------------------------------------------------
const admin = (v: User | null) => need(!!v && R.canAdmin(v), 'Só administradores fazem esta ação.');
export async function setRole(v: User | null, userId: string, role: Role) {
  admin(v);
  if (userId === v!.id) throw bad('Você não pode mudar o próprio papel.');
  if (!['morador', 'jornalista', 'moderador', 'admin'].includes(role)) throw bad('Papel inválido.');
  await q('update users set role = $2 where id = $1 and deleted_at is null', [userId, role]);
  emit();
}
export async function addSource(v: User | null, input: Pick<Program, 'name' | 'short' | 'schedule' | 'kind'> & { baseUrl?: string }) {
  admin(v);
  const name = String(input.name ?? '').trim();
  if (name.length < 2) throw bad('Informe o nome do programa.');
  if (!['telejornal', 'esporte', 'comunitario', 'portal'].includes(input.kind)) throw bad('Tipo inválido.');
  const [dup] = await q('select 1 from sources where lower(name) = lower($1)', [name]);
  if (dup) throw bad('Já existe um programa com esse nome.');
  let id = slug(name) || 'fonte';
  const [taken] = await q('select 1 from sources where id = $1', [id]);
  if (taken) id = `${id}-${Date.now().toString(36)}`;
  await q('insert into sources (id, name, short, kind, schedule, base_url) values ($1,$2,$3,$4,$5,$6)',
    [id, name, (String(input.short ?? '').trim() || name.slice(0, 3)).toUpperCase().slice(0, 6), input.kind, String(input.schedule ?? '').trim() || 'A definir', input.baseUrl || null]);
  emit();
}
export async function setSourceActive(v: User | null, id: string, active: boolean) {
  admin(v);
  await q('update sources set active = $2 where id = $1', [id, !!active]);
  emit();
}
export async function addBairro(v: User | null, input: { name: string; region: string; cityId: string; lat?: number; lng?: number }) {
  admin(v);
  const name = String(input.name ?? '').trim();
  if (name.length < 2) throw bad('Informe o nome do bairro.');
  const [city] = await q('select * from cities where id = $1', [input.cityId]);
  if (!city) throw bad('Cidade inválida.');
  const [dup] = await q('select 1 from bairros where city_id = $1 and lower(name) = lower($2)', [city.id, name]);
  if (dup) throw bad('Esse bairro já existe nesta cidade.');
  let id = city.id === 'recife' ? slug(name) : `${city.id}-${slug(name)}`;
  const [taken] = await q('select 1 from bairros where id = $1', [id]);
  if (taken) id = `${city.id}-${slug(name)}-${Date.now().toString(36)}`;
  const lat = Number.isFinite(Number(input.lat)) && input.lat ? Number(input.lat) : city.lat;
  const lng = Number.isFinite(Number(input.lng)) && input.lng ? Number(input.lng) : city.lng;
  await q('insert into bairros (id, city_id, name, region, lat, lng) values ($1,$2,$3,$4,$5,$6)', [id, city.id, name, String(input.region ?? ''), lat, lng]);
  emit();
}
export async function setBairroActive(v: User | null, id: string, active: boolean) {
  admin(v);
  await q('update bairros set active = $2 where id = $1', [id, !!active]);
  emit();
}

export async function markRead(v: User | null, id?: string) {
  const u = signedIn(v);
  if (id && UUID.test(id)) await q('update notifications set read = true where user_id = $1 and id = $2', [u.id, id]);
  else await q('update notifications set read = true where user_id = $1', [u.id]);
  emit();
}

// --- Telejornal ao vivo (simulado) -----------------------------------------------------------
// No produto real, as linhas chegam do worker de transcrição (Whisper) e passam pela mesma detecção.
let live: LiveState | null = null;
let liveTimer: NodeJS.Timeout | null = null;
let scriptIndex = 0;
export const liveState = () => live;

export async function startLive(v: User | null) {
  if (!DEMO_MODE) throw new ForbiddenException('Disponível só no modo demonstração.');
  if (live && !live.finished) throw bad('Já há um telejornal simulado no ar.');
  const u = who(v);
  const bairroId = u.followed.includes('casa-amarela') ? 'casa-amarela' : u.followed[0] ?? 'casa-amarela';
  const name = await bairroName(bairroId);
  const script = LIVE_SCRIPTS[scriptIndex++ % LIVE_SCRIPTS.length];
  const fill = (s: string) => s.replaceAll('{B}', name);
  const lines = script.lines.map(([speaker, text], i) => ({ t: i * 14, speaker, text: fill(text) }));
  const programId = 'ne2';
  const segmentId = await tx(async (c) => {
    const [s] = await q<{ id: string }>(`insert into news_items (kind, source_id, title, summary, topic_id, published_at, duration_sec, what_changes, audio_description, is_live)
      values ('trecho', $1, $2, $3, $4, now(), $5, $6, $7, true) returning id`,
    [programId, fill(script.title), fill(script.summary), script.topic, lines.length * 14 + 10, script.whatChanges.map(fill),
      ['Repórter ao vivo em uma rua alagada, com água na altura da calçada.', 'Carros passam devagar com o pisca-alerta ligado.']], c);
    await q('insert into news_item_bairros (news_item_id, bairro_id) values ($1,$2)', [s.id, bairroId], c);
    await q('insert into transcript_lines (news_item_id, t_sec, speaker, text) values ($1,$2,$3,$4)', [s.id, lines[0].t, lines[0].speaker, lines[0].text], c);
    return s.id;
  });
  live = { programId, bairroId, segmentId, lines, shown: 1, detectedAt: 0, finished: false };
  emit();
  const bairros = await loadBairros();
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = setInterval(() => { advance(bairros).catch((e) => console.error('ao vivo:', e)); }, Number(process.env.LIVE_TICK_MS ?? 1300));
  return { segmentId };
}

async function advance(bairros: Awaited<ReturnType<typeof loadBairros>>) {
  const l = live;
  if (!l || l.finished) return;
  const line = l.lines[l.shown];
  l.shown += 1;
  await q('insert into transcript_lines (news_item_id, t_sec, speaker, text) values ($1,$2,$3,$4)', [l.segmentId, line.t, line.speaker, line.text]);
  const hit = R.detectBairros(line.text, bairros).some((d) => d.bairroId === l.bairroId && d.kind === 'bairro');
  if (hit && !l.detectedAt) {
    l.detectedAt = Date.now();
    const [s] = await q('select title from news_items where id = $1', [l.segmentId]);
    const name = bairros.find((b) => b.id === l.bairroId)?.name ?? '';
    await q(`insert into notifications (user_id, kind, title, body, href)
      select f.user_id, 'ao-vivo', $2, $3, $4 from user_follows f join users u on u.id = f.user_id where f.bairro_id = $1 and u.deleted_at is null`,
    [l.bairroId, `${name} está no ar agora`, `NE2: ${s?.title ?? ''}`, `/trecho/${l.segmentId}`]);
  }
  if (l.shown >= l.lines.length) {
    l.finished = true;
    l.finishedAt = Date.now();
    await q('update news_items set is_live = false where id = $1', [l.segmentId]);
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  }
  emit();
}

export function resetLive() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = null;
  live = null;
}

export type { Article };

// ---------- Casos (acompanhamento de um problema) ----------
type CaseKind = 'segment' | 'article' | 'relato';
const STAGES = ['problema', 'andamento', 'resolvido'] as const;
function caseEditor(v: User | null) {
  const u = who(v);
  if (!R.canEditCases(u)) throw new ForbiddenException('Só jornalistas e administradores editam casos.');
  return u;
}
function caseItem(kind: string, id: string) {
  if (!['segment', 'article', 'relato'].includes(kind) || !UUID.test(id ?? '')) throw bad('Item inválido.');
  return { table: kind === 'relato' ? 'relatos' : 'news_items', id };
}
async function findCase(v: User, caseId: string) {
  const c = (await snapshot(v, null)).cases.find((x) => x.id === caseId);
  if (!c) throw new NotFoundException('Caso não encontrado. Ele pode ter mudado com notícias novas: recarregue a página.');
  return c;
}

/** Confirma um caso automático (vira chave fixa) ou renomeia um confirmado. Devolve a chave. */
export async function confirmCase(v: User | null, caseId: string, label?: string) {
  const u = caseEditor(v);
  const c = await findCase(u, String(caseId ?? ''));
  const name = String(label ?? '').trim().slice(0, 120) || c.title;
  if (c.confirmed) {
    await q('update issues set label = $2 where id = $1', [c.id, name]);
    emit();
    return { key: c.id };
  }
  const key = `${slug(name).slice(0, 60) || 'caso'}-${Date.now().toString(36)}`;
  await tx(async (t) => {
    await q('insert into issues (id, label, created_by) values ($1, $2, $3)', [key, name, u.id], t);
    const news = c.items.filter((i) => i.kind !== 'relato').map((i) => i.id);
    const rel = c.items.filter((i) => i.kind === 'relato').map((i) => i.id);
    if (news.length) await q('update news_items set issue_id = $1, case_unlinked = false where id = any($2) and issue_id is null', [key, news], t);
    if (rel.length) await q('update relatos set issue_id = $1, case_unlinked = false where id = any($2) and issue_id is null', [key, rel], t);
  });
  emit();
  return { key };
}

/** Liga um item a um caso (confirmando o caso, se ainda for automático) ou tira o item do caso. */
export async function setCaseLink(v: User | null, b: { kind: CaseKind; id: string; caseId?: string | null }) {
  const u = caseEditor(v);
  const it = caseItem(b?.kind, b?.id);
  if (!b.caseId) {
    await q(`update ${it.table} set issue_id = null, case_unlinked = true where id = $1`, [it.id]);
  } else {
    const { key } = await confirmCase(u, b.caseId);
    await q(`update ${it.table} set issue_id = $2, case_unlinked = false where id = $1`, [it.id, key]);
  }
  emit();
  return { ok: true };
}

/** A redação corrige a etapa de um item. stage = null volta para a etapa detectada pelo texto. */
export async function setCaseStage(v: User | null, b: { kind: CaseKind; id: string; stage: (typeof STAGES)[number] | null }) {
  caseEditor(v);
  const it = caseItem(b?.kind, b?.id);
  if (b.stage !== null && !STAGES.includes(b.stage)) throw bad('Etapa inválida.');
  await q(`update ${it.table} set case_stage = $2 where id = $1`, [it.id, b.stage]);
  emit();
  return { ok: true };
}

// ---------- Agenda de reportagens ----------
const OUTLETS = ['g1', 'ne1', 'ne2'] as const;
export async function createAgenda(v: User | null, b: { title: string; note?: string; date: string; time?: string; outlet: string; bairroId?: string | null; cityId?: string }) {
  const u = caseEditor(v);
  const title = String(b?.title ?? '').trim();
  if (title.length < 3 || title.length > 140) throw bad('Escreva um título de 3 a 140 caracteres.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b?.date ?? ''))) throw bad('Escolha a data.');
  if (b.time && !/^\d{2}:\d{2}$/.test(b.time)) throw bad('Horário inválido.');
  if (!OUTLETS.includes(b.outlet as (typeof OUTLETS)[number])) throw bad('Escolha g1, NE1 ou NE2.');
  const note = String(b.note ?? '').trim().slice(0, 400) || null;
  let city = String(b.cityId ?? 'recife');
  if (b.bairroId) {
    const [row] = await q<{ city_id: string }>('select city_id from bairros where id = $1', [b.bairroId]);
    if (!row) throw bad('Bairro não encontrado.');
    city = row.city_id;
  }
  await q('insert into agenda (title, note, starts_on, at_time, outlet, city_id, bairro_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [title, note, b.date, b.time || null, b.outlet, city, b.bairroId || null, u.id]);
  emit();
  return { ok: true };
}

export async function deleteAgenda(v: User | null, id: string) {
  caseEditor(v);
  if (!UUID.test(id ?? '')) throw bad('Item inválido.');
  await q('delete from agenda where id = $1', [id]);
  emit();
  return { ok: true };
}
