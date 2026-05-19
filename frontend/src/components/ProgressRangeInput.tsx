interface ProgressRangeInputProps {
  value: number | string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
}

function normalizeProgress(value: number | string): number {
  const numeric = typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : 0;
  return Math.min(100, Math.max(0, Math.round(numeric / 10) * 10));
}

export default function ProgressRangeInput({
  value,
  onChange,
  disabled,
  required,
  className = 'flex items-center gap-3',
  inputClassName = 'flex-1 accent-primary-600',
}: ProgressRangeInputProps) {
  const progress = normalizeProgress(value);

  return (
    <div className={className}>
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={progress}
        onChange={(event) => onChange(String(normalizeProgress(event.target.value)))}
        disabled={disabled}
        required={required}
        className={inputClassName}
      />
      <span className="w-12 text-right text-sm font-semibold text-slate-900">{progress}%</span>
    </div>
  );
}
