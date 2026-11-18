import type {
  CompanyCandidate,
  CompanyDataSource,
  CompanyInput,
  FunctionAssumption,
  Parameters,
} from '@/lib/types';
import type { AssistantContext, AssistantView } from '@/lib/assistant/snapshot';

/*
 * What the assistant sidebar knows about the assessment on screen. The wizard and its steps
 * publish their state here (the drafts while a step is being edited); the sidebar reads it when a
 * question is sent. Also holds whether the sidebar is open, shared with the header's toggle.
 */

export interface AssessmentState {
  step: 0 | 1 | 2 | 3;
  input: CompanyInput;
  assumptions: FunctionAssumption[];
  parameters: Parameters;
}

export interface ResearchDraft {
  phase: 'choose' | 'loading' | 'candidates' | 'form';
  form: CompanyInput;
  source: CompanyDataSource;
  candidates: CompanyCandidate[];
}

export interface FteDraft {
  rows: FunctionAssumption[];
  params: Parameters;
}

interface StoreState {
  assessment: AssessmentState | null;
  research: ResearchDraft | null;
  fte: FteDraft | null;
  /** Docked panel on wide screens (remembered in localStorage). */
  desktopOpen: boolean;
  /** Overlay drawer on narrow screens (always starts closed). */
  drawerOpen: boolean;
  /** Width at least DESKTOP_MIN_WIDTH. Assumed true until the browser says otherwise. */
  isDesktop: boolean;
}

export const DESKTOP_MIN_WIDTH = 900;
const OPEN_KEY = 'oia-assistant-open-v1';

const initial: StoreState = {
  assessment: null,
  research: null,
  fte: null,
  desktopOpen: true,
  drawerOpen: false,
  isDesktop: true,
};

let state: StoreState = initial;
const listeners = new Set<() => void>();
let browserSynced = false;

function set(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

/** Reads the remembered open state and follows the window width; once, on the first subscriber. */
function syncWithBrowser() {
  if (browserSynced || typeof window === 'undefined') return;
  browserSynced = true;
  let desktopOpen = state.desktopOpen;
  try {
    const stored = window.localStorage.getItem(OPEN_KEY);
    if (stored === '0') desktopOpen = false;
    if (stored === '1') desktopOpen = true;
  } catch {
    // storage blocked: keep the default
  }
  const query = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
  set({ desktopOpen, isDesktop: query.matches });
  query.addEventListener('change', (e) => set({ isDesktop: e.matches, drawerOpen: e.matches ? false : state.drawerOpen }));
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // After the listener is in place, so the first browser read reaches it.
  queueMicrotask(syncWithBrowser);
  return () => listeners.delete(listener);
}

export function getState(): StoreState {
  return state;
}

export function getServerState(): StoreState {
  return initial;
}

export function publishAssessment(assessment: AssessmentState | null) {
  set({ assessment });
}

export function publishResearchDraft(research: ResearchDraft | null) {
  set({ research });
}

export function publishFteDraft(fte: FteDraft | null) {
  set({ fte });
}

/** Opens or closes the panel for the current width: the docked panel, or the drawer on phones. */
export function setAssistantOpen(open: boolean) {
  if (state.isDesktop) {
    set({ desktopOpen: open });
    try {
      window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      // storage blocked: the choice lasts for this page only
    }
  } else {
    set({ drawerOpen: open });
  }
}

export function isAssistantOpen(s: StoreState): boolean {
  return s.isDesktop ? s.desktopOpen : s.drawerOpen;
}

const VIEW_BY_STEP: AssistantView[] = ['company', 'research', 'fte', 'results'];

export function currentView(s: StoreState): AssistantView {
  return VIEW_BY_STEP[s.assessment?.step ?? 0];
}

/** The assessment on screen, as sent to /api/assistant (the server checks and recomputes it). */
export function assistantContext(s: StoreState, path: string): AssistantContext {
  const a = s.assessment;
  const view = currentView(s);
  const context: AssistantContext = { path, view };
  if (!a) return context;

  if (view === 'research' && s.research) {
    context.company = { ...s.research.form, source: s.research.source };
    context.research = { phase: s.research.phase, candidates: s.research.candidates };
  } else if (a.input.companyName || a.input.source) {
    context.company = a.input;
  }

  if (view === 'fte') {
    context.assumptions = s.fte?.rows ?? a.assumptions;
    context.parameters = s.fte?.params ?? a.parameters;
    context.draft = true;
  } else if (view === 'results') {
    context.assumptions = a.assumptions;
    context.parameters = a.parameters;
  }
  return context;
}
