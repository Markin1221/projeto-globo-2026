import path from 'node:path';
import type { NextConfig } from 'next';

// O front importa ../shared (regras e tipos usados também pela API), por isso a raiz é a pasta acima.
const root = path.join(__dirname, '..');
const api = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  // Em produção o Caddy encaminha /api direto para a API; isto cobre o desenvolvimento e o uso sem Caddy.
  async rewrites() { return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]; },
};
export default config;
