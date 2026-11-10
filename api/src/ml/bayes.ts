// Classificador Naive Bayes multinomial, sem dependências. Treina em milissegundos com milhares de textos.
import { tokens } from './text';

export interface Prediction { label: string; p: number }

export class NaiveBayes {
  private docs = new Map<string, number>();
  private counts = new Map<string, Map<string, number>>();
  private totals = new Map<string, number>();
  private vocab = new Set<string>();
  size = 0;

  constructor(private alpha = 1) {}

  add(text: string, label: string) {
    const toks = tokens(text);
    if (!toks.length) return;
    this.size++;
    this.docs.set(label, (this.docs.get(label) ?? 0) + 1);
    const c = this.counts.get(label) ?? new Map<string, number>();
    for (const t of toks) { c.set(t, (c.get(t) ?? 0) + 1); this.vocab.add(t); }
    this.counts.set(label, c);
    this.totals.set(label, (this.totals.get(label) ?? 0) + toks.length);
  }

  get labels() { return [...this.docs.keys()]; }
  docsOf(label: string) { return this.docs.get(label) ?? 0; }

  /** Probabilidades por rótulo (softmax dos log-scores), da maior para a menor. */
  predict(text: string): Prediction[] {
    const toks = tokens(text);
    if (!toks.length || !this.size) return [];
    const V = this.vocab.size;
    const scores = this.labels.map((label) => {
      const c = this.counts.get(label)!;
      const total = this.totals.get(label)!;
      let s = Math.log(this.docs.get(label)! / this.size);
      for (const t of toks) if (this.vocab.has(t)) s += Math.log(((c.get(t) ?? 0) + this.alpha) / (total + this.alpha * V));
      return { label, s };
    });
    const max = Math.max(...scores.map((x) => x.s));
    const sum = scores.reduce((a, x) => a + Math.exp(x.s - max), 0);
    return scores.map((x) => ({ label: x.label, p: Math.exp(x.s - max) / sum })).sort((a, b) => b.p - a.p);
  }

  /** Palavras que mais pesam a favor de um rótulo neste texto (para explicar a previsão). */
  explain(text: string, label: string, n = 3) {
    const c = this.counts.get(label);
    if (!c) return [];
    const V = this.vocab.size;
    const others = this.labels.filter((l) => l !== label);
    const seen = new Set<string>();
    return tokens(text, false).filter((t) => this.vocab.has(t) && !seen.has(t) && seen.add(t)).map((t) => {
      const mine = Math.log(((c.get(t) ?? 0) + this.alpha) / (this.totals.get(label)! + this.alpha * V));
      const rest = others.length ? Math.max(...others.map((l) => Math.log(((this.counts.get(l)!.get(t) ?? 0) + this.alpha) / (this.totals.get(l)! + this.alpha * V)))) : mine - 1;
      return { t, gain: mine - rest };
    }).filter((x) => x.gain > 0.3).sort((a, b) => b.gain - a.gain).slice(0, n).map((x) => x.t);
  }
}

/** Avaliação simples: treina em 80% e mede acerto nos 20% restantes (divisão fixa, reprodutível). */
export function holdoutAccuracy(samples: { text: string; label: string }[], minPerLabel = 2) {
  const byLabel = new Map<string, number>();
  for (const s of samples) byLabel.set(s.label, (byLabel.get(s.label) ?? 0) + 1);
  const usable = samples.filter((s) => (byLabel.get(s.label) ?? 0) >= minPerLabel);
  const test = usable.filter((_, i) => i % 5 === 4);
  const train = usable.filter((_, i) => i % 5 !== 4);
  if (test.length < 3) return null;
  const nb = new NaiveBayes();
  for (const s of train) nb.add(s.text, s.label);
  const hits = test.filter((s) => nb.predict(s.text)[0]?.label === s.label).length;
  return { accuracy: hits / test.length, tested: test.length };
}
