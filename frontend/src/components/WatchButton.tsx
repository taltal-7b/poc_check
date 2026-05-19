import { Bell, BellOff } from 'lucide-react';
import { useToggleWatcher, useWatcher, type WatchableType } from '../api/hooks';

type WatchButtonProps = {
  watchableType: WatchableType;
  watchableId: string;
  className?: string;
};

export default function WatchButton({ watchableType, watchableId, className = '' }: WatchButtonProps) {
  const watcherQuery = useWatcher(watchableType, watchableId);
  const toggleWatcher = useToggleWatcher();
  const watching = watcherQuery.data?.data?.watching ?? false;
  const disabled = !watchableId || watcherQuery.isLoading || toggleWatcher.isPending;
  const Icon = watching ? BellOff : Bell;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => toggleWatcher.mutate({ watchableType, watchableId, watching })}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-50 ${
        watching
          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      } ${className}`}
      title={watching ? 'ウォッチを解除' : 'ウォッチ'}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {watching ? 'ウォッチ中' : 'ウォッチ'}
    </button>
  );
}
