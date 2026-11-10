/** Shared building blocks for every page: one look, defined once. */
import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon, XMarkIcon,
} from '@heroicons/react/20/solid';
import { DocumentIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { isImage } from '../utils/api';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ── Buttons ──────────────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'success';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-200 shadow-sm hover:bg-ink-50 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-300',
  dark: 'bg-ink-900 text-white shadow-sm hover:bg-ink-800 disabled:bg-ink-400',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-300',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest }) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={cx('inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap',
      variants[variant], sizes[size], className)}
  >
    {loading ? <Spinner className="h-4 w-4" /> : Icon && <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />}
    {children}
  </button>
);

// ── Form controls ────────────────────────────────────────────────────────────
const control = 'block w-full rounded-lg border-0 bg-white text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 '
  + 'transition-shadow focus:ring-2 focus:ring-inset focus:ring-brand-500 disabled:bg-ink-50 disabled:text-ink-500';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; inputSize?: Size }>(
  ({ className, invalid, inputSize = 'md', ...rest }, ref) => (
    <input ref={ref} {...rest}
      className={cx(control, inputSize === 'lg' ? 'h-12 px-4 text-base' : inputSize === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-3 text-sm',
        invalid && 'ring-amber-400 focus:ring-amber-500', className)} />
  ));
Input.displayName = 'Input';

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { selectSize?: Size }> = ({ className, selectSize = 'md', children, ...rest }) => (
  <select {...rest} className={cx(control, 'pr-8', selectSize === 'sm' ? 'h-8 pl-2.5 text-[13px]' : 'h-10 pl-3 text-sm', className)}>
    {children}
  </select>
);

export const Field: React.FC<{ label: string; htmlFor?: string; hint?: React.ReactNode; warning?: React.ReactNode; optional?: boolean; children: React.ReactNode }> =
  ({ label, htmlFor, hint, warning, optional, children }) => (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-ink-700">
        {label}
        {optional && <span className="text-xs font-normal text-ink-400">Optional</span>}
      </label>
      {children}
      {warning ? <p className="mt-1.5 text-xs text-amber-700">{warning}</p> : hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );

export const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; className?: string }> =
  ({ checked, onChange, children, className }) => (
    <label className={cx('flex cursor-pointer items-start gap-3', className)}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none accent-brand-600" />
      <span className="text-sm text-ink-700">{children}</span>
    </label>
  );

// ── Surfaces ─────────────────────────────────────────────────────────────────
export const Card: React.FC<{ className?: string; children: React.ReactNode; padded?: boolean }> = ({ className, children, padded = true }) => (
  <div className={cx('rounded-2xl bg-white shadow-soft ring-1 ring-ink-100', padded && 'p-6', className)}>{children}</div>
);

export const CardHeader: React.FC<{ title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }> = ({ title, description, actions }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
    </div>
    {actions}
  </div>
);

export const PageHeader: React.FC<{ eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }> =
  ({ eyebrow, title, description, actions }) => (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">{eyebrow}</p>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink-950">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );

// ── Status ───────────────────────────────────────────────────────────────────
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
const badgeTones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100',
  danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-100',
};

export const Badge: React.FC<{ tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }> = ({ tone = 'neutral', dot, className, children }) => (
  <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', badgeTones[tone], className)}>
    {dot && <span className={cx('h-1.5 w-1.5 rounded-full', {
      neutral: 'bg-ink-400', brand: 'bg-brand-500', success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-red-500',
    }[tone])} />}
    {children}
  </span>
);

const alertStyle: Record<Exclude<Tone, 'neutral' | 'brand'> | 'info', { box: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }> = {
  info: { box: 'bg-brand-50/70 ring-brand-100 text-brand-900', icon: InformationCircleIcon, iconColor: 'text-brand-500' },
  success: { box: 'bg-emerald-50 ring-emerald-100 text-emerald-900', icon: CheckCircleIcon, iconColor: 'text-emerald-500' },
  warning: { box: 'bg-amber-50 ring-amber-100 text-amber-900', icon: ExclamationTriangleIcon, iconColor: 'text-amber-500' },
  danger: { box: 'bg-red-50 ring-red-100 text-red-900', icon: XCircleIcon, iconColor: 'text-red-500' },
};

