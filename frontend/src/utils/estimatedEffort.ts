export type EstimatedEffortUnit = 'hours' | 'days';

const HOURS_PER_DAY = 8;

function trimNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function parseEstimatedEffort(value: string, unit: EstimatedEffortUnit): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (unit === 'days') {
    const days = Number(trimmed);
    if (!Number.isFinite(days) || days < 0) return null;
    return days * HOURS_PER_DAY;
  }

  const hmMatch = /^(\d+):([0-5]\d)$/.exec(trimmed);
  if (hmMatch) {
    return Number(hmMatch[1]) + Number(hmMatch[2]) / 60;
  }

  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || hours < 0) return null;
  return hours;
}

export function formatEstimatedEffort(hours: number, unit: EstimatedEffortUnit): string {
  if (unit === 'days') return trimNumber(hours / HOURS_PER_DAY);

  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function convertEstimatedEffortInput(
  value: string,
  fromUnit: EstimatedEffortUnit,
  toUnit: EstimatedEffortUnit,
): string {
  if (fromUnit === toUnit) return value;
  const hours = parseEstimatedEffort(value, fromUnit);
  if (hours == null) return value;
  return formatEstimatedEffort(hours, toUnit);
}

export function estimatedEffortUnitLabel(unit: EstimatedEffortUnit): string {
  return unit === 'hours' ? '時間' : '日';
}
