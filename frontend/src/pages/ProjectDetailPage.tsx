import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProject, useProjectAiBottleneckDetection, useProjectAiProgressSummary, useProjectAiTaskInstruction, useProjectAiWeeklyReport, useProjectIssues } from '../api/hooks';
import ProjectSubNav from '../components/ProjectSubNav';
import { renderMarkdown } from '../components/RichTextEditor';

const aiActionOptions = [
  { key: 'progress-summary', label: 'AI進捗要約/指示' },
  { key: 'weekly-report', label: 'AI週次レポート' },
  { key: 'bottleneck-detection', label: 'AIボトルネック検知' },
  { key: 'task-instruction', label: 'AIタスク指示' },
] as const;

type AiActionKey = (typeof aiActionOptions)[number]['key'];

function errorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response
  ) {
    const data = error.response.data as { error?: { message?: string } };
    if (data.error?.message) return data.error.message;
  }
  return fallback;
}

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const [selectedAiAction, setSelectedAiAction] = useState<AiActionKey | null>(null);
  const [aiActionMessage, setAiActionMessage] = useState('');
  const id = identifier ?? '';
  const { data, isLoading, isError } = useProject(id);
  const project = data?.data;
  const progressSummary = useProjectAiProgressSummary();
  const weeklyReport = useProjectAiWeeklyReport();
  const bottleneckDetection = useProjectAiBottleneckDetection();
  const taskInstruction = useProjectAiTaskInstruction();

  const base = `/projects/${id}`;

  const membersCount = project?._count?.members ?? '—';
  const enabledModules = new Set((project?.enabledModules ?? []).map((m) => m.name));
  const canUseIssueTracking = enabledModules.has('issue_tracking');

  const issuesQuery = useProjectIssues(id, { per_page: 1 });
  const openIssueCount = issuesQuery.data?.pagination?.total ?? '—';
  const canUseAiActions = Boolean(project?.permissions?.canUseAiActions);
  const isAiPending = progressSummary.isPending || weeklyReport.isPending || bottleneckDetection.isPending || taskInstruction.isPending;
  const shouldShowAiResult = Boolean(
    isAiPending ||
    progressSummary.data ||
    progressSummary.isError ||
    weeklyReport.data ||
    weeklyReport.isError ||
    bottleneckDetection.data ||
    bottleneckDetection.isError ||
    taskInstruction.data ||
    taskInstruction.isError ||
    aiActionMessage,
  );

  const runAiAction = () => {
    if (!selectedAiAction) return;
    setAiActionMessage('');
    progressSummary.reset();
    weeklyReport.reset();
    bottleneckDetection.reset();
    taskInstruction.reset();

    if (selectedAiAction === 'progress-summary') {
      progressSummary.mutate(id);
      return;
    }

    if (selectedAiAction === 'weekly-report') {
      weeklyReport.mutate(id);
      return;
    }

    if (selectedAiAction === 'bottleneck-detection') {
      bottleneckDetection.mutate(id);
      return;
    }

    if (selectedAiAction === 'task-instruction') {
      taskInstruction.mutate(id);
      return;
    }

    setAiActionMessage('このAIアクションはまだ実装されていません。');
  };

  const clearAiAction = () => {
    setSelectedAiAction(null);
    setAiActionMessage('');
    progressSummary.reset();
    weeklyReport.reset();
    bottleneckDetection.reset();
    taskInstruction.reset();
  };

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={id} />
      <div className="mx-auto max-w-6xl space-y-6">
        {isLoading && <p className="text-slate-500">{t('app.loading')}</p>}
        {isError && <p className="text-red-600">{t('app.error')}</p>}
        {project && (
          <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-1 font-mono text-sm text-slate-500">{project.identifier}</p>
            {project.description && <p className="mt-3 text-slate-700">{project.description}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link to={`${base}/members`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-primary-300 hover:shadow">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('nav.members')}</p>
              <p className="mt-2 text-2xl font-semibold text-primary-600">{membersCount}</p>
            </Link>
            {canUseIssueTracking ? (
              <Link to={`${base}/issues`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-primary-300 hover:shadow">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.title')}</p>
                <p className="mt-2 text-2xl font-semibold text-primary-600">{openIssueCount}</p>
              </Link>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.title')}</p>
                <p className="mt-2 text-sm text-slate-500">この機能は無効です</p>
              </div>
            )}
          </div>

          {canUseAiActions && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">AIアクション</h2>
                  <p className="mt-1 text-sm text-slate-500">実行するAIアクションを1つ選択してください。</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={runAiAction}
                    disabled={!selectedAiAction || isAiPending}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    実行
                  </button>
                  <button
                    type="button"
                    onClick={clearAiAction}
                    disabled={(!selectedAiAction && !shouldShowAiResult) || isAiPending}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    クリア
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {aiActionOptions.map(({ key, label }) => {
                  const isSelected = selectedAiAction === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedAiAction(key)}
                      aria-pressed={isSelected}
                      className={`min-h-20 rounded-lg border p-4 text-left text-sm font-medium leading-5 transition-all ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50 text-primary-800 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {shouldShowAiResult && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {isAiPending ? (
                    <p className="text-sm font-medium text-slate-700">思考中…</p>
                  ) : progressSummary.isError ? (
                    <p className="text-sm text-red-600">
                      {errorMessage(progressSummary.error, 'AI進捗要約の実行に失敗しました。')}
                    </p>
                  ) : weeklyReport.isError ? (
                    <p className="text-sm text-red-600">
                      {errorMessage(weeklyReport.error, 'AI週次レポートの実行に失敗しました。')}
                    </p>
                  ) : bottleneckDetection.isError ? (
                    <p className="text-sm text-red-600">
                      {errorMessage(bottleneckDetection.error, 'AIボトルネック検知の実行に失敗しました。')}
                    </p>
                  ) : taskInstruction.isError ? (
                    <p className="text-sm text-red-600">
                      {errorMessage(taskInstruction.error, 'AIタスク指示の実行に失敗しました。')}
                    </p>
                  ) : progressSummary.data ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>未完了チケット: {progressSummary.data.data.issueCount}</span>
                        <span>取得上限: {progressSummary.data.data.issueLimit}</span>
                      </div>
                      <div
                        className="rte-preview text-sm leading-6 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(progressSummary.data.data.summary) }}
                      />
                    </div>
                  ) : weeklyReport.data ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>対象チケット: {weeklyReport.data.data.issueCount}</span>
                        <span>取得上限: {weeklyReport.data.data.issueLimit}</span>
                        <span>
                          対象期間: {new Date(weeklyReport.data.data.periodStart).toLocaleDateString()} - {new Date(weeklyReport.data.data.periodEnd).toLocaleDateString()}
                        </span>
                      </div>
                      <div
                        className="rte-preview text-sm leading-6 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(weeklyReport.data.data.report) }}
                      />
                    </div>
                  ) : bottleneckDetection.data ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>未完了・期日超過: {bottleneckDetection.data.data.overdueOpenIssueCount}</span>
                        <span>取得上限: {bottleneckDetection.data.data.overdueOpenIssueLimit}</span>
                        <span>期日超過後に完了: {bottleneckDetection.data.data.lateClosedIssueCount}</span>
                        <span>取得上限: {bottleneckDetection.data.data.lateClosedIssueLimit}</span>
                      </div>
                      <div
                        className="rte-preview text-sm leading-6 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(bottleneckDetection.data.data.report) }}
                      />
                    </div>
                  ) : taskInstruction.data ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>未完了チケット: {taskInstruction.data.data.issueCount}</span>
                        <span>取得上限: {taskInstruction.data.data.issueLimit}</span>
                      </div>
                      <div
                        className="rte-preview text-sm leading-6 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(taskInstruction.data.data.instructions) }}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">{aiActionMessage}</p>
                  )}
                </div>
              )}
            </section>
          )}
          </>
        )}
      </div>
    </div>
  );
}
