import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Module, Param, Patch, Post, Put, Req, Res, Sse, type MessageEvent } from '@nestjs/common';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { interval, map, merge, type Observable } from 'rxjs';
import type { ContentKey, RelatoDraft, Role, Topic, User } from '../../shared/domain/types';
import { dropAll, migrate, q, tx } from './db';
import { ingestNews, ingestRuns, knownUrls, recomputeAll, type IngestBody } from './ingest';
import { trainAll } from './ml/models';
import { summarize, summarizeDay } from './ai';
import { canEditCases } from '../../shared/domain/rules';
import { applyLimits, cityLimits } from './limits';
import { withTriage } from './ml/triage-run';
import { DEMO_MODE, loadUser, snapshot, UUID } from './repo';
import { seedDatabase } from './seed/load';
import * as S from './service';
import { synthesize } from './tts';

const SECRET = process.env.JWT_SECRET ?? 'troque-este-segredo-em-producao';

async function viewer(req: Request): Promise<User | null> {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const { sub } = jwt.verify(h.slice(7), SECRET) as { sub: string };
    return await loadUser(sub);
  } catch { return null; }
}

export async function resetDatabase() {
  S.resetLive();
  await dropAll();
  await migrate();
  await tx((c) => seedDatabase(c));
  await applyLimits();
  await recomputeAll();
  await trainAll();
}

@Controller()
class AppController {
  @Get('health') health() { return { ok: true }; }
  /** Contornos oficiais de todos os bairros de uma cidade, para o mapa (inclusive os que o app ainda não acompanha). */
  @Get('limites/:cidade') limites(@Param('cidade') cidade: string, @Res({ passthrough: true }) res: Response) {
    const geo = cityLimits(cidade);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return geo ?? { type: 'FeatureCollection', features: [] };
  }

  @Get('snapshot') async snapshot(@Req() req: Request) { const v = await viewer(req); return withTriage(await snapshot(v, S.liveState()), v); }

  /** Avisos em tempo real: o navegador recarrega o snapshot quando recebe "change". */
  @Sse('events') events(): Observable<MessageEvent> {
    return merge(S.changes$.pipe(map(() => ({ data: 'change' }))), interval(25000).pipe(map(() => ({ data: 'ping' }))));
  }

  /** Login de demonstração: escolhe o perfil sem senha. Desligue com DEMO_MODE=false. */
  @Post('auth/demo') async demoLogin(@Body() b: { userId: string }) {
    if (!DEMO_MODE) throw new ForbiddenException('Login de demonstração desativado.');
    const u = await loadUser(String(b?.userId ?? ''));
    if (!u) throw S.bad('Perfil não encontrado.');
    return { token: jwt.sign({ sub: u.id }, SECRET, { expiresIn: '30d' }), userId: u.id };
  }

  @Post('me/follows') async follow(@Req() r: Request, @Body() b: { bairroId: string }) { await S.follow(await viewer(r), b?.bairroId); return { ok: true }; }
  @Delete('me/follows/:id') async unfollow(@Req() r: Request, @Param('id') id: string) { await S.unfollow(await viewer(r), id); return { ok: true }; }
  @Put('me/saved') async save(@Req() r: Request, @Body() b: { key: string }) { return S.toggleSave(await viewer(r), b?.key); }
  @Put('me/location') async location(@Req() r: Request, @Body() b: { allowed: boolean; label?: string }) { await S.setLocation(await viewer(r), b?.allowed, b?.label); return { ok: true }; }
  @Delete('me') async deleteMe(@Req() r: Request) { await S.deleteAccount(await viewer(r)); return { ok: true }; }
  @Post('notifications/read') async read(@Req() r: Request, @Body() b: { id?: string }) { await S.markRead(await viewer(r), b?.id); return { ok: true }; }

  @Post('relatos') async createRelato(@Req() r: Request, @Body() b: RelatoDraft) { return S.createRelato(await viewer(r), b ?? ({} as RelatoDraft)); }
  @Post('relatos/:id/confirmations') async confirm(@Req() r: Request, @Param('id') id: string) { await S.confirmRelato(await viewer(r), id); return { ok: true }; }
  @Post('relatos/:id/assume') async assume(@Req() r: Request, @Param('id') id: string) { await S.assumeRelato(await viewer(r), id); return { ok: true }; }
  @Post('relatos/:id/decision') async decide(@Req() r: Request, @Param('id') id: string, @Body() b: { verdict: 'confirmado' | 'falso'; note: string }) { return S.decideRelato(await viewer(r), id, b?.verdict, b?.note); }
  @Post('relatos/:id/simulate-neighbors') async neighbors(@Param('id') id: string, @Body() b: { count: number }) { return S.simulateNeighbors(id, b?.count ?? 3); }

  @Post('comments') async comment(@Req() r: Request, @Body() b: { target: ContentKey; parentId?: string; text: string; guest?: { fullName: string; age: string } }) { await S.addComment(await viewer(r), b ?? ({} as never)); return { ok: true }; }
  @Post('reports') async report(@Req() r: Request, @Body() b: { target: string; reason: string; detail?: string }) { await S.createReport(await viewer(r), b ?? ({} as never)); return { ok: true }; }
  @Post('posts') async post(@Req() r: Request, @Body() b: { title: string; lead: string; bairroId: string; topic: Topic }) { return S.publishOfficial(await viewer(r), b ?? ({} as never)); }

