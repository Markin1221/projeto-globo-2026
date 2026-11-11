'use client';
// Estado de interface (preferências, toasts, fala) e assinatura do snapshot vindo da API.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { speechText } from '@/domain/rules';
import type { Db, User } from '@/domain/types';
import { api, DomainError } from '@/services/http-api';

export type Theme = 'dark' | 'light' | 'contrast';
/** actorHandle: perfil de demonstração escolhido em "Ver o app como". */
/** navOpen: menu lateral expandido (com nomes). Fechado, mostra só os ícones. */
export interface Prefs { theme: Theme; font: number; simple: boolean; actorHandle: string; voice: 'neural' | 'navegador'; navOpen?: boolean }
export interface Toast { id: number; kind: 'ok' | 'erro' | 'info'; text: string }
export interface Speaking { id: string; text: string; loading?: boolean }

const DEFAULTS: Prefs = { theme: 'light', font: 1, simple: false, actorHandle: 'marinadoalto', voice: 'neural' };
const KEY = 'bairro-em-pauta:prefs';

interface UiState { prefs: Prefs; toasts: Toast[]; speaking: Speaking | null; failing: boolean; guideOpen: boolean; dismissedLive: string | null }
let ui: UiState = { prefs: DEFAULTS, toasts: [], speaking: null, failing: false, guideOpen: false, dismissedLive: null };
const uiListeners = new Set<() => void>();
const setUi = (patch: Partial<UiState>) => { ui = { ...ui, ...patch }; uiListeners.forEach((l) => l()); };
const subscribeUi = (fn: () => void) => { uiListeners.add(fn); return () => { uiListeners.delete(fn); }; };

export const GUEST: User = { id: 'guest', name: 'Visitante', handle: 'visitante', role: 'visitante', bio: '', followed: [], saved: [], blocked: false, hue: 210, locationAllowed: false };

export const useUi = () => useSyncExternalStore(subscribeUi, () => ui, () => ui);
export const useDb = (): Db => useSyncExternalStore(api.subscribe, api.snapshot, api.snapshot);
export function useMe(): User {
  const db = useDb();
  return db.users.find((u) => u.id === db.meId) ?? GUEST;
}
export const actorId = () => api.snapshot().meId ?? 'guest';

function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  el.style.fontSize = `${p.font * 100}%`;
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) setUi({ prefs: { ...DEFAULTS, ...JSON.parse(raw) } });
  } catch { /* preferências seguem no padrão */ }
  applyPrefs(ui.prefs);
}

export function setPrefs(patch: Partial<Prefs>) {
  const prefs = { ...ui.prefs, ...patch };
  setUi({ prefs });
  applyPrefs(prefs);
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* sem persistência neste navegador */ }
}

/** Conecta à API e entra com o perfil de demonstração salvo. */
export async function boot() {
  loadPrefs();
  await api.init();
  const db = api.snapshot();
  const want = ui.prefs.actorHandle;
  const current = db.users.find((u) => u.id === db.meId);
  if (current?.handle === want) return;
  const target = db.users.find((u) => u.handle === want);
  if (want === 'visitante') { if (db.meId) await api.login(null); return; }
  if (target && db.meta.demoMode) await api.login(target.id);
}

/** Troca o perfil da demonstração ("Ver o app como"). */
export async function switchProfile(handle: string) {
  const db = api.snapshot();
  const u = db.users.find((x) => x.handle === handle);
  setPrefs({ actorHandle: handle });
  await act(() => api.login(handle === 'visitante' ? null : u?.id ?? null));
  toast(`Agora você está como ${u?.name ?? 'visitante'}.`, 'info');
}

export const setFont = (delta: number) => setPrefs({ font: Math.min(1.6, Math.max(0.9, Math.round((ui.prefs.font + delta) * 10) / 10)) });

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++toastId;
  setUi({ toasts: [...ui.toasts, { id, kind, text }] });
  setTimeout(() => setUi({ toasts: ui.toasts.filter((t) => t.id !== id) }), 4500);
}
export const dismissToast = (id: number) => setUi({ toasts: ui.toasts.filter((t) => t.id !== id) });