export const Alert: React.FC<{ tone?: 'info' | 'success' | 'warning' | 'danger'; title?: React.ReactNode; onClose?: () => void; className?: string; children?: React.ReactNode }> =
  ({ tone = 'info', title, onClose, className, children }) => {
    const s = alertStyle[tone];
    return (
      <div className={cx('flex gap-3 rounded-xl p-4 ring-1 ring-inset animate-fade-in', s.box, className)} role={tone === 'danger' ? 'alert' : 'status'}>
        <s.icon className={cx('mt-0.5 h-5 w-5 flex-none', s.iconColor)} />
        <div className="min-w-0 flex-1 text-sm">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cx(!!title && 'mt-1', 'opacity-90')}>{children}</div>}
        </div>
        {onClose && (
          <button onClick={onClose} className="-m-1 h-7 w-7 flex-none rounded-md p-1 opacity-60 hover:bg-black/5 hover:opacity-100" aria-label="Dismiss">
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    );
  };

export const Spinner: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-400">
    <Spinner className="h-7 w-7 text-brand-500" />
    <span className="text-sm">{label}…</span>
  </div>
);

export const EmptyState: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; description?: React.ReactNode; action?: React.ReactNode }> =
  ({ icon: Icon, title, description, action }) => (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 ring-1 ring-ink-100">
        <Icon className="h-6 w-6 text-ink-400" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );

export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: 'brand' | 'warning' }> =
  ({ label, value, hint, icon: Icon, tone = 'brand' }) => (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {Icon && (
          <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg',
            tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-brand-50 text-brand-600')}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="tabular mt-3 text-[28px] font-semibold leading-none tracking-tight text-ink-950">{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
    </Card>
  );

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-ink-100/70 p-1">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx('flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium transition-all',
            value === o.value ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-800')}>
          {o.label}
          {o.count !== undefined && (
            <span className={cx('tabular rounded px-1.5 text-[11px]', value === o.value ? 'bg-ink-100 text-ink-600' : 'bg-ink-200/60 text-ink-500')}>
              {o.count.toLocaleString()}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Artwork image with a clean fallback: PDFs show a document tile, and a file that
 * can't be loaded shows a quiet "image unavailable" tile instead of a broken image.
 */
export const Artwork: React.FC<{ src: string; alt: string; className?: string; iconClass?: string; label?: boolean }> =
  ({ src, alt, className, iconClass = 'h-6 w-6', label }) => {
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => setFailed(false), [src]);
    if (!isImage(src) || failed) {
      return (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-300">
          {isImage(src) ? <PhotoIcon className={iconClass} /> : <DocumentIcon className={iconClass} />}
          {label && <span className="text-xs text-ink-400">{isImage(src) ? 'Image unavailable' : 'PDF'}</span>}
        </span>
      );
    }
    return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
  };

/** Small artwork preview for tables. */
export const Thumb: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className = 'h-11 w-11' }) => (
  <div className={cx('art-bg flex flex-none items-center justify-center overflow-hidden rounded-lg ring-1 ring-ink-100', className)}>
    <Artwork src={src} alt={alt} className="h-full w-full object-cover" iconClass="h-5 w-5" />
  </div>
);

export const Avatar: React.FC<{ text: string; className?: string }> = ({ text, className = 'h-8 w-8 text-xs' }) => (
  <span className={cx('flex flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 font-semibold text-white', className)}>
    {text}
  </span>
);

// ── Dialog ───────────────────────────────────────────────────────────────────
export const Modal: React.FC<{ open: boolean; onClose: () => void; title?: React.ReactNode; description?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl'; footer?: React.ReactNode; children?: React.ReactNode;
  /** Field to focus when the dialog opens (otherwise the first button, often Close). */
  initialFocus?: React.MutableRefObject<HTMLElement | null> }> =
  ({ open, onClose, title, description, size = 'md', footer, children, initialFocus }) => (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50" initialFocus={initialFocus}>
        <Transition.Child as={Fragment} enter="ease-out duration-150" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-[2px]" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child as={Fragment} enter="ease-out duration-150" enterFrom="opacity-0 scale-[0.98]" enterTo="opacity-100 scale-100"
              leave="ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0 scale-[0.98]">
              <Dialog.Panel className={cx('w-full rounded-2xl bg-white shadow-lift ring-1 ring-ink-100',
                { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' }[size])}>
                {title && (
                  <div className="flex items-start justify-between gap-4 px-6 pt-5">
                    <div>
                      <Dialog.Title className="text-base font-semibold text-ink-950">{title}</Dialog.Title>
                      {description && <Dialog.Description className="mt-1 text-sm text-ink-500">{description}</Dialog.Description>}
                    </div>
                    <button onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
                <div className="px-6 py-5">{children}</div>
                {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-3.5">{footer}</div>}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );

/** Table pager: "1–25 of 4,435" with previous / next. */
export const Pager: React.FC<{ page: number; pageSize: number; total: number; onPage: (p: number) => void }> = ({ page, pageSize, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  return (
    <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3 text-[13px] text-ink-500">
      <span className="tabular">{from.toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="tabular px-2">{page} / {pages}</span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
};