  @Patch('reports/:id') async resolve(@Req() r: Request, @Param('id') id: string, @Body() b: { status: 'procedente' | 'improcedente' }) { await S.resolveReport(await viewer(r), id, b?.status); return { ok: true }; }
  @Put('moderation/hidden') async hide(@Req() r: Request, @Body() b: { key: string; hidden: boolean }) { await S.setHidden(await viewer(r), b?.key, !!b?.hidden); return { ok: true }; }
  @Put('moderation/locked') async lock(@Req() r: Request, @Body() b: { key: string; locked: boolean }) { await S.setLocked(await viewer(r), b?.key, !!b?.locked); return { ok: true }; }
  @Put('users/:id/blocked') async block(@Req() r: Request, @Param('id') id: string, @Body() b: { blocked: boolean }) { await S.setBlocked(await viewer(r), id, !!b?.blocked); return { ok: true }; }
  @Put('users/:id/role') async role(@Req() r: Request, @Param('id') id: string, @Body() b: { role: Role }) { await S.setRole(await viewer(r), id, b?.role); return { ok: true }; }

  @Post('sources') async addSource(@Req() r: Request, @Body() b: Parameters<typeof S.addSource>[1]) { await S.addSource(await viewer(r), b ?? ({} as never)); return { ok: true }; }
  @Patch('sources/:id') async source(@Req() r: Request, @Param('id') id: string, @Body() b: { active: boolean }) { await S.setSourceActive(await viewer(r), id, !!b?.active); return { ok: true }; }
  @Post('bairros') async addBairro(@Req() r: Request, @Body() b: Parameters<typeof S.addBairro>[1]) { await S.addBairro(await viewer(r), b ?? ({} as never)); return { ok: true }; }
  @Patch('bairros/:id') async bairro(@Req() r: Request, @Param('id') id: string, @Body() b: { active: boolean }) { await S.setBairroActive(await viewer(r), id, !!b?.active); return { ok: true }; }

  /**
   * Resumo dos relatos de moradores. Sem groupId: resumo geral (opcionalmente só de alguns bairros).
   * O servidor monta a lista; o navegador não escolhe quais relatos entram.
   */
  @Post('resumos') @HttpCode(200) async resumo(@Req() r: Request, @Body() b: { groupId?: string; bairroIds?: string[] }) {
    const v = await viewer(r);
    // Quem lê decide o tamanho: morador vê o essencial; jornalista e admin veem tudo, para decidir se há pauta.
    const audience = v && canEditCases(v) ? 'redacao' as const : 'morador' as const;
    const db = await snapshot(v, null);
    const listed = db.relatos.filter((x) => x.status !== 'falso' && Date.now() - x.createdAt < 7 * 864e5);
    const name = (id: string) => db.bairros.find((x) => x.id === id)?.name ?? id;
    let input;
    if (b?.groupId) {
      const g = db.relatoGroups.find((x) => x.id === b.groupId);
      if (!g) throw S.bad('Grupo não encontrado. A lista pode ter mudado; recarregue a página.');
      input = { scope: 'grupo' as const, label: g.title, relatos: db.relatos.filter((x) => g.relatoIds.includes(x.id)), groups: [g], bairros: db.bairros, audience };
    } else {
      const ids = Array.isArray(b?.bairroIds) ? b.bairroIds.filter((x) => typeof x === 'string').slice(0, 30) : [];
      const rel = (ids.length ? listed.filter((x) => ids.includes(x.bairroId)) : listed).sort((a, c) => c.createdAt - a.createdAt).slice(0, 40);
      const groups = db.relatoGroups.filter((g) => g.relatoIds.some((id) => rel.some((x) => x.id === id)));
      input = { scope: 'geral' as const, label: ids.length ? `O que dizem os moradores de ${ids.map(name).slice(0, 3).join(', ')}` : 'O que os moradores estão dizendo', relatos: rel, groups, bairros: db.bairros, audience };
    }
    return summarize(input, r.ip ?? 'desconhecido');
  }

