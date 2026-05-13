import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface AppSelectOption {
  value: string;
  label: string;
}

interface AppSelectProps {
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export default function AppSelect({
  value,
  options,
  onChange,
  className = '',
  disabled = false,
  ariaLabel,
}: AppSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex] ?? options[0];

  const activeId = useMemo(
    () => `${id}-option-${selected?.value || 'empty'}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
    [id, selected?.value],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const moveSelection = (delta: number) => {
    if (!options.length) return;
    const current = options.findIndex((option) => option.value === value);
    const base = current >= 0 ? current : 0;
    const next = (base + delta + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-activedescendant={open ? activeId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        style={{
          backgroundColor: disabled ? '#f8fafc' : '#ffffff',
          color: disabled ? '#94a3b8' : '#0f172a',
        }}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveSelection(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveSelection(-1);
          } else if (event.key === 'Escape') {
            setOpen(false);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between gap-2 bg-white text-left text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ''}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-900 shadow-lg ring-1 ring-black/5"
          style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
        >
          <ul role="listbox" aria-label={ariaLabel}>
            {options.map((option) => {
              const isSelected = option.value === value;
              const optionId = `${id}-option-${option.value || 'empty'}`.replace(/[^a-zA-Z0-9_-]/g, '-');
              return (
                <li key={option.value || '__empty'} id={optionId} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={{
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      color: isSelected ? '#1e40af' : '#1f2937',
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 ${
                      isSelected ? 'bg-primary-50 text-primary-800' : 'text-slate-800'
                    }`}
                  >
                    <Check className={`h-4 w-4 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                    <span className="min-w-0 truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
