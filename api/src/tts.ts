// Voz neural: repassa o texto ao serviço Piper (container "tts") e guarda o áudio em cache.
import { createHash } from 'node:crypto';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { speechText } from '../../shared/domain/rules';

const cache = new Map<string, Buffer>();
const MAX_CACHE = 300;

export async function synthesize(raw: string): Promise<Buffer> {
  const url = process.env.TTS_URL;
  if (!url) throw new ServiceUnavailableException('Voz neural desativada.');
  const text = speechText(String(raw ?? '')).slice(0, 2500);
  if (!text) throw new BadRequestException('Texto vazio.');
  const key = createHash('sha1').update(text).digest('hex');
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const res = await fetch(`${url.replace(/\/$/, '')}/synthesize`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, length_scale: Number(process.env.TTS_LENGTH_SCALE ?? 1.0) }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!res?.ok) throw new ServiceUnavailableException('Serviço de voz indisponível.');
  const wav = Buffer.from(await res.arrayBuffer());
  cache.set(key, wav);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return wav;
}
