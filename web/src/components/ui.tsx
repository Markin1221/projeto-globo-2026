'use client';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Newspaper, AlertTriangle, BadgeCheck, CheckCircle2, CircleSlash2, Clock3, Inbox, Loader2, Search as SearchIcon, ShieldCheck, Tv, WifiOff, X } from 'lucide-react';
import Link from 'next/link';
import { INFORMAL_SEAL, INFORMAL_WARNING, STATUS_LABEL } from '@/domain/rules';
import type { RelatoStatus, User } from '@/domain/types';

export function timeAgo(ts: number) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d} d` : `${Math.floor(d / 30)} m`;
}
export const agoText = (ts: number) => { const t = timeAgo(ts); return t === 'agora' ? t : `há ${t}`; };
export const fmtDate = (ts: number) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtClock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; busy?: boolean; big?: boolean }
export function Button({ variant = 'outline', busy, big, className = '', children, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} className={`btn btn-${variant} ${big ? 'btn-big' : ''} ${className}`}>
      {busy && <Loader2 className="spin" size={16} aria-hidden />}{children}
    </button>
  );
}

export function Avatar({ user, size = 40 }: { user?: Pick<User, 'name' | 'hue'>; size?: number }) {
  const name = user?.name ?? '?';
  const initials = name.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || name[0];
  return <span className="avatar" aria-hidden style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${user?.hue ?? 210} 55% 36%)` }}>{initials}</span>;
}

export const OfficialSeal = () => <span className="seal seal-official"><ShieldCheck size={15} aria-hidden />Oficial da redação</span>;
export const SourceSeal = ({ name }: { name: string }) => <span className="seal seal-official"><Newspaper size={15} aria-hidden />{name}</span>;
export const ProgramSeal = ({ name }: { name: string }) => <span className="seal seal-program"><Tv size={15} aria-hidden />Telejornal {name}</span>;
export const InformalSeal = () => <span className="seal seal-informal"><AlertTriangle size={15} aria-hidden />{INFORMAL_SEAL}</span>;
export const ConfirmedSeal = () => <span className="seal seal-confirmed"><BadgeCheck size={15} aria-hidden />Confirmado pela redação</span>;
export const FalseSeal = () => <span className="seal seal-false"><CircleSlash2 size={15} aria-hidden />Falso / Não confirmado</span>;

export function StatusSeal({ status }: { status: RelatoStatus }) {
  if (status === 'confirmado') return <ConfirmedSeal />;
  if (status === 'falso') return <FalseSeal />;
  return <span className="seal seal-neutral"><Clock3 size={15} aria-hidden />{STATUS_LABEL[status]}</span>;
}

export function InformalNotice() {
  return <div className="informal-notice"><InformalSeal /><p>{INFORMAL_WARNING}</p></div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={titleId} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="modal-body">
          <header className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={20} aria-hidden /></button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <div className="state"><Inbox size={32} aria-hidden /><h2>{title}</h2>{text && <p>{text}</p>}{action}</div>;
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state" role="alert">
      <WifiOff size={32} aria-hidden /><h2>Não foi possível carregar</h2>
      <p>A conexão com o servidor falhou. Verifique a internet e tente de novo.</p>
      <Button variant="primary" onClick={onRetry}>Tentar de novo</Button>
    </div>
  );
}
export function SuccessState({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return <div className="state state-ok" role="status"><CheckCircle2 size={36} aria-hidden /><h2>{title}</h2>{text && <p>{text}</p>}{children}</div>;
}
export function NotFoundState({ what }: { what: string }) {
  return <EmptyState title={`${what} não encontrado`} text="O link pode estar errado, ou o conteúdo foi removido." action={<Link className="btn btn-primary" href="/">Voltar ao início</Link>} />;
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i}><div className="sk sk-circle" /><div className="sk-col"><div className="sk sk-line w40" /><div className="sk sk-line" /><div className="sk sk-line w70" /><div className="sk sk-box" /></div></div>
      ))}
    </div>
  );
}

export function PageState({ state, retry, children, rows }: { state: 'loading' | 'ready' | 'error'; retry: () => void; children: ReactNode; rows?: number }) {
  if (state === 'loading') return <Skeleton rows={rows} />;
  if (state === 'error') return <ErrorState onRetry={retry} />;
  return <>{children}</>;
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'tab on' : 'tab'} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; id: string; children: ReactNode }) {
  return (
    <div className={`field ${error ? 'field-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && <small className="err" id={`${id}-err`} role="alert">{error}</small>}
    </div>
  );
}

export function SearchGlyph() { return <SearchIcon size={18} aria-hidden />; }
