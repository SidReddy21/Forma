import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function IconButton({
  label,
  children,
  active = false,
  ...props
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={'icon-button' + (active ? ' active' : '')}
      {...props}
    >
      {children}
    </button>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={() => {
          const number = Number(draft);
          if (draft.trim() && Number.isFinite(number))
            onChange(Math.max(min ?? -100000, Math.min(max ?? 100000, number)));
          else setDraft(String(value));
        }}
      />
    </label>
  );
}
export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
export function ColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  return (
    <label className="color-field">
      <input
        type="color"
        aria-label={label}
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{value === 'transparent' ? 'None' : value.replace('#', '').toUpperCase()}</span>
    </label>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>('button, input, select, textarea');
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
