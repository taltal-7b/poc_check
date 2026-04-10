import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  max,
  min,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { useProject, useProjectIssues, useTrackers, useStatuses, useVersions } from '../api/hooks';
import type { Issue, Tracker, IssueStatus, Version } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

type Zoom = 'month' | 'week' | 'day';

const trackerColors = ['bg-blue-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500'];
const trackerBarColors = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#06b6d4'];
const statusColors = ['bg-slate-400', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500'];
const statusBarColors = ['#94a3b8', '#f59e0b', '#10b981', '#f43f5e', '#6366f1'];

function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  try {
    return startOfDay(parseISO(s.length >= 10 ? s.slice(0, 10) : s));
  } catch {
    return null;
  }
}

function issueEffectiveRange(issue: Issue): { start: Date; end: Date } {
  const start = parseDateOnly(issue.startDate);
  const due = parseDateOnly(issue.dueDate);
  const created = parseDateOnly(issue.createdAt) ?? startOfDay(new Date());

  if (start && due) {
    if (differenceInCalendarDays(due, start) < 0) return { start: due, end: start };
    return { start, end: due };
  }
  if (start) return { start, end: start };
  if (due) return { start: due, end: due };
  return { start: created, end: created };
}

type HeaderSeg = { key: string; label: string; days: number };

function buildHeaderSegments(chartStart: Date, chartEnd: Date, zoom: Zoom): HeaderSeg[] {
  const start = startOfDay(chartStart);
  const end = startOfDay(chartEnd);
  const segs: HeaderSeg[] = [];

  if (zoom === 'day') {
    for (const d of eachDayOfInterval({ start, end })) {
      segs.push({ key: d.toISOString(), label: format(d, 'M/d', { locale: ja }), days: 1 });
    }
    return segs;
  }

  if (zoom === 'week') {
    let c = startOfWeek(start, { weekStartsOn: 1 });
    while (c <= end) {
      const segStart = max([c, start]);
      const wEnd = min([endOfWeek(c, { weekStartsOn: 1 }), end]);
      const days = differenceInCalendarDays(wEnd, segStart) + 1;
      segs.push({
        key: c.toISOString(),
        label: `${format(segStart, 'M/d', { locale: ja })}〜`,
        days,
      });
      c = addDays(wEnd, 1);
    }
    return segs;
  }

  let c = startOfMonth(start);
  while (c <= end) {
    const mEnd = min([endOfMonth(c), end]);
    const segStart = max([c, start]);
    if (differenceInCalendarDays(mEnd, segStart) < 0) {
      c = addDays(endOfMonth(c), 1);
      continue;
    }
    const days = differenceInCalendarDays(mEnd, segStart) + 1;
    segs.push({
      key: c.toISOString(),
      label: format(c, 'yyyy/MM', { locale: ja }),
      days,
    });
    c = addDays(endOfMonth(c), 1);
  }
  return segs;
}

function dayWidthForZoom(zoom: Zoom): number {
  if (zoom === 'day') return 36;
  if (zoom === 'week') return 18;
  return 6;
}

const ROW_H = 32;
const LABEL_W = 260;