  /** Resumo do dia de um bairro: telejornais, portal e alertas (sem relatos não verificados). */
  @Post('resumos/dia') @HttpCode(200) async resumoDia(@Req() r: Request, @Body() b: { bairroId: string }) {
    const v = await viewer(r);
    const audience = v && canEditCases(v) ? 'redacao' as const : 'morador' as const;
    const db = await snapshot(audience === 'redacao' ? v : null, null);
    const bairro = db.bairros.find((x) => x.id === b?.bairroId);
    if (!bairro) throw S.bad('Bairro não encontrado.');
    const prog = (id: string) => db.programs.find((p) => p.id === id)?.name ?? 'Telejornal';
    const items = [
      ...db.segments.filter((s) => s.bairroIds.includes(bairro.id)).map((s) => ({ at: s.airedAt, kind: 'segment' as const, id: s.id, tipo: 'telejornal' as const, fonte: prog(s.programId), titulo: s.title, resumo: s.summary, oQueMuda: s.whatChanges.slice(0, 3), utilidade: s.utility })),
      ...db.articles.filter((a) => a.bairroIds.includes(bairro.id)).map((a) => ({ at: a.publishedAt, kind: 'article' as const, id: a.id, tipo: 'portal' as const, fonte: a.originRelatoId ? 'redação (relato confirmado)' : (db.programs.find((p) => p.id === a.sourceId)?.name ?? 'portal'), titulo: a.title, resumo: a.lead, oQueMuda: [] as string[], utilidade: a.utility })),
    ].sort((x, y) => y.at - x.at);
    const recent = items.filter((x) => Date.now() - x.at < 48 * 3600e3);
    const stale = recent.length === 0;
    const pick = stale ? items.slice(0, 4) : recent.slice(0, audience === 'redacao' ? 10 : 8);
    const news = pick.map(({ at, ...x }, ref) => ({ ...x, ref, haHoras: Math.round((Date.now() - at) / 36e5) }));
    const alerts = db.alerts.filter((a) => a.bairroId === bairro.id).slice(0, audience === 'redacao' ? 8 : 4).map((a) => ({ titulo: a.title, detalhe: a.detail, tipo: a.type, gravidade: a.severity, fonte: a.source }));
    const extra = audience === 'redacao' ? {
      relatos: db.relatos.filter((x) => x.bairroId === bairro.id && x.status !== 'falso' && Date.now() - x.createdAt < 48 * 3600e3).slice(0, 12)
        .map((x) => ({ titulo: x.title, categoria: x.category, confirmacoes: x.confirmations.length, status: x.status === 'confirmado' ? 'confirmado pela redação' : x.status === 'apuracao' ? 'em apuração' : 'não verificado', haHoras: Math.round((Date.now() - x.createdAt) / 36e5) })),
      diasSemTv: (() => { const last = db.segments.filter((s) => s.bairroIds.includes(bairro.id)).reduce((m, s) => Math.max(m, s.airedAt), 0); return last ? Math.floor((Date.now() - last) / 864e5) : null; })(),
    } : {};
    return summarizeDay(bairro.id, { bairro: bairro.name, news, alerts, stale, audience, ...extra }, r.ip ?? 'desconhecido');
  }


  /** Recalcula localização e utilidade de todas as notícias e retreina os modelos. */
  @Post('ml/recompute') async recompute(@Req() r: Request) {
    const v = await viewer(r);
    if (v?.role !== 'admin') throw new ForbiddenException('Só administradores.');
    const out = await recomputeAll();
    await trainAll();
    S.emit();
    return out;
  }

  @Post('casos/confirmar') @HttpCode(200) async caseConfirm(@Req() r: Request, @Body() b: { caseId: string; label?: string }) { return S.confirmCase(await viewer(r), b?.caseId, b?.label); }
  @Post('casos/ligar') @HttpCode(200) async caseLink(@Req() r: Request, @Body() b: Parameters<typeof S.setCaseLink>[1]) { return S.setCaseLink(await viewer(r), b ?? ({} as never)); }
  @Post('casos/etapa') @HttpCode(200) async caseStage(@Req() r: Request, @Body() b: Parameters<typeof S.setCaseStage>[1]) { return S.setCaseStage(await viewer(r), b ?? ({} as never)); }
  @Post('live/start') async live(@Req() r: Request) { return S.startLive(await viewer(r)); }

  /** Volta o banco aos dados de exemplo. Admin, ou qualquer um no modo demonstração. */
  @Post('demo/reset') async reset(@Req() r: Request) {
    const v = await viewer(r);
    if (!DEMO_MODE && v?.role !== 'admin') throw new ForbiddenException('Só administradores restauram os dados.');
    await resetDatabase();
    S.emit();
    return { ok: true };
  }

  @Post('tts') @HttpCode(200) async tts(@Body() b: { text: string }, @Res() res: Response) {
    const wav = await synthesize(b?.text);
    res.setHeader('content-type', 'audio/wav');
    res.setHeader('cache-control', 'private, max-age=3600');
    res.end(wav);
  }

  /** Entrada do scraper: veja docs/INGESTAO.md. */
  @Post('ingest/news') async ingest(@Headers('x-ingest-key') key: string, @Body() b: IngestBody) { return ingestNews(key, b); }
  @Post('ingest/known') @HttpCode(200) async known(@Headers('x-ingest-key') key: string, @Body() b: { urls: string[] }) { return knownUrls(key, b?.urls); }
  @Get('ingest/runs') async runs(@Req() r: Request) {
    const v = await viewer(r);
    if (v?.role !== 'admin') throw new ForbiddenException('Só administradores.');
    return ingestRuns();
  }

  @Get('bairros/:id/boundary') async boundary(@Param('id') id: string) {
    const [b] = await q('select boundary from bairros where id = $1', [id]);
    return b?.boundary ?? null;
  }
}

@Module({ controllers: [AppController] })
export class AppModule {}

export { UUID };
