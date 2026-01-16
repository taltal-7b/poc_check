import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ganttApi, projectsApi } from '../../lib/api';
import { Calendar, RefreshCw, Plus } from 'lucide-react';

interface GanttTask {
  id: string;
  name: string;
  start: string;
  duration: string;
  progress: number;
  color?: string;
  custom_class?: string;
}

export default function GanttPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const ganttInstanceRef = useRef<any>(null);
  const [viewMode, setViewMode] = useState<'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month'>('Day');

  const normalizeProgress = (value: number) => {
    const raw = Number.isFinite(value) ? value : 0;
    const percent = raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, Math.round(percent)));
  };

  const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeDateString = (value?: string) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDateLocal(parsed);
  };

  // Fetch project info if projectId is provided
  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getById(parseInt(projectId!)),
    enabled: !!projectId,
  });

  // Fetch gantt data
  const { data: ganttData, isLoading, refetch } = useQuery({
    queryKey: ['gantt', projectId, searchParams.toString()],
    queryFn: async () => {
      if (projectId) {
        const response = await ganttApi.getByProject(parseInt(projectId), {
          start_date: searchParams.get('start_date'),
          due_date: searchParams.get('due_date'),
        });
        return response.data.data;
      } else {
        const response = await ganttApi.getAll({
          start_date: searchParams.get('start_date'),
          due_date: searchParams.get('due_date'),
        });
        return response.data.data;
      }
    },
  });

  // Initialize and update gantt chart
  useEffect(() => {
    if (!ganttContainerRef.current || !ganttData) return;

    // Dynamically import frappe-gantt
    import('frappe-gantt').then((module) => {
      const GanttClass = module.default || module.Gantt || module;
      if (!GanttClass) {
        console.error('Failed to load Gantt class from frappe-gantt');
        return;
      }

      // Convert API data to frappe-gantt format
      const tasks: GanttTask[] = ganttData.tasks.map((task: any) => {
        const normalizedStart =
          normalizeDateString(task.start_date) || formatDateLocal(new Date());
        const durationRaw = Number(task.duration);
        const durationDays = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 7;
        return {
          id: task.id.toString(),
          name: task.text || `課題 #${task.id}`,
          start: normalizedStart,
          duration: `${durationDays}d`,
          progress: normalizeProgress(task.progress),
          color: task.color || '#3b82f6',
          custom_class: task.color ? `gantt-task-${task.id}` : undefined,
        };
      });

      // Destroy existing instance if any
      if (ganttInstanceRef.current) {
        // Clear container
        if (ganttContainerRef.current) {
          ganttContainerRef.current.innerHTML = '';
        }
      }

      // Create new gantt instance
      try {
        const gantt = new GanttClass(ganttContainerRef.current, tasks, {
          view_mode: viewMode,
          header_height: 50,
          column_width: 30,
          step: 24,
          bar_height: 20,
          bar_corner_radius: 3,
          arrow_curve: 5,
          padding: 18,
          date_format: 'YYYY-MM-DD',
          language: 'ja',
          on_click: (task: any) => {
            if (task?.id) {
              navigate(`/issues/${task.id}`);
            }
          },
          scroll_to: 'start',
          custom_popup_html: (task: any) => {
            return `
              <div class="popup-details">
                <h5>${task.name}</h5>
                <p>開始日: ${task._start.format('YYYY-MM-DD')}</p>
                <p>期日: ${task._end.format('YYYY-MM-DD')}</p>
                <p>進捗率: ${Math.round(task.progress)}%</p>
              </div>
            `;
          },
        });

        ganttInstanceRef.current = gantt;

        // Add custom colors
        tasks.forEach((task) => {
          const originalTask = ganttData.tasks.find((t: any) => t.id.toString() === task.id);
          if (originalTask?.color) {
            const bar = ganttContainerRef.current?.querySelector(
              `.bar-wrapper[data-id="${task.id}"] .bar`
            ) as HTMLElement;
            if (bar) {
              bar.style.fill = originalTask.color;
              bar.style.stroke = originalTask.color;
              bar.style.borderColor = originalTask.color;
          }
          }
        });
      } catch (error) {
        console.error('Failed to initialize Gantt chart:', error);
      }
    }).catch((error) => {
      console.error('Failed to load frappe-gantt:', error);
    });
  }, [ganttData, viewMode]);

  // Update view mode
  const handleViewModeChange = (mode: 'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month') => {
    setViewMode(mode);
    if (ganttInstanceRef.current) {
      ganttInstanceRef.current.change_view_mode(mode);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Calendar className="h-6 w-6 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {projectId ? `ガントチャート - ${projectData?.data?.project?.name || '読み込み中...'}` : 'ガントチャート'}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  課題のスケジュールを時間軸に沿って表示します
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => navigate('/issues/new')}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>新規課題</span>
              </button>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>更新</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* View mode selector */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">表示モード:</span>
            {(['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                className={`px-3 py-1 text-sm rounded-md ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {mode === 'Quarter Day' ? '1/4日'
                  : mode === 'Half Day' ? '半日'
                  : mode === 'Day' ? '日'
                  : mode === 'Week' ? '週'
                  : '月'}
              </button>
            ))}
          </div>
        </div>

        {/* Gantt chart */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : ganttData?.tasks?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-gray-500">
              <Calendar className="h-16 w-16 mb-4 text-gray-300" />
              <p className="text-lg font-medium">ガントチャートに表示する課題がありません</p>
              <p className="text-sm mt-2">
                開始日または期日が設定された課題が表示されます
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div
                ref={ganttContainerRef}
                className="gantt-host"
                style={{
                  minHeight: '400px',
                  ['--g-bar-color' as any]: '#3b82f6',
                  ['--g-bar-border' as any]: '#2563eb',
                  ['--g-progress-color' as any]: '#60a5fa'
                }}
              ></div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .gantt-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
        }
        .gantt .grid-background {
          fill: none;
          pointer-events: none;
        }
        .gantt .grid-row {
          fill: #fff;
        }
        .gantt .grid-row:nth-child(even) {
          fill: #f9fafb;
        }
        .gantt .row-line {
          stroke: #e5e7eb;
        }
        .gantt .tick {
          stroke: #9ca3af;
          stroke-width: 0.5;
        }
        .gantt .today-highlight {
          fill: #fef3c7;
          opacity: 0.5;
        }
        .gantt .arrow {
          fill: none;
          stroke: #6b7280;
          stroke-width: 1.4;
        }
        .gantt .bar {
          fill: #3b82f6;
          stroke: #2563eb;
          stroke-width: 0;
          transition: stroke-width 0.3s ease;
        }
        .gantt .bar-progress {
          fill: #60a5fa;
        }
        .gantt-container .bar-wrapper .bar {
          fill: #3b82f6 !important;
          stroke: #2563eb !important;
        }
        .gantt-container .bar-wrapper .bar-progress {
          fill: #60a5fa !important;
        }
        .gantt .bar-invalid {
          fill: transparent;
          stroke: #ef4444;
          stroke-width: 2;
          stroke-dasharray: 5;
        }
        .gantt .bar-label {
          fill: #111827;
          dominant-baseline: central;
          text-anchor: middle;
          font-size: 12px;
          font-weight: 500;
          paint-order: stroke;
          stroke: #ffffff;
          stroke-width: 2px;
          font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
        }
        .gantt .bar-label.big {
          fill: #374151;
          text-anchor: start;
          font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
        }
        .gantt .handle {
          fill: #fff;
          cursor: ew-resize;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease;
        }
        .gantt .bar-wrapper .bar-progress:hover .handle,
        .gantt .bar-wrapper .bar:hover .handle {
          visibility: visible;
          opacity: 1;
        }
        .gantt .upper-text,
        .gantt .lower-text {
          font-size: 12px;
          fill: #374151;
        }
        .gantt .upper-text {
          font-weight: 500;
        }
        .popup-details {
          padding: 8px;
        }
        .popup-details h5 {
          margin: 0 0 8px 0;
          font-weight: 600;
          font-size: 14px;
        }
        .popup-details p {
          margin: 4px 0;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