export default function GanttPage() {
  const { t, i18n } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const slug = identifier ?? '';
  const isJa = i18n.language?.startsWith('ja');

  const { data: projectRaw } = useProject(slug);
  const projectName = (projectRaw as { data?: { name?: string } })?.data?.name ?? slug;

  const issuesQuery = useProjectIssues(slug, { per_page: 100, page: 1 });
  const versionsQuery = useVersions(slug);
  const trackersRaw = useTrackers();
  const statusesRaw = useStatuses();

  const issues = useMemo(() => unwrapList<Issue>(issuesQuery.data), [issuesQuery.data]);
  const versions = useMemo(() => unwrapList<Version>(versionsQuery.data), [versionsQuery.data]);
  const trackers = useMemo(() => unwrapList<Tracker>(trackersRaw.data), [trackersRaw.data]);
  const statuses = useMemo(() => unwrapList<IssueStatus>(statusesRaw.data), [statusesRaw.data]);

  const [colorMode, setColorMode] = useState<'tracker' | 'status'>('tracker');
  const [zoom, setZoom] = useState<Zoom>('day');
  const scrollRef = useRef<HTMLDivElement>(null);

  const issueRows = useMemo(() => {
    const sorted = [...issues].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    return sorted.map((issue) => ({ issue, depth: 0 }));
  }, [issues]);

  const versionRows = useMemo(() => {
    return versions
      .filter((v) => v.dueDate)
      .map((v) => {
        const d = parseDateOnly(v.dueDate);
        if (!d) return null;
        return { version: v, range: { start: d, end: d } };
      })
      .filter((x): x is { version: Version; range: { start: Date; end: Date } } => x != null)
      .sort((a, b) => a.range.start.getTime() - b.range.start.getTime());
  }, [versions]);

  const chartBounds = useMemo(() => {
    const ranges: { start: Date; end: Date }[] = [...versionRows.map((v) => v.range)];
    for (const { issue } of issueRows) {
      ranges.push(issueEffectiveRange(issue));
    }
    const today = startOfDay(new Date());

    if (ranges.length === 0) {
      return { chartStart: addDays(today, -14), chartEnd: addDays(today, 45) };
    }

    const starts = ranges.map((r) => r.start);
    const ends = ranges.map((r) => r.end);
    const minD = min(starts);
    const maxD = max(ends);

    if (zoom === 'month') {
      return {
        chartStart: startOfMonth(subMonths(today, 1)),
        chartEnd: endOfMonth(addMonths(today, 3)),
      };
    }
    if (zoom === 'week') {
      return {
        chartStart: startOfWeek(addDays(minD, -7), { weekStartsOn: 1 }),
        chartEnd: endOfWeek(addDays(maxD, 7), { weekStartsOn: 1 }),
      };
    }
    return {
      chartStart: addDays(minD, -3),
      chartEnd: addDays(maxD, 3),
    };
  }, [issueRows, versionRows, zoom]);

  const { chartStart, chartEnd } = chartBounds;
  const totalDays = Math.max(1, differenceInCalendarDays(startOfDay(chartEnd), startOfDay(chartStart)) + 1);
  const dayWidth = dayWidthForZoom(zoom);
  const timelinePx = totalDays * dayWidth;

  const headerSegments = useMemo(
    () => buildHeaderSegments(chartStart, chartEnd, zoom),
    [chartStart, chartEnd, zoom],
  );

  const trackerMap = useMemo(() => {
    const m = new Map<string, string>();
    trackers.forEach((tr, idx) => m.set(tr.id, trackerColors[idx % trackerColors.length]));
    return m;
  }, [trackers]);
  const trackerBarMap = useMemo(() => {
    const m = new Map<string, string>();
    trackers.forEach((tr, idx) => m.set(tr.id, trackerBarColors[idx % trackerBarColors.length]));
    return m;
  }, [trackers]);

  const statusMap = useMemo(() => {
    const m = new Map<string, string>();
    statuses.forEach((s, idx) => m.set(s.id, statusColors[idx % statusColors.length]));
    return m;
  }, [statuses]);
  const statusBarMap = useMemo(() => {
    const m = new Map<string, string>();
    statuses.forEach((s, idx) => m.set(s.id, statusBarColors[idx % statusBarColors.length]));
    return m;
  }, [statuses]);

  const barColorCls = (i: Issue) => {
    if (colorMode === 'status') return statusMap.get(i.statusId) ?? 'bg-gray-400';
    return trackerMap.get(i.trackerId) ?? 'bg-primary-600';
  };
  const barColorHex = (i: Issue) => {
    if (colorMode === 'status') return statusBarMap.get(i.statusId) ?? '#94a3b8';
    return trackerBarMap.get(i.trackerId) ?? '#3b82f6';
  };

  const barLayout = (range: { start: Date; end: Date }) => {
    const s = startOfDay(range.start);
    const e = startOfDay(range.end);
    const left = differenceInCalendarDays(s, startOfDay(chartStart)) * dayWidth;
    const span = differenceInCalendarDays(e, s) + 1;
    const width = Math.max(dayWidth * 0.5, span * dayWidth);
    return { left: Math.max(0, left), width };
  };

  const todayOffset = useMemo(() => {
    const today = startOfDay(new Date());
    const cs = startOfDay(chartStart);
    const ce = startOfDay(chartEnd);
    if (today < cs || today > ce) return null;
    return differenceInCalendarDays(today, cs) * dayWidth + dayWidth / 2;
  }, [chartStart, chartEnd, dayWidth]);

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  const loading = issuesQuery.isLoading;
  const projectRowIdx = 0;
  const totalRows = 1 + issueRows.length + (versionRows.length > 0 ? 1 + versionRows.length : 0);
  const chartH = totalRows * ROW_H + 4;

  return (
    <div className="space-y-4">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('gantt.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
            {(['month', 'week', 'day'] as Zoom[]).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`px-2 py-1 rounded ${zoom === z ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
              >
                {t(`gantt.zoom${z.charAt(0).toUpperCase() + z.slice(1)}` as 'gantt.zoomMonth')}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setColorMode('tracker')}
              className={`px-2 py-1 rounded ${colorMode === 'tracker' ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
            >
              {t('issues.tracker')}
            </button>
            <button
              type="button"
              onClick={() => setColorMode('status')}
              className={`px-2 py-1 rounded ${colorMode === 'status' ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
            >
              {t('issues.status')}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : issues.length === 0 && versionRows.length === 0 ? (
        <p className="text-gray-500">{t('app.noData')}</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex">
            {/* Left label column */}
            <div className="shrink-0 border-r border-gray-200 bg-gray-50/80" style={{ width: LABEL_W, minWidth: LABEL_W }}>
              {/* Header */}
              <div className="flex items-center border-b border-gray-200 px-3 text-xs font-semibold text-gray-600" style={{ height: ROW_H }}>
                {isJa ? 'チケット名' : 'Issue'}
              </div>

              {/* Project row */}
              <div className="flex items-center border-b border-gray-100 px-3 text-xs font-bold text-gray-900" style={{ height: ROW_H }}>
                <span className="mr-1.5 text-primary-600">▾</span>
                <Link to={`/projects/${identifier}`} className="text-primary-700 hover:underline truncate">
                  {projectName}
                </Link>
              </div>

              {/* Issue rows */}
              {issueRows.map(({ issue }) => {
                const hasSchedule = !!(issue.startDate || issue.dueDate);
                return (
                  <div
                    key={issue.id}
                    className="flex items-center border-b border-gray-100 pr-2 text-xs text-gray-800 truncate"
                    style={{ height: ROW_H, paddingLeft: 28 }}
                  >
                    <Link
                      to={`/projects/${identifier}/issues/${issue.id}`}
                      className="text-primary-700 hover:underline font-medium shrink-0"
                    >
                      #{issue.number}
                    </Link>
                    <Link
                      to={`/projects/${identifier}/issues/${issue.id}`}
                      className="ml-1.5 truncate text-gray-700 hover:text-primary-700 hover:underline"
                    >
                      {issue.subject}
                    </Link>
                    {!hasSchedule && (
                      <span className="ml-1 text-[10px] text-amber-500 shrink-0" title={t('gantt.estimatedFromCreated')}>*</span>
                    )}
                  </div>
                );
              })}

              {/* Version rows */}
              {versionRows.length > 0 && (
                <>
                  <div className="flex items-center border-b border-violet-200 bg-violet-50/60 px-3 text-xs font-semibold text-violet-800" style={{ height: ROW_H }}>
                    {t('gantt.versionMilestones')}
                  </div>
                  {versionRows.map(({ version }) => (
                    <div key={version.id} className="flex items-center border-b border-violet-100 px-3 text-xs text-violet-900 font-medium truncate bg-violet-50/30" style={{ height: ROW_H }}>
                      ◆ {version.name}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Right timeline */}
            <div className="flex-1 overflow-x-auto" ref={scrollRef}>
              <div style={{ width: timelinePx, minWidth: timelinePx, position: 'relative' }}>
                {/* Header segments */}
                <div className="flex border-b border-gray-200" style={{ height: ROW_H }}>
                  {headerSegments.map((seg) => (
                    <div
                      key={seg.key}
                      className="border-l border-gray-200 first:border-l-0 text-center text-xs text-gray-600 flex items-center justify-center bg-gray-50/80"
                      style={{ width: seg.days * dayWidth, minWidth: seg.days * dayWidth }}
                    >
                      <span className="truncate px-0.5">{seg.label}</span>
                    </div>
                  ))}
                </div>

                {/* Chart body (SVG overlay for bars + tree lines) */}
                <svg
                  width={timelinePx}
                  height={chartH}
                  className="block"
                  style={{ minWidth: timelinePx }}
                >
                  {/* Grid columns */}
                  {headerSegments.reduce<{ x: number; els: React.ReactNode[] }>(
                    (acc, seg) => {
                      const w = seg.days * dayWidth;
                      acc.els.push(
                        <line key={seg.key} x1={acc.x} y1={0} x2={acc.x} y2={chartH} stroke="#e5e7eb" strokeWidth={1} />,
                      );
                      return { x: acc.x + w, els: acc.els };
                    },
                    { x: 0, els: [] },
                  ).els}

                  {/* Today line */}
                  {todayOffset != null && (
                    <line
                      x1={todayOffset}
                      y1={0}
                      x2={todayOffset}
                      y2={chartH}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                    />
                  )}

                  {/* Project row - horizontal connector line */}
                  {(() => {
                    if (issueRows.length === 0) return null;
                    const ranges = issueRows.map(({ issue }) => issueEffectiveRange(issue));
                    const allStarts = ranges.map((r) => r.start);
                    const allEnds = ranges.map((r) => r.end);
                    const minS = min(allStarts);
                    const maxE = max(allEnds);
                    const { left: pLeft } = barLayout({ start: minS, end: minS });
                    const { left: pRight, width: pW } = barLayout({ start: maxE, end: maxE });
                    const y = ROW_H / 2;
                    return (
                      <g>
                        {/* Project span line */}
                        <line x1={pLeft} y1={y} x2={pRight + pW} y2={y} stroke="#6366f1" strokeWidth={3} strokeLinecap="round" />
                        {/* Diamond at start */}
                        <polygon
                          points={`${pLeft},${y - 5} ${pLeft + 5},${y} ${pLeft},${y + 5} ${pLeft - 5},${y}`}
                          fill="#6366f1"
                        />
                        {/* Diamond at end */}
                        <polygon
                          points={`${pRight + pW},${y - 5} ${pRight + pW + 5},${y} ${pRight + pW},${y + 5} ${pRight + pW - 5},${y}`}
                          fill="#6366f1"
                        />
                      </g>
                    );
                  })()}

                  {/* Issue bars with tree branches */}
                  {issueRows.map(({ issue }, idx) => {
                    const rowY = (idx + 1) * ROW_H;
                    const range = issueEffectiveRange(issue);
                    const { left, width } = barLayout(range);
                    const cy = rowY + ROW_H / 2;
                    const color = barColorHex(issue);
                    const issueUrl = `/projects/${identifier}/issues/${issue.id}`;

                    const projectCy = ROW_H / 2;
                    const branchX = 6;

                    return (
                      <g key={issue.id}>
                        <line x1={branchX} y1={projectCy + 5} x2={branchX} y2={cy} stroke="#c7d2fe" strokeWidth={1} />
                        <line x1={branchX} y1={cy} x2={Math.max(left, branchX + 4)} y2={cy} stroke="#c7d2fe" strokeWidth={1} />

                        <a href={issueUrl} className="cursor-pointer">
                          <rect
                            x={left}
                            y={cy - 7}
                            width={Math.max(width, 4)}
                            height={14}
                            rx={3}
                            fill={color}
                            opacity={0.9}
                          />
                          {issue.doneRatio > 0 && width > 6 && (
                            <rect
                              x={left + 1}
                              y={cy - 4}
                              width={Math.max(0, (width - 2) * (issue.doneRatio / 100))}
                              height={8}
                              rx={2}
                              fill="rgba(255,255,255,0.45)"
                            />
                          )}
                          <title>{`${issue.tracker?.name} #${issue.number}: ${issue.subject} (${format(range.start, 'yyyy-MM-dd')} → ${format(range.end, 'yyyy-MM-dd')})${issue.doneRatio > 0 ? ` ${issue.doneRatio}%` : ''}`}</title>
                        </a>
                        <a href={issueUrl}>
                          <text
                            x={left + width + 4}
                            y={cy + 4}
                            fontSize={10}
                            fill="#4338ca"
                            className="cursor-pointer hover:underline"
                          >
                            {issue.tracker?.name} #{issue.number}: {issue.subject}
                            {issue.doneRatio > 0 ? ` ${issue.doneRatio}%` : ''}
                          </text>
                        </a>
                      </g>
                    );
                  })}

                  {/* Version milestones */}
                  {versionRows.map(({ version, range }, idx) => {
                    const baseY = (1 + issueRows.length + 1) * ROW_H;
                    const rowY = baseY + idx * ROW_H;
                    const { left } = barLayout(range);
                    const cx = left + dayWidth / 2;
                    const cy = rowY + ROW_H / 2;
                    return (
                      <g key={version.id}>
                        <polygon
                          points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                          fill="#7c3aed"
                          stroke="#6d28d9"
                          strokeWidth={1}
                        />
                        <text x={cx + 10} y={cy + 4} fontSize={10} fill="#6d28d9" fontWeight={600}>
                          {version.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* Horizontal row separators */}
                  {Array.from({ length: totalRows }, (_, i) => (
                    <line key={i} x1={0} y1={(i + 1) * ROW_H} x2={timelinePx} y2={(i + 1) * ROW_H} stroke="#f1f5f9" strokeWidth={1} />
                  ))}
                </svg>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-gray-200 bg-gray-50/60 px-4 py-2.5 text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium">{t('gantt.legend')}</span>
            {colorMode === 'tracker'
              ? trackers.map((tr, idx) => (
                  <span key={tr.id} className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: trackerBarColors[idx % trackerBarColors.length] }} />
                    {tr.name}
                  </span>
                ))
              : statuses.map((s, idx) => (
                  <span key={s.id} className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: statusBarColors[idx % statusBarColors.length] }} />
                    {s.name}
                  </span>
                ))}
            <span className="inline-flex items-center gap-1 ml-2">
              <span className="inline-block w-4 h-0.5 bg-red-500" style={{ borderTop: '2px dashed #ef4444' }} />
              {t('gantt.today')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
