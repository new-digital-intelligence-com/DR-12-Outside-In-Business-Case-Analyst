'use client';

import { memo, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import AssistantMarkdown from './AssistantMarkdown';
import {
  assistantContext,
  currentView,
  getServerState,
  getState,
  isAssistantOpen,
  setAssistantOpen,
  subscribe,
} from '@/lib/assistantStore';
import type { AssistantView } from '@/lib/assistant/snapshot';

const CHAT_KEY = 'oia-assistant-chat-v1';
const MAX_MESSAGE_CHARS = 2_000;
const HISTORY_TURNS = 10;
const HISTORY_CHARS = 2_400;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.tsv,.json';
const REQUEST_TIMEOUT_MS = 75_000;

const STARTERS: Record<AssistantView, string[]> = {
  company: [
    'How does this assessment work?',
    'Where do the company figures come from?',
    'What is an NDI AI Employee?',
  ],
  research: [
    'Which data source should I choose?',
    'Explain these figures and how they are used',
    'What happens if total FTE is left empty?',
  ],
  fte: [
    'What do AI capability and strategic importance change?',
    'Which functions have the most FTE?',
    'How is the business case calculated?',
  ],
  results: [
    'Summarise the business case in 5 bullets',
    'Why are the top 3 functions ranked first?',
    'Which NDI AI Employees should we start with?',
    'Explain the payback period',
  ],
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Names of the files sent with a user message (the files themselves are not kept). */
  files?: string[];
}

interface PendingFile {
  id: string;
  name: string;
  size: number;
  data: string;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

function readStoredChat(): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(CHAT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMessage =>
          !!m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          typeof m.id === 'string',
      )
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        files: Array.isArray(m.files) ? m.files.filter((f): f is string => typeof f === 'string') : undefined,
      }))
      .slice(-50);
  } catch {
    return [];
  }
}

function writeStoredChat(messages: ChatMessage[]) {
  try {
    window.sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-50)));
  } catch {
    // storage blocked or full: the chat lasts for this page only
  }
}

function downloadText(text: string, filename: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A turn as sent in `history`: the text, plus which files went with it. */
function historyText(m: ChatMessage): string {
  const files = m.files?.length ? `\n[Attached: ${m.files.join(', ')}]` : '';
  return `${m.content}${files}`.slice(0, HISTORY_CHARS);
}

function useStoreValue<T>(select: (s: ReturnType<typeof getState>) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(getState()),
    () => select(getServerState()),
  );
}

const isPrintPath = (path: string | null) => !!path && path.startsWith('/print');

