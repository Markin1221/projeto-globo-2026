// Utilidades de texto para os modelos: normalização, tokens e similaridade.

export const strip = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const lower = (s: string) => strip(s).toLowerCase();

const STOP = new Set(`a ao aos as ate com como da das de dei do dos e ela elas ele eles em entre era essa esse esta este eu foi foram ha isso isto ja la lhe mais mas me mesmo meu minha muito na nas nem no nos nossa nosso num numa o os ou para pela pelas pelo pelos por qual quando que quem se sem ser seu sua so sobre tambem te tem ter tinha tu um uma umas uns voce voces vai vao esta estao estava sao segundo apos ainda onde porque pois desde cada outro outra outros outras nesta neste nessa nesse dia dias hoje ontem ano anos feira semana segunda terca quarta quinta sexta sabado domingo disse diz afirmou informou g1 video veja saiba mes mês vem nao comecou chegou tem ficou fica gente aqui agora depois antes fim ate tudo nada ninguem`.split(/\s+/));

/** Palavras (sem acento, minúsculas, 3+ letras, sem stopwords) e pares de palavras vizinhas. */
export function tokens(text: string, bigrams = true): string[] {
  const words = lower(text).match(/[a-z0-9]{3,}/g)?.filter((w) => !STOP.has(w) && !/^\d+$/.test(w)) ?? [];
  if (!bigrams) return words;
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]}_${words[i + 1]}`);
  return out;
}

export function jaccard(a: string, b: string) {
  const A = new Set(tokens(a, false)), B = new Set(tokens(b, false));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
