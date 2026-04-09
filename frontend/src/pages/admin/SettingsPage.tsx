import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings, useUpdateSettings, useTestEmail } from '../../api/hooks';

const TABS = ['general', 'display', 'authentication', 'notifications', 'projects', 'issues', 'timeTracking'] as const;

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data: settings = {}, isLoading, isError } = useSettings();
  const updateSettings = useUpdateSettings();
  const testEmail = useTestEmail();

  const [tab, setTab] = useState<(typeof TABS)[number]>('general');
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues(settings);
  }, [settings]);

  const setField = (key: string, v: string) => setValues(s => ({ ...s, [key]: v }));

  const save = () => {
    updateSettings.mutate(values);
  };

  const tabLabel = (id: (typeof TABS)[number]) => {
    const map: Record<(typeof TABS)[number], string> = {
      general: t('settings.general'),
      display: t('settings.display'),
      authentication: t('settings.authentication'),
      notifications: t('settings.notifications'),
      projects: t('settings.projects'),
      issues: t('settings.issues'),
      timeTracking: t('settings.timeTracking'),
    };
    return map[id];
  };

  const Field = ({ k, label }: { k: string; label: string }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input className="mt-1 w-full max-w-xl rounded border border-gray-300 px-3 py-2 text-sm" value={values[k] ?? ''} onChange={e => setField(k, e.target.value)} />
    </div>
  );

  const CheckboxField = ({ k, label }: { k: string; label: string }) => (
    <label className="flex items-center gap-2 text-sm text-gray-800">
      <input type="checkbox" checked={values[k] === '1' || values[k] === 'true'} onChange={e => setField(k, e.target.checked ? '1' : '0')} />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('settings.title')}</h1>
        <button type="button" className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50" onClick={save} disabled={updateSettings.isPending}>
          {t('app.save')}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-t px-3 py-2 text-sm font-medium ${tab === id ? 'bg-white border border-b-0 border-gray-200 text-primary-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {tabLabel(id)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && (
        <div className="max-w-3xl space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {tab === 'general' && (
            <div className="space-y-4">
              <Field k="app_title" label={t('settings.appTitle')} />
              <Field k="default_language" label={t('settings.defaultLanguage')} />
            </div>
          )}
          {tab === 'display' && (
            <div className="space-y-4">
              <Field k="per_page_options" label={t('settings.perPageOptions')} />
              <Field k="text_formatting" label={t('settings.textFormatting')} />
              <button
                type="button"
                className="rounded border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                onClick={() => testEmail.mutate()}
                disabled={testEmail.isPending}
              >
                {t('admin.testEmail')}
              </button>
            </div>
          )}
          {tab === 'authentication' && (
            <div className="space-y-3">
              <CheckboxField k="login_required" label={t('settings.loginRequired')} />
              <CheckboxField k="self_registration" label={t('settings.selfRegistration')} />
            </div>
          )}
          {tab === 'notifications' && (
            <div className="space-y-4">
              <Field k="mail_from" label={t('settings.mailFrom')} />
              <Field k="bcc_recipients" label={t('settings.bccRecipients')} />
            </div>
          )}
          {tab === 'projects' && (
            <div className="space-y-3">
              <CheckboxField k="default_projects_public" label={t('settings.defaultProjectsPublic')} />
            </div>
          )}
          {tab === 'issues' && (
            <div className="space-y-3">
              <CheckboxField k="cross_project_issue_tracking" label={t('settings.crossProjectIssues')} />
            </div>
          )}
          {tab === 'timeTracking' && (
            <div className="space-y-3">
              <CheckboxField k="timelog_required_comment" label={t('settings.timelogRequiredComment')} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
