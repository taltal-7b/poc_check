import { useState, useEffect, useRef } from 'react';
import { Plus, Search, ExternalLink, Calendar, List } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { issuesApi, projectsApi, issueStatusesApi, usersApi, ganttApi } from '../../lib/api';
import CreateIssueModal from '../../components/issues/CreateIssueModal';
import Loading from '../../components/ui/Loading';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';

export default function IssueListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('gantt');
  const [ganttViewMode, setGanttViewMode] = useState<'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month'>('Day');

  // Filters
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [assignedToId, setAssignedToId] = useState('');

  // Master data for filters
  const [projects, setProjects] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Gantt chart refs
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const ganttInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (viewMode === 'list') {
      loadIssues();
    }
    loadFilters();
  }, [page, search, projectId, statusId, assignedToId, viewMode]);

  // Fetch gantt data
  const { data: ganttData, isLoading: ganttLoading, refetch: refetchGantt, error: ganttError } = useQuery({
    queryKey: ['gantt', projectId, statusId, assignedToId, searchParams.toString()],
    queryFn: async () => {
      const params: any = {};
      // Note: The backend gantt API doesn't support these filters yet
      // We'll get all issues and filter on the frontend if needed

      const response = await ganttApi.getAll(params);
      return response.data.data;
    },
    enabled: viewMode === 'gantt',
  });

  useEffect(() => {
    // Check if openModal query parameter is present
    if (searchParams.get('openModal') === 'true') {
      setIsCreateModalOpen(true);
      // Remove the query parameter
      searchParams.delete('openModal');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  const loadFilters = async () => {
    try {
      const [projectsRes, statusesRes, usersRes] = await Promise.all([
        projectsApi.getAll(),
        issueStatusesApi.getAll(),
        usersApi.getAll(),
      ]);
      setProjects(projectsRes.data.data.projects || []);
      setStatuses(statusesRes.data.data.statuses || []);
      setUsers(usersRes.data.data.users || []);
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  const loadIssues = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (projectId) params.projectId = projectId;
      if (statusId) params.statusId = statusId;
      if (assignedToId) params.assignedToId = assignedToId;

      const response = await issuesApi.getAll(params);
      const { issues: issuesList, pagination } = response.data.data;

      setIssues(issuesList || []);
      setTotalPages(pagination.pages);
      setTotal(pagination.total);
    } catch (err: any) {
      console.error('Failed to load issues:', err);
      setError(err.response?.data?.message || '課題の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (filterName: string, value: string) => {
    setPage(1);
    switch (filterName) {
      case 'projectId':
        setProjectId(value);
        break;
      case 'statusId':
        setStatusId(value);
        break;
      case 'assignedToId':
        setAssignedToId(value);
        break;
    }
  };

  const getStatusColor = (status: any) => {
    if (!status) return 'gray';
    if (status.isClosed) return 'gray';
    if (status.name === '新規') return 'blue';
    if (status.name === '進行中') return 'yellow';
    if (status.name === 'レビュー中') return 'purple';
    if (status.name === '完了') return 'green';
    return 'gray';
  };

  const getPriorityColor = (priority: any) => {
    if (!priority) return 'gray';
    if (priority.name === '低') return 'gray';
    if (priority.name === '通常') return 'blue';
    if (priority.name === '高') return 'orange';
    if (priority.name === '緊急' || priority.name === '至急') return 'red';
    return 'gray';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
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

  const normalizeProgress = (value: number) => {
    const raw = Number.isFinite(value) ? value : 0;
    const percent = raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, Math.round(percent)));
  };

  // Initialize and update gantt chart
  useEffect(() => {
    if (viewMode !== 'gantt' || !ganttData) {
      return;
    }

    // Wait for container to be available
    if (!ganttContainerRef.current) {
      const timeoutId = setTimeout(() => {
        if (ganttContainerRef.current) {
          refetchGantt();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }

    // Dynamically import frappe-gantt
    import('frappe-gantt').then((module) => {
      const GanttClass = module.default || module.Gantt || module;
      if (!GanttClass) {
        console.error('Failed to load Gantt class from frappe-gantt');
        return;
      }

      // Convert API data to frappe-gantt format
      if (!ganttData.tasks || ganttData.tasks.length === 0) {
        return;
      }

      // Ensure container is still available
      if (!ganttContainerRef.current) {
        return;
      }

      const tasks = ganttData.tasks.map((task: any) => {
        const createdDate = task.createdOn || task.created_on;
        const startDate =
          normalizeDateString(task.start_date) ||
          normalizeDateString(createdDate) ||
          formatDateLocal(new Date());

        // Calculate duration in days
        const durationRaw = Number(task.duration);
        const durationDays = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 7;
        
        // frappe-gantt expects duration as a string like "4d" (days), not a number
        const taskObj: any = {
          id: task.id.toString(),
          name: (task.text || `課題 #${task.id}`).substring(0, 50),
          start: startDate,
          duration: `${durationDays}d`, // frappe-gantt expects string format like "4d"
          progress: normalizeProgress(task.progress), // 0-100 range
        };
        
        console.log(`[Gantt] Task ${task.id}:`, {
          original: { start_date: task.start_date, duration: task.duration, text: task.text, progress: task.progress },
          converted: taskObj
        });
        
        return taskObj;
      });

      console.log('[Gantt] Converted tasks for rendering:', tasks);
      // Destroy existing instance if any
      if (ganttInstanceRef.current && ganttContainerRef.current) {
        ganttContainerRef.current.innerHTML = '';
        ganttInstanceRef.current = null;
      }

      // Ensure container is still available
      if (!ganttContainerRef.current) {
        return;
      }

      // Create new gantt instance
      try {
         console.log('[Gantt] Creating gantt instance with', tasks.length, 'tasks');
         console.log('[Gantt] Tasks data:', JSON.stringify(tasks, null, 2));
         
        const gantt = new GanttClass(ganttContainerRef.current, tasks, {
          view_mode: ganttViewMode,
          header_height: 50,
          column_width: 30,
          step: 24,
          bar_height: 32, // Increased from 24 to 32 for better visibility
          bar_corner_radius: 3,
          arrow_curve: 5,
          padding: 18,
          date_format: 'YYYY-MM-DD',
          language: 'ja',
          scroll_to_date: new Date(), // Scroll to today's date by default
          on_click: (task: any) => {
            if (task?.id) {
              navigate(`/issues/${task.id}`);
            }
          },
          custom_popup_html: (task: any) => {
            return `
              <div class="popup-details" style="padding: 8px; min-width: 200px;">
                <h5 style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">${task.name}</h5>
                <p style="margin: 4px 0; font-size: 12px;">開始日: ${task._start ? task._start.format('YYYY-MM-DD') : 'N/A'}</p>
                <p style="margin: 4px 0; font-size: 12px;">期日: ${task._end ? task._end.format('YYYY-MM-DD') : 'N/A'}</p>
                <p style="margin: 4px 0; font-size: 12px;">進捗率: ${Math.round(task.progress || 0)}%</p>
              </div>
            `;
          },
        });
         
        console.log('[Gantt] Gantt instance created successfully');
        
        // Scroll to today's date after a short delay to ensure rendering is complete
        setTimeout(() => {
          try {
            if (gantt && typeof gantt.scroll_to_date === 'function') {
              gantt.scroll_to_date(new Date());
              console.log('[Gantt] Scrolled to today\'s date');
            }
          } catch (error) {
            console.warn('[Gantt] Could not scroll to today:', error);
          }
        }, 100);
        
        // Verify rendering after a delay
        setTimeout(() => {
           const svg = ganttContainerRef.current?.querySelector('svg');
           if (svg) {
             const bars = svg.querySelectorAll('.bar');
             const barWrappers = svg.querySelectorAll('.bar-wrapper');
             console.log('[Gantt] SVG created');
             console.log('[Gantt] Bar wrappers found:', barWrappers.length);
             console.log('[Gantt] Bars found:', bars.length);
             
             if (bars.length === 0) {
               console.error('[Gantt] No bars rendered!');
               console.log('[Gantt] SVG structure:', {
                 width: svg.getAttribute('width'),
                 height: svg.getAttribute('height'),
                 children: svg.children.length,
               });
               // Log first 1000 chars of SVG to see structure
               console.log('[Gantt] SVG innerHTML sample:', svg.innerHTML.substring(0, 1000));
             } else {
               console.log('[Gantt] SUCCESS: Bars are rendered!');
               bars.forEach((bar, i) => {
                 if (i < 3) { // Log first 3 bars
                   console.log(`[Gantt] Bar ${i}:`, {
                     x: bar.getAttribute('x'),
                     y: bar.getAttribute('y'),
                     width: bar.getAttribute('width'),
                     height: bar.getAttribute('height'),
                     fill: bar.getAttribute('fill'),
                   });
                 }
               });
             }
           } else {
             console.error('[Gantt] No SVG element found!');
           }
         }, 300);

        ganttInstanceRef.current = gantt;

        // Force bars to be visible and apply colors
        setTimeout(() => {
          if (!ganttContainerRef.current) {
            console.error('[Gantt] Container ref is null');
            return;
          }
          
          // Check container dimensions
          const containerRect = ganttContainerRef.current.getBoundingClientRect();
          console.log('[Gantt] Container dimensions:', {
            width: containerRect.width,
            height: containerRect.height,
            visible: containerRect.width > 0 && containerRect.height > 0,
          });
          
          const svg = ganttContainerRef.current.querySelector('svg');
          if (!svg) {
            console.error('[Gantt] No SVG found');
            return;
          }
          
          // Check SVG dimensions
          const svgRect = svg.getBoundingClientRect();
          const svgWidth = svg.getAttribute('width');
          const svgHeight = svg.getAttribute('height');
          console.log('[Gantt] SVG dimensions:', {
            width: svgWidth,
            height: svgHeight,
            boundingRect: { width: svgRect.width, height: svgRect.height },
          });
          
          // Find ALL rect elements that could be bars
          const allRects = svg.querySelectorAll('rect');
          console.log('[Gantt] Found', allRects.length, 'rect elements total');
          
          // Find bars specifically
          const bars = svg.querySelectorAll('.bar, .bar-progress, rect.bar, rect.bar-progress');
          console.log('[Gantt] Found', bars.length, 'bar elements');
          
          // Log first few bars to see their properties
          bars.forEach((bar, i) => {
            if (i < 5) {
              const barElement = bar as SVGElement;
              const rect = barElement.getBoundingClientRect();
              console.log(`[Gantt] Bar ${i}:`, {
                class: barElement.getAttribute('class'),
                fill: barElement.getAttribute('fill'),
                x: barElement.getAttribute('x'),
                y: barElement.getAttribute('y'),
                width: barElement.getAttribute('width'),
                height: barElement.getAttribute('height'),
                boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                visible: rect.width > 0 && rect.height > 0,
              });
            }
          });
          
          // Apply default color to all bars first
          allRects.forEach((rect) => {
            const rectElement = rect as SVGElement;
            const classes = rectElement.getAttribute('class') || '';
            
            // Check if this is a bar or bar-progress element
            if (classes.includes('bar') || classes.includes('bar-progress')) {
              const currentFill = rectElement.getAttribute('fill');
              // Force fill attribute (SVG requires attribute, not just style)
              if (!currentFill || currentFill === 'null' || currentFill === 'none') {
                rectElement.setAttribute('fill', '#3b82f6');
                console.log(`[Gantt] Set fill on bar:`, {
                  x: rectElement.getAttribute('x'),
                  y: rectElement.getAttribute('y'),
                  oldFill: currentFill,
                  newFill: '#3b82f6',
                });
              }
              rectElement.setAttribute('stroke', '#2563eb');
              rectElement.style.fill = '#3b82f6';
              rectElement.style.stroke = '#2563eb';
              rectElement.style.opacity = '1';
              rectElement.style.visibility = 'visible';
              rectElement.style.display = 'block';
            }
          });
          
          // Apply custom colors per task
          tasks.forEach((task) => {
            const originalTask = ganttData.tasks.find((t: any) => t.id.toString() === task.id);
            const color = originalTask?.color || '#3b82f6';
            
            // Find bars by task ID - frappe-gantt uses data-id on bar-wrapper
            const barWrappers = svg.querySelectorAll(`[data-id="${task.id}"]`);
            console.log(`[Gantt] Found ${barWrappers.length} wrappers for task ${task.id}`);
            
            barWrappers.forEach((wrapper) => {
              const bars = wrapper.querySelectorAll('rect.bar, rect.bar-progress, .bar, .bar-progress');
              console.log(`[Gantt] Found ${bars.length} bars in wrapper for task ${task.id}`);
              bars.forEach((bar) => {
                const barElement = bar as SVGElement;
                // CRITICAL: Set fill attribute (not just style) for SVG
                barElement.setAttribute('fill', color);
                barElement.setAttribute('stroke', color);
                barElement.style.fill = color;
                barElement.style.stroke = color;
                barElement.style.opacity = '1';
                barElement.style.visibility = 'visible';
                
                const rect = barElement.getBoundingClientRect();
                console.log(`[Gantt] Applied color ${color} to bar for task ${task.id}`, {
                  fill: barElement.getAttribute('fill'),
                  x: barElement.getAttribute('x'),
                  y: barElement.getAttribute('y'),
                  width: barElement.getAttribute('width'),
                  height: barElement.getAttribute('height'),
                  boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  visible: rect.width > 0 && rect.height > 0,
                });
              });
            });
          });
          
          // Final check: ensure all bars have fill
          const finalBars = svg.querySelectorAll('rect.bar, rect.bar-progress');
          let filledCount = 0;
          let visibleCount = 0;
          finalBars.forEach((bar) => {
            const barElement = bar as SVGElement;
            const fill = barElement.getAttribute('fill');
            const rect = barElement.getBoundingClientRect();
            if (fill && fill !== 'null' && fill !== 'none') {
              filledCount++;
            } else {
              // Force fill if still null
              barElement.setAttribute('fill', '#3b82f6');
              filledCount++;
            }
            if (rect.width > 0 && rect.height > 0) {
              visibleCount++;
            }
          });
          
          console.log('[Gantt] Final status:', {
            totalBars: finalBars.length,
            filledBars: filledCount,
            visibleBars: visibleCount,
          });
        }, 500);
      } catch (error) {
        console.error('[Frontend] Failed to initialize Gantt chart:', error);
      }
    }).catch((error) => {
      console.error('[Frontend] Failed to load frappe-gantt:', error);
    });
  }, [ganttData, ganttViewMode, viewMode, refetchGantt]);

  // Update gantt view mode
  const handleGanttViewModeChange = (mode: 'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month') => {
    setGanttViewMode(mode);
    if (ganttInstanceRef.current) {
      ganttInstanceRef.current.change_view_mode(mode);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">課題</h1>
        <div className="flex items-center space-x-4">
          {/* View mode switcher */}
          <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 ${
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List className="w-4 h-4" />
              <span>一覧</span>
            </button>
            <button
              onClick={() => setViewMode('gantt')}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 ${
                viewMode === 'gantt'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>ガント</span>
            </button>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>新規課題</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="課題を検索..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={projectId}
              onChange={(e) => handleFilterChange('projectId', e.target.value)}
              className="input"
            >
              <option value="">すべてのプロジェクト</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              value={statusId}
              onChange={(e) => handleFilterChange('statusId', e.target.value)}
              className="input"
            >
              <option value="">すべてのステータス</option>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
            <select
              value={assignedToId}
              onChange={(e) => handleFilterChange('assignedToId', e.target.value)}
              className="input"
            >
              <option value="">すべての担当者</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.lastName} {user.firstName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Gantt Chart View */}
      {viewMode === 'gantt' && (
        <>
          {/* View mode selector for gantt */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">表示モード:</span>
              {(['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleGanttViewModeChange(mode)}
                  className={`px-3 py-1 text-sm rounded-md ${
                    ganttViewMode === mode
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
          <div className="bg-white rounded-lg shadow-sm p-6">
            <style>{`
              .gantt-container {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
              }
              .gantt-container .gantt {
                width: 100%;
              }
              .gantt-container .grid-background {
                fill: none;
                pointer-events: none;
              }
              .gantt-container .grid-row {
                fill: #ffffff;
              }
              .gantt-container .grid-row:nth-child(even) {
                fill: #f9fafb;
              }
              .gantt-container .row-line {
                stroke: #e5e7eb;
              }
              .gantt-container .tick {
                stroke: #9ca3af;
                stroke-width: 0.5;
              }
              .gantt-container .today-highlight {
                fill: #fef3c7;
                opacity: 0.5;
              }
              .gantt-container .arrow {
                fill: none;
                stroke: #6b7280;
                stroke-width: 1.4;
              }
              .gantt-container .bar,
              .gantt-container svg .bar,
              .gantt-container .bar-wrapper .bar {
                fill: #3b82f6 !important;
                stroke: #2563eb !important;
                stroke-width: 0;
                rx: 3;
                opacity: 1 !important;
                visibility: visible !important;
                display: block !important;
              }
              .gantt-container .bar-progress,
              .gantt-container svg .bar-progress,
              .gantt-container .bar-wrapper .bar-progress {
                fill: #60a5fa !important;
                opacity: 0.8 !important;
                visibility: visible !important;
                display: block !important;
              }
              .gantt-container .bar-invalid {
                fill: transparent;
                stroke: #ef4444;
                stroke-width: 2;
                stroke-dasharray: 5;
              }
              .gantt-container .bar-label {
                fill: #111827;
                dominant-baseline: central;
                text-anchor: middle;
                font-size: 11px;
                font-weight: 500;
                paint-order: stroke;
                stroke: #ffffff;
                stroke-width: 2px;
                font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
              }
              .gantt-container .bar-label.big {
                fill: #374151;
                text-anchor: start;
                font-size: 12px;
                font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
              }
              .gantt-container .handle {
                fill: #fff;
                cursor: ew-resize;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s ease;
              }
              .gantt-container .bar-wrapper .bar-progress:hover .handle,
              .gantt-container .bar-wrapper .bar:hover .handle {
                visibility: visible;
                opacity: 1;
              }
              .gantt-container .upper-text,
              .gantt-container .lower-text {
                font-size: 11px;
                fill: #374151;
              }
              .gantt-container .upper-text {
                font-weight: 500;
              }
              .gantt-container .lower-text {
                fill: #6b7280;
              }
              .popup-details {
                padding: 8px;
                min-width: 200px;
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
            {ganttError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
                <p className="font-medium">エラーが発生しました</p>
                <p className="text-sm mt-1">
                  {ganttError instanceof Error ? ganttError.message : 'ガントチャートデータの読み込みに失敗しました'}
                </p>
                <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(ganttError, null, 2)}</pre>
              </div>
            )}
            {ganttLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loading />
              </div>
            ) : !ganttData ? (
              <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                <Calendar className="h-16 w-16 mb-4 text-gray-300" />
                <p className="text-lg font-medium">データを取得中です...</p>
                <p className="text-sm mt-2">
                  {ganttError ? 'エラーが発生しています。ブラウザのコンソールを確認してください。' : 'データを取得中です...'}
                </p>
              </div>
            ) : ganttData?.tasks?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                <Calendar className="h-16 w-16 mb-4 text-gray-300" />
                <p className="text-lg font-medium">ガントチャートに表示する課題がありません</p>
                <p className="text-sm mt-2">
                  課題が存在しないか、開始日・期日が設定されていない可能性があります
                </p>
                <p className="text-xs mt-1 text-gray-400">
                  データ: {JSON.stringify(ganttData, null, 2)}
                </p>
              </div>
            ) : (
                        <div className="overflow-x-auto bg-white rounded-lg" style={{ maxHeight: '1200px', overflowY: 'auto' }}>
                          <div
                            ref={ganttContainerRef}
                            className="gantt-host"
                            style={{ 
                              minHeight: '1000px',
                              width: '100%',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
                    ['--g-bar-color' as any]: '#3b82f6',
                    ['--g-bar-border' as any]: '#2563eb',
                    ['--g-progress-color' as any]: '#60a5fa'
                  }}
                ></div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Issues Table */}
      {viewMode === 'list' && (
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-12">
            <Loading />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      プロジェクト
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      トラッカー
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      題名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ステータス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      担当者
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      優先度
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      更新日
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {issues.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        課題がありません
                      </td>
                    </tr>
                  ) : (
                    issues.map((issue) => (
                      <tr key={issue.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <Link
                            to={`/issues/${issue.id}`}
                            className="text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            #{issue.id}
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {issue.project?.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {issue.tracker?.name || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="max-w-md truncate">
                            {issue.subject}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge color={getStatusColor(issue.status)}>
                            {issue.status?.name || '-'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(() => {
                            const assignedUser =
                              issue.assignedTo ||
                              users.find((user) => user.id === issue.assignedToId);
                            return assignedUser
                              ? `${assignedUser.lastName} ${assignedUser.firstName}`
                              : '未割り当て';
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge color={getPriorityColor(issue.priority)}>
                            {issue.priority?.name || '-'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(issue.updatedOn)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Show total count */}
      {viewMode === 'list' && !loading && issues.length > 0 && (
        <div className="text-sm text-gray-600 text-center">
          全 {total} 件の課題
        </div>
      )}

      {/* Gantt Chart Styles */}
      {viewMode === 'gantt' && (
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
      )}

      {/* Create Issue Modal */}
      <CreateIssueModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadIssues();
        }}
      />
    </div>
  );
}


