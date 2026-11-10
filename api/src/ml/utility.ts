// Utilidade de uma notícia para o dia a dia do morador (0 a 100).
// Alto: muda a rotina (interdição, vacina, falta d'água, inscrições). Baixo: celebridades, fofoca, entretenimento.
import { lower } from './text';

const PRACTICAL: [RegExp, number, string][] = [
  [/interdi|desvio|bloqueio|congestion|transito|semaforo/, 20, 'trânsito'],
  [/falta d.agua|abastecimento|rodizio|compesa|sem agua|sem energia|falta de energia|apagao|neoenergia/, 25, 'serviço básico'],
  [/alag|chuva|barreira|desliza|defesa civil|alerta|temporal/, 20, 'chuva e risco'],
  [/vacin|mutirao|atendimento gratuito|consulta|ubs|upa\b|posto de saude/, 20, 'saúde'],
  [/inscric|matricula|vagas|prazo|cadastro|selecao|concurso|enem/, 15, 'prazos e vagas'],
  [/onibus|metro|linha|terminal|tarifa|passagem/, 15, 'transporte'],
  [/obra|buraco|paviment|drenagem|reforma de|requalifica/, 15, 'obras'],
  [/horario|funcionamento|fecha|abre|gratuito|gratis|programacao/, 10, 'serviço'],
  [/conta de (agua|luz)|aumento|reajuste|iptu|tarifa/, 10, 'custo de vida'],
  [/assalto|arrastao|tiroteio|violencia|seguranca/, 8, 'segurança'],
];
const LOW: [RegExp, number, string][] = [
  [/famos[oa]s|celebridade|influenciador|ex-bbb|\bbbb\b|reality|novela|fofoca|\bator(es)?\b|\batriz|\bcantor(a|es)?\b|casamento de|casa(m|ram)-se|padrinhos/, -30, 'celebridades'],
  [/horoscopo|signo|curiosidade|viraliza|meme/, -25, 'entretenimento'],
  [/futebol|campeonato|\bgol\b|\bsport\b|nautico|tricolor do arruda|serie [abcd]\b/, -10, 'esporte'],
];

export function newsUtility(title: string, summary = '', text = '') {
  const t = lower(`${title} ${title} ${summary} ${text.slice(0, 1500)}`);
  let score = 40;
  const reasons: string[] = [];
  for (const [re, w, why] of PRACTICAL) if (re.test(t)) { score += w; reasons.push(why); }
  for (const [re, w, why] of LOW) if (re.test(t)) { score += w; reasons.push(why); }
  return { score: Math.max(0, Math.min(100, score)), reasons: [...new Set(reasons)].slice(0, 4) };
}