/** Executa uma ação do serviço e transforma erro de regra em toast. */
export async function act<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const out = await fn();
    if (success) toast(success);
    return out ?? (true as T);
  } catch (e) {
    toast(e instanceof DomainError ? e.message : 'Não foi possível concluir. Tente de novo.', 'erro');
    return undefined;
  }
}

export function setFailing(failing: boolean) { api.failing = failing; setUi({ failing }); }
export const setGuideOpen = (guideOpen: boolean) => setUi({ guideOpen });
export const dismissLive = (segmentId: string) => setUi({ dismissedLive: segmentId });

// --- Leitura em voz alta -------------------------------------------------------------------
// 1º: voz neural do servidor (Piper, pt-BR). 2º: a melhor voz pt-BR do navegador, em frases curtas.
let audio: HTMLAudioElement | null = null;
let session = 0;
let voiceWarned = false;
const PREFERRED = [/natural/i, /online/i, /google/i, /francisca|thalita|antonio|luciana|daniel|felipe/i];

function bestVoice(synth: SpeechSynthesis) {
  const pt = synth.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('pt-br'));
  for (const re of PREFERRED) { const v = pt.find((x) => re.test(x.name)); if (v) return v; }
  return pt[0] ?? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt'));
}
const chunks = (t: string) => t.match(/[^.!?;:]+[.!?;:]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];

function speakBrowser(id: string, text: string, my: number, onEnd?: () => void) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) { toast('Este navegador não tem leitura em voz alta. O texto aparece na barra de leitura.', 'info'); return; }
  synth.cancel();
  const voice = bestVoice(synth);
  const parts = chunks(speechText(text));
  const next = (i: number) => {
    if (my !== session) return;
    if (i >= parts.length) { if (ui.speaking?.id === id) setUi({ speaking: null }); onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(parts[i]);
    u.lang = 'pt-BR'; u.rate = 1; u.pitch = 1;
    if (voice) u.voice = voice;
    u.onend = () => next(i + 1);
    u.onerror = (e) => {
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      if (!voiceWarned) { voiceWarned = true; toast('Este aparelho não tem voz em português. O texto aparece na barra de leitura.', 'info'); }
    };
    synth.speak(u);
  };
  next(0);
}

export function speak(id: string, text: string, opts: { onEnd?: () => void; restart?: boolean } = {}) {
  if (ui.speaking?.id === id && !opts.restart) { stopSpeaking(); return; }
  stopSpeaking();
  const my = ++session;
  const neural = api.snapshot().meta.tts && ui.prefs.voice === 'neural';
  setUi({ speaking: { id, text, loading: neural } });
  if (!neural) { speakBrowser(id, text, my, opts.onEnd); return; }
  api.tts(text).then((blob) => {
    if (my !== session) return;
    audio = new Audio(URL.createObjectURL(blob));
    audio.onended = () => { if (my === session) { setUi({ speaking: null }); opts.onEnd?.(); } };
    setUi({ speaking: { id, text } });
    return audio.play();
  }).catch(() => { if (my === session) { setUi({ speaking: { id, text } }); speakBrowser(id, text, my, opts.onEnd); } });
}
export function stopSpeaking() {
  session++;
  if (audio) { audio.pause(); audio = null; }
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  setUi({ speaking: null });
}

/** Estado de carregamento por tela: skeleton até o primeiro snapshot, erro se a falha simulada estiver ligada. */
export function usePageLoad(key: string) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(api.loaded ? 'ready' : 'loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (api.failing) { setState('loading'); const t = setTimeout(() => setState('error'), 320); return () => clearTimeout(t); }
    if (attempt > 0) { setState('loading'); api.refresh().then(() => setState('ready'), () => setState('error')); return; }
    setState('ready');
  }, [key, attempt]);
  return { state, retry: () => setAttempt((a) => a + 1) };
}

export async function startLiveDemo() {
  setUi({ dismissedLive: null });
  await act(() => api.startLive());
}

export { api };
