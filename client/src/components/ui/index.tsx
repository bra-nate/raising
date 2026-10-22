import { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconEye, IconEyeOff, IconX } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Button hierarchy (Relate discipline):
 * - primary: the single filled blue-gradient CTA per view.
 * - secondary: outlined dark-border action — the workhorse.
 * - ghost: text/accent only, low emphasis.
 * - danger: text-weight destructive, coral.
 */
export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-btn text-body font-medium transition duration-150 focus:outline-none focus-visible:shadow-focus disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<Variant, string> = {
    primary: 'btn-gradient text-white px-5 py-2.5 font-semibold hover:brightness-105 active:brightness-95',
    secondary:
      'bg-surface/80 text-action-ink border border-action px-4 py-2.5 hover:bg-wash active:bg-wash/70',
    ghost: 'text-accent px-3 py-2 hover:bg-accent/10',
    danger: 'text-concern px-3 py-2 hover:bg-concern/10',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-input border border-border bg-surface px-3.5 py-2.5 text-body text-ink-2 outline-none transition placeholder:text-faint focus:border-info focus:shadow-focus ${className}`}
      {...props}
    />
  );
}

/** Password field with a reveal toggle — the only way to catch a typo in a masked field. */
export function PasswordInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <Input type={shown ? 'text' : 'password'} className={`pr-10 ${className}`} {...props} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        title={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-input text-muted transition hover:text-ink-2 focus:outline-none focus-visible:shadow-focus"
      >
        {shown ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
      </button>
    </span>
  );
}

/** One shimmering block. Sized by the caller. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-input bg-wash ${className}`} aria-hidden />;
}

/**
 * Placeholder for a list, table or panel that is still loading. Rows taper so
 * it reads as content rather than a block, and the region is announced as busy.
 */
export function SkeletonRows({ rows = 5, className = 'p-5' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`h-5 ${i === rows - 1 ? 'w-2/5' : i % 3 === 1 ? 'w-4/5' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-input border border-border bg-surface px-3.5 py-2.5 text-body text-ink-2 outline-none transition focus:border-info focus:shadow-focus ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-body font-medium text-slateink">{label}</span>
      {children}
      {hint && <span className="block text-caption text-faint">{hint}</span>}
    </label>
  );
}

type Tone = 'neutral' | 'good' | 'attention' | 'concern' | 'info';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-slateink/10 text-muted',
    good: 'bg-good/10 text-good',
    attention: 'bg-attention/10 text-attention',
    concern: 'bg-concern/10 text-concern',
    info: 'bg-info/10 text-info',
  };
  return (
    <span className={`inline-flex items-center rounded-badge px-1.5 py-0.5 text-caption font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({
  children,
  className = '',
  as: As = 'div',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
  interactive?: boolean;
}) {
  return (
    <As
      className={`rounded-card border border-hairline bg-surface shadow-card ${
        interactive ? 'transition hover:border-accent/40 hover:shadow-elevated' : ''
      } ${className}`}
    >
      {children}
    </As>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      const returnFocus = returnFocusRef.current;
      requestAnimationFrame(() => returnFocus?.isConnected && returnFocus.focus());
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-modal border border-hairline bg-surface p-7 text-ink shadow-elevated animate-scale-in"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-heading-sm font-semibold text-ink-2">{title}</h2>
          {description && <p id={descriptionId} className="mt-1 text-body text-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-muted transition hover:bg-wash hover:text-ink-2 focus:outline-none focus-visible:shadow-focus"
        >
          <IconX className="h-5 w-5" />
        </button>
      </div>
      {children}
    </dialog>,
    document.body
  );
}
