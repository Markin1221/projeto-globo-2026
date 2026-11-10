'use client';
// Triagem de apoio: só para a equipe. Mostra sinais; quem decide é o jornalista.
import Link from 'next/link';
import { AlertTriangle, Bot, CheckCircle2, Copy, Gauge, Info } from 'lucide-react';
import type { Triage } from '@/domain/types';

const RISK_TEXT = { baixo: 'Risco baixo', medio: 'Risco médio', alto: 'Risco alto' } as const;
const UTIL_TEXT = { baixo: 'Pouco útil', medio: 'Utilidade média', alto: 'Útil' } as const;

export function TriageChips({ t }: { t?: Triage }) {
  if (!t) return null;
  return (
    <span className="tri-chips">
      <span className={`tri tri-risk-${t.riskLevel}`} title={`Pontuação de risco: ${t.risk} de 100`}>{RISK_TEXT[t.riskLevel]}</span>
      {t.utility === 'baixo' && <span className="tri tri-low">{UTIL_TEXT.baixo}</span>}
      {t.duplicateOf && <span className="tri tri-low"><Copy size={12} aria-hidden />Possível duplicado</span>}
      <span className="tri tri-prio" title="Prioridade sugerida de apuração, de 0 a 100">Prioridade {t.priority}</span>
    </span>
  );
}

const ICON = { risco: AlertTriangle, confianca: CheckCircle2, utilidade: Info, prioridade: Gauge };

export function TriagePanel({ t }: { t?: Triage }) {
  if (!t) return null;
  const groups: [string, Triage['signals']][] = [
    ['Pede cuidado', t.signals.filter((s) => s.kind === 'risco' || (s.kind === 'prioridade'))],
    ['Ajuda a confirmar', t.signals.filter((s) => s.kind === 'confianca')],
    ['Qualidade do relato', t.signals.filter((s) => s.kind === 'utilidade')],
  ];
  return (
    <section className="triage" aria-label="Triagem automática">
      <h3><Bot size={18} aria-hidden />Triagem automática</h3>
      <p className="muted">Sinais calculados pelo sistema para ajudar a apuração. Eles não decidem nada: só a redação confirma ou descarta um relato.</p>
      <div className="tri-score">
        <div><b>{t.risk}</b><span>{RISK_TEXT[t.riskLevel]}</span><i className={`tri-bar tri-risk-${t.riskLevel}`} style={{ width: `${t.risk}%` }} aria-hidden /></div>
        <div><b>{t.priority}</b><span>Prioridade sugerida</span><i className="tri-bar tri-prio" style={{ width: `${t.priority}%` }} aria-hidden /></div>
        <div><b>{UTIL_TEXT[t.utility]}</b><span>Utilidade</span></div>
      </div>
      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title}>
          <h4>{title}</h4>
          <ul className="tri-signals">
            {list.map((s) => { const I = ICON[s.kind]; return <li key={s.text}><I size={15} aria-hidden /><span>{s.link ? <Link href={s.link}>{s.text}</Link> : s.text}</span></li>; })}
          </ul>
        </div>
      ))}
      {!t.signals.length && <p>Nenhum sinal relevante.</p>}
      {t.model && <p className="muted tri-model">Comparação com {t.model.decisions} decisões anteriores da redação: {t.model.pFalse >= 0.95 ? 'muito parecido' : t.model.pFalse >= 0.65 ? 'parecido' : t.model.pFalse <= 0.35 ? 'pouco parecido' : 'sem semelhança clara'} com relatos que não se confirmaram.{t.model.decisions < 30 ? ' Ainda são poucos exemplos: trate como pista, não como evidência.' : ''}</p>}
    </section>
  );
}
