import { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

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
    'inline-flex items-center justify-center gap-1.5 rounded-btn text-body font-medium transition duration-150 focus:outline-none focus-visible:shadow-focus disabled:opacity-50 disabled:cursor-not-allowed';
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
  if (!open) return null;
  // Portal to <body> so `position: fixed` is not trapped by any ancestor
  // that establishes a containing block (e.g. a transform on AppShell).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="my-8 max-h-[calc(100vh-4rem)] w-full max-w-md overflow-y-auto rounded-modal border border-hairline bg-surface p-7 shadow-elevated animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-5">
          <h2 className="text-heading-sm font-semibold text-ink-2">{title}</h2>
          {description && <p className="mt-1 text-body text-muted">{description}</p>}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
