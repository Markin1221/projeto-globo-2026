import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, resetDatabase } from './app';
import { migrate, q, tx, waitForDb } from './db';
import { seedDatabase } from './seed/load';
import { recomputeAll } from './ingest';
import { mlStats, trainAll } from './ml/models';
import { applyLimits } from './limits';

async function bootstrap() {
  await waitForDb();
  if (process.argv.includes('--reset')) {
    await resetDatabase();
    console.log('Banco recriado com os dados de exemplo.');
    process.exit(0);
  }
  await migrate();
  const [{ n }] = await q<{ n: number }>('select count(*)::int as n from users');
  if (n === 0 && process.env.SEED_ON_EMPTY !== 'false') {
    await tx((c) => seedDatabase(c));
    console.log('Banco vazio: dados de exemplo carregados.');
  }

  const limits = await applyLimits();
  if (limits) console.log(`Limites oficiais aplicados em ${limits} bairros.`);

  // Primeira subida depois da migração 002: calcula localização e utilidade das notícias que já existiam.
  const [{ pending }] = await q<{ pending: number }>('select count(*)::int as pending from news_items where utility is null');
  if (pending) { console.log(`Analisando ${pending} notícias...`); await recomputeAll(); }
  await trainAll();
  const st = mlStats();
  console.log(`Modelos: localização com ${st.location.docs} exemplos, triagem com ${st.triage.decisions} decisões.`);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '5mb' });
  app.set('trust proxy', 1);
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`API em http://localhost:${port}/api`);
}

bootstrap().catch((e) => { console.error(e); process.exit(1); });
