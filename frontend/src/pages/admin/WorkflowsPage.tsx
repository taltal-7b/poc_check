import { useTranslation } from 'react-i18next';

export default function WorkflowsPage() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900">{t('workflows.title')}</h1>
    </div>
  );
}
