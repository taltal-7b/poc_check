import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../api/hooks';

const tabs = [
  { key: 'overview', suffix: '', labelKey: 'nav.overview', moduleKey: null },
  { key: 'issues', suffix: 'issues', labelKey: 'nav.issues', moduleKey: 'issue_tracking' },
  { key: 'issueBoard', suffix: 'issues/board', labelKey: 'nav.issueBoard', moduleKey: 'issue_tracking' },
  { key: 'time_entries', suffix: 'time_entries', labelKey: 'nav.timeEntries', moduleKey: 'time_tracking' },
  { key: 'wiki', suffix: 'wiki', labelKey: 'nav.wiki', moduleKey: 'wiki' },
  { key: 'news', suffix: 'news', labelKey: 'nav.news', moduleKey: 'news' },
  { key: 'forums', suffix: 'forums', labelKey: 'nav.forums', moduleKey: 'boards' },
  { key: 'documents', suffix: 'documents', labelKey: 'nav.documents', moduleKey: 'documents' },
  { key: 'files', suffix: 'files', labelKey: 'nav.files', moduleKey: 'files' },
  { key: 'gantt', suffix: 'gantt', labelKey: 'nav.gantt', moduleKey: 'gantt' },
  { key: 'calendar', suffix: 'calendar', labelKey: 'nav.calendar', moduleKey: 'calendar' },
  { key: 'members', suffix: 'members', labelKey: 'nav.members', moduleKey: null },
  { key: 'activity', suffix: 'activity', labelKey: 'nav.activity', moduleKey: null },
  { key: 'settings', suffix: 'settings', labelKey: 'nav.settings', moduleKey: null },
] as const;

const STATUS_ARCHIVED = 5;

export default function ProjectSubNav({ identifier }: { identifier: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const base = `/projects/${identifier}`;
  const projectQuery = useProject(identifier);
  const project = projectQuery.data?.data;
  const enabledModules = new Set((project?.enabledModules ?? []).map((m) => m.name));
  const settingsTab = tabs.find((tab) => tab.key === 'settings');
  const visibleTabs = projectQuery.isLoading || !project
    ? tabs
    : project.status === STATUS_ARCHIVED
      ? settingsTab ? [settingsTab] : []
    : tabs.filter((tab) => !tab.moduleKey || enabledModules.has(tab.moduleKey));

  return (
    <nav className="flex overflow-x-auto border-b border-slate-200">
      {visibleTabs.map((tab) => {
        const to = tab.suffix ? `${base}/${tab.suffix}` : base;
        const isActive = tab.key === 'issues'
          ? location.pathname.startsWith(`${base}/issues`) && !location.pathname.startsWith(`${base}/issues/board`)
          : tab.suffix
            ? location.pathname.startsWith(`${base}/${tab.suffix}`)
            : location.pathname === base || location.pathname === `${base}/`;
        return (
          <Link
            key={tab.key}
            to={to}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-600 hover:border-primary-400 hover:text-primary-700'
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
