import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const tabs = [
  { key: 'overview', suffix: '', labelKey: 'nav.overview' },
  { key: 'issues', suffix: 'issues', labelKey: 'nav.issues' },
  { key: 'time_entries', suffix: 'time_entries', labelKey: 'nav.timeEntries' },
  { key: 'wiki', suffix: 'wiki', labelKey: 'nav.wiki' },
  { key: 'news', suffix: 'news', labelKey: 'nav.news' },
  { key: 'forums', suffix: 'forums', labelKey: 'nav.forums' },
  { key: 'documents', suffix: 'documents', labelKey: 'nav.documents' },
  { key: 'versions', suffix: 'versions', labelKey: 'versions.title' },
  { key: 'gantt', suffix: 'gantt', labelKey: 'nav.gantt' },
  { key: 'calendar', suffix: 'calendar', labelKey: 'nav.calendar' },
  { key: 'members', suffix: 'members', labelKey: 'nav.members' },
  { key: 'activity', suffix: 'activity', labelKey: 'nav.activity' },
  { key: 'settings', suffix: 'settings', labelKey: 'nav.settings' },
] as const;

export default function ProjectSubNav({ identifier }: { identifier: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const base = `/projects/${identifier}`;

  return (
    <nav className="flex overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => {
        const to = tab.suffix ? `${base}/${tab.suffix}` : base;
        const isActive = tab.suffix
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
