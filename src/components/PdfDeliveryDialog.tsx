'use client';

import { useEffect, useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-indigo-600' : 'bg-slate-300'
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function PdfDeliveryDialog({
  open,
  onClose,
  companyName,
}: {
  open: boolean;
  onClose: () => void;
  companyName: string;
}) {
  const [downloadOn, setDownloadOn] = useState(true);
  const [emailOn, setEmailOn] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const emailValid = EMAIL_RE.test(email.trim());
  const consentEnabled = emailOn && emailValid;

  useEffect(() => {
    if (!consentEnabled) setConsent(false);
  }, [consentEnabled]);

  useEffect(() => {
    if (!open) {
      setDownloadOn(true);
      setEmailOn(false);
      setEmail('');
      setConsent(false);
      setStatus('idle');
      setErrorMsg('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canContinue = (downloadOn || (emailOn && emailValid)) && status !== 'sending';

  async function handleContinue() {
    if (downloadOn) window.print();

    if (emailOn && emailValid) {
      setStatus('sending');
      setErrorMsg('');
      try {
        const res = await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), consent, companyName }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || 'Failed to send the email.');
        setStatus('sent');
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Failed to send the email.');
      }
      return;
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-slate-900">Get your assessment PDF</h3>
        <p className="mt-1 text-sm text-slate-500">Choose how you&apos;d like to receive it.</p>

        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Download now</p>
              <p className="text-xs text-slate-500">Opens the print dialog on this device.</p>
            </div>
            <Switch checked={downloadOn} onChange={setDownloadOn} label="Download now" />
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Send via email</p>
                <p className="text-xs text-slate-500">We&apos;ll email you a copy.</p>
              </div>
              <Switch checked={emailOn} onChange={setEmailOn} label="Send via email" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!emailOn}
              placeholder="you@company.com"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
            {emailOn && email.trim() && !emailValid && (
              <p className="mt-1 text-xs text-red-600">Enter a valid email address.</p>
            )}
          </div>

          <label
            className={`flex items-start gap-2 text-xs ${
              consentEnabled ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={!consentEnabled}
              className="mt-0.5 disabled:cursor-not-allowed"
            />
            NDI and Pioneers may contact me
          </label>

          {status === 'sent' && (
            <p className="text-xs font-medium text-emerald-600">Sent to {email.trim()}.</p>
          )}
          {status === 'error' && <p className="text-xs font-medium text-red-600">{errorMsg}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {status === 'sent' ? 'Close' : 'Cancel'}
          </button>
          {status !== 'sent' && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {status === 'sending' ? 'Sending…' : 'Continue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