/** The header button that shows or hides the assistant. */
export function AssistantToggle() {
  const open = useStoreValue(isAssistantOpen);
  const pathname = usePathname();
  if (isPrintPath(pathname)) return null;
  return (
    <button
      type="button"
      onClick={() => setAssistantOpen(!open)}
      aria-expanded={open}
      aria-controls="assistant-panel"
      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium transition ${
        open
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <ChatIcon className="h-3.5 w-3.5" />
      Assistant
    </button>
  );
}

export default function AssistantSidebar() {
  const pathname = usePathname();
  const view = useStoreValue(currentView);
  const desktopOpen = useStoreValue((s) => s.desktopOpen);
  const drawerOpen = useStoreValue((s) => s.drawerOpen);
  const isDesktop = useStoreValue((s) => s.isDesktop);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);

  const loaded = useRef(false);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The conversation lives in sessionStorage, read after hydration (the server has no chat).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMessages(readStoredChat());
    loaded.current = true;
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (loaded.current) writeStoredChat(messages);
  }, [messages]);

  useEffect(() => {
    let active = true;
    fetch('/api/assistant')
      .then((res) => (res.ok ? (res.json() as Promise<{ configured?: boolean }>) : null))
      .then((body) => {
        if (active && body) setConfigured(body.configured === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, busy]);

  // The drawer takes the focus when it opens on a phone.
  useEffect(() => {
    if (drawerOpen && !isDesktop) inputRef.current?.focus();
  }, [drawerOpen, isDesktop]);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError('');
    const selected = Array.from(list);
    try {
      if (files.length + selected.length > MAX_FILES) throw new Error('Attach up to three files per message.');
      const total = [...files.map((f) => f.size), ...selected.map((f) => f.size)].reduce((a, b) => a + b, 0);
      if (total > MAX_TOTAL_BYTES) throw new Error('Attachments can total at most 8 MB.');
      setReading(true);
      const read: PendingFile[] = [];
      for (const file of selected) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!ACCEPT.split(',').includes(`.${ext}`)) {
          throw new Error(`${file.name}: use PDF, PNG, JPEG, WebP, TXT, Markdown, CSV, TSV or JSON.`);
        }
        if (!file.size || file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: use a non-empty file of at most 5 MB.`);
        read.push({ id: newId(), name: file.name, size: file.size, data: await readAsBase64(file) });
      }
      setFiles((prev) => [...prev, ...read]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach the files.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (busy || reading || configured === false) return;
    if (!message && !files.length) return;
    if (message.length > MAX_MESSAGE_CHARS) {
      setError(`Keep questions under ${MAX_MESSAGE_CHARS.toLocaleString('en')} characters.`);
      return;
    }

    const myGeneration = ++generation.current;
    const sentFiles = files;
    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: message,
      ...(sentFiles.length ? { files: sentFiles.map((f) => f.name) } : {}),
    };
    const history = messages.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: historyText(m) }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setFiles([]);
    setError('');
    setBusy(true);

    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history,
          attachments: sentFiles.map(({ name, data }) => ({ name, data })),
          context: assistantContext(getState(), pathname ?? '/'),
        }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as { answer?: unknown; error?: unknown; code?: unknown } | null;
      if (generation.current !== myGeneration) return;
      if (!res.ok || typeof body?.answer !== 'string') {
        if (body?.code === 'not_configured') setConfigured(false);
        throw new Error(
          typeof body?.error === 'string' ? body.error : `The assistant could not answer (error ${res.status}).`,
        );
      }
      const answer = body.answer;
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content: answer }]);
    } catch (err) {
      if (generation.current !== myGeneration) return; // a new chat was started meanwhile
      // The question goes back into the box, so it can be sent again.
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setInput(message);
      setFiles(sentFiles);
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'The assistant took too long to answer. Please try again.'
          : err instanceof Error && err.message !== 'Failed to fetch'
            ? err.message
            : 'Could not reach the assistant. Check your connection and try again.',
      );
    } finally {
      clearTimeout(timer);
      if (generation.current === myGeneration) {
        setBusy(false);
        abort.current = null;
      }
    }
  }

  function newChat() {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    setMessages([]);
    setInput('');
    setFiles([]);
    setError('');
    setBusy(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  if (isPrintPath(pathname)) return null;

  const disabled = configured === false;
  const panelClasses = [
    'print-hide flex-col border-l border-slate-200 bg-white',
    // Phones and narrow windows: an overlay drawer.
    'max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:right-0 max-[899px]:z-50 max-[899px]:w-full max-[899px]:max-w-[420px] max-[899px]:shadow-xl',
    drawerOpen ? 'max-[899px]:flex' : 'max-[899px]:hidden',
    // Wide screens: docked beside the app, always in view while the page scrolls.
    'min-[900px]:sticky min-[900px]:top-0 min-[900px]:h-dvh min-[900px]:w-[360px] min-[900px]:shrink-0 min-[900px]:self-start min-[1400px]:w-[400px]',
    desktopOpen ? 'min-[900px]:flex' : 'min-[900px]:hidden',
  ].join(' ');

  return (
    <>
      {drawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => setAssistantOpen(false)}
          className="print-hide fixed inset-0 z-40 bg-slate-900/30 min-[900px]:hidden"
        />
      )}

      {!drawerOpen && (
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          aria-controls="assistant-panel"
          aria-expanded={false}
          className="print-hide fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 min-[900px]:hidden"
        >
          <ChatIcon className="h-4 w-4" />
          Ask the assistant
        </button>
      )}

      <aside
        id="assistant-panel"
        aria-label="Assessment assistant"
        className={panelClasses}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isDesktop) setAssistantOpen(false);
        }}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">Assessment assistant</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${disabled ? 'bg-amber-500' : 'bg-emerald-500'}`}
              />
              {disabled ? 'Not configured on this server' : 'Grounded in this assessment'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={newChat}
              disabled={!messages.length && !busy && !input && !files.length}
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              New chat
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen(false)}
              aria-label="Close assistant"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4"
        >
          {disabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The assistant isn&apos;t configured on this server yet. Once an administrator adds the AI key, you can ask
              questions about this assessment here. Everything else in the app works as usual.
            </div>
          )}

          {!messages.length && !disabled && (
            <div>
              <p className="text-sm text-slate-600">
                Ask about this assessment: the figures, how values and rankings are calculated, what to do in each
                step, and which NDI AI Employees fit.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {STARTERS[view].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    disabled={busy || reading}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-left text-xs font-medium text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <MessageList messages={messages} />

          {busy && (
            <div className="mr-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
              Thinking…
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-slate-200 px-4 py-3"
        >
          {error && (
            <p role="alert" className="mb-2 text-xs text-red-600">
              {error}
            </p>
          )}
          {files.length > 0 && (
            <ul aria-label="Files to send" className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex max-w-full items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-700"
                >
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 text-slate-400">{formatSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((p) => p.id !== f.id))}
                    disabled={busy}
                    aria-label={`Remove ${f.name}`}
                    className="shrink-0 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label htmlFor="assistant-input" className="sr-only">
            Message the assessment assistant
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={2}
            value={input}
            maxLength={MAX_MESSAGE_CHARS}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={disabled ? 'Not available yet' : 'Ask about this assessment…'}
            className="block max-h-40 min-h-[3.5rem] w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
          />
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            aria-label="Attach files"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || reading || disabled || files.length >= MAX_FILES}
              className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <PaperclipIcon className="h-3.5 w-3.5" />
              {reading ? 'Reading…' : 'Attach files'}
            </button>
            <button
              type="submit"
              disabled={busy || reading || disabled || (!input.trim() && !files.length)}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Enter sends, Shift+Enter adds a line. Up to 3 files (PDF, image, TXT, MD, CSV, TSV, JSON), 5 MB each, 8 MB
            total. Answers can be wrong; check them against the figures.
          </p>
        </form>
      </aside>
    </>
  );
}

/** Memoized, so editing the FTE sliders (which updates the store) doesn't re-render the chat. */
const MessageList = memo(function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <>
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="ml-auto max-w-[85%] rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.files && m.files.length > 0 && (
              <p className="mt-1 break-words text-xs text-indigo-100">Attached: {m.files.join(', ')}</p>
            )}
          </div>
        ) : (
          <div
            key={m.id}
            className="mr-auto w-full max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700"
          >
            <AssistantMarkdown
              text={m.content}
              onDownload={(content, ext, mime) => downloadText(content, `assistant-output.${ext}`, mime)}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => downloadText(m.content, 'assistant-answer.md', 'text/markdown')}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Download answer
              </button>
            </div>
          </div>
        ),
      )}
    </>
  );
});

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 3v-3h0a2 2 0 0 1-2-2v-6Z"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <path strokeLinecap="round" d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.7-1.7l5.5-5.5"
      />
    </svg>
  );
}
