import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { format } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';
import { useIssue, useUpdateIssue } from '../api/hooks';
import type { Issue, Journal, User } from '../types';

type IssueWithExtras = Issue & {
  watchers?: User[];
  relations?: { relationType?: string; issue: Issue }[];
};

const REACTIONS = ['👍', '👎', '🎉', '❤️'] as const;

function priorityBadgeClass(p: number) {
  const map: Record<number, string> = {
    1: 'bg-slate-100 text-slate-800',
    2: 'bg-sky-100 text-sky-900',
    3: 'bg-amber-100 text-amber-900',
    4: 'bg-orange-100 text-orange-900',
    5: 'bg-red-100 text-red-900',
  };
  return map[p] ?? 'bg-slate-100 text-slate-800';
}

export default function IssueDetailPage() {
  const { t, i18n } = useTranslation();
  const { identifier, issueId } = useParams<{ identifier?: string; issueId?: string }>();
  const id = issueId ?? '';
  const { data, isLoading, isError } = useIssue(id);
  const updateMutation = useUpdateIssue();

  const issue = data?.data as IssueWithExtras | undefined;

  const [note, setNote] = useState('');
  const [descHtml, setDescHtml] = useState('');
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});

  const locale = i18n.language?.startsWith('ja') ? ja : enUS;
  const projectSlug = identifier ?? issue?.project?.identifier ?? '';

  useEffect(() => {
    const raw = issue?.description;
    if (!raw) {
      setDescHtml('');
      return;
    }
    const parsed = marked.parse(raw);
    Promise.resolve(parsed).then((html) => {
      setDescHtml(sanitizeHtml(String(html)));
    });
  }, [issue?.description]);

  const journals: Journal[] = useMemo(() => issue?.journals ?? [], [issue?.journals]);

  const submitNote = (e: FormEvent) => {
    e.preventDefault();
    if (!issue || !note.trim()) return;
    updateMutation.mutate(
      { id: issue.id, notes: note.trim() },
      {
        onSuccess: () => setNote(''),
      },
    );
  };

  const bumpReaction = (emoji: string) => {
    setReactionCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
  };

  if (isLoading) {
    return (
      <div className="px-4 py-8">
        <p className="text-slate-500">{t('app.loading')}</p>
      </div>
    );
  }

  if (isError || !issue) {
    return (
      <div className="px-4 py-8">
        <p className="text-red-600">{t('app.error')}</p>
      </div>
    );
  }

  const watchers = issue.watchers ?? [];
  const relations = issue.relations ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 text-sm text-slate-500">
        {projectSlug && (
          <Link to={`/projects/${projectSlug}/issues`} className="text-primary-600 hover:underline">
            {issue.project?.name ?? projectSlug}
          </Link>
        )}
        {!projectSlug && issue.project && (
          <Link to={`/projects/${issue.project.identifier}/issues`} className="text-primary-600 hover:underline">
            {issue.project.name}
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <article className="min-w-0 flex-1 space-y-6">
          <header>
            <h1 className="text-2xl font-bold text-slate-900">{issue.subject}</h1>
          </header>

          <div
            className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white p-6 shadow-sm prose-headings:font-semibold prose-a:text-primary-600"
            dangerouslySetInnerHTML={{ __html: descHtml || `<p class="text-slate-500">${t('app.noData')}</p>` }}
          />

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{t('activity.title')}</h2>
            <ul className="mt-4 space-y-4">
              {journals.map((j) => (
                <li key={j.id} className="border-b border-slate-100 pb-4 last:border-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {j.user ? `${j.user.firstname} ${j.user.lastname}`.trim() || j.user.login : '—'}
                    </span>
                    <time dateTime={j.createdAt}>{format(new Date(j.createdAt), 'PPpp', { locale })}</time>
                  </div>
                  {j.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{j.notes}</p>}
                  {j.details && j.details.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
                      {j.details.map((d) => (
                        <li key={d.id}>
                          {d.property}.{d.propKey}: {d.oldValue ?? '—'} → {d.newValue ?? '—'}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('issues.addNote')}</h2>
            <form onSubmit={submitNote} className="space-y-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder={t('issues.addNote')}
              />
              <button
                type="submit"
                disabled={updateMutation.isPending || !note.trim()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? t('app.loading') : t('app.save')}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-medium text-slate-700">{t('issues.reactions', { defaultValue: 'Reactions' })}</p>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => bumpReaction(emoji)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm hover:border-primary-300"
                >
                  <span>{emoji}</span>
                  {(reactionCounts[emoji] ?? 0) > 0 && (
                    <span className="text-xs text-slate-500">{reactionCounts[emoji]}</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{t('issues.relations')}</h2>
            {relations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t('app.noData')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {relations.map((r, idx) => (
                  <li key={`${r.issue.id}-${idx}`}>
                    <Link
                      to={
                        projectSlug || r.issue.project?.identifier
                          ? `/projects/${projectSlug || r.issue.project?.identifier}/issues/${r.issue.id}`
                          : `/issues/${r.issue.id}`
                      }
                      className="text-primary-600 hover:underline"
                    >
                      {r.relationType ? `${r.relationType}: ` : ''}
                      {r.issue.subject}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>

        <aside className="w-full shrink-0 space-y-6 lg:w-80">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('issues.title')}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">{t('issues.tracker')}</dt>
                <dd className="font-medium text-slate-900">{issue.tracker?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('issues.status')}</dt>
                <dd className="font-medium text-slate-900">{issue.status?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('issues.priority')}</dt>
                <dd>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${priorityBadgeClass(issue.priority)}`}>
                    {t(`issues.priorities.${issue.priority}` as 'issues.priorities.1')}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('issues.assignee')}</dt>
                <dd className="font-medium text-slate-900">
                  {issue.assignee
                    ? `${issue.assignee.firstname} ${issue.assignee.lastname}`.trim() || issue.assignee.login
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('issues.startDate')}</dt>
                <dd className="text-slate-800">{issue.startDate ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('issues.dueDate')}</dt>
                <dd className="text-slate-800">{issue.dueDate ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('issues.estimatedHours')}</dt>
                <dd className="text-slate-800">{issue.estimatedHours ?? '—'}</dd>
              </div>
              <div>
                <dt className="mb-1 text-slate-500">{t('issues.doneRatio')}</dt>
                <dd>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all"
                      style={{ width: `${issue.doneRatio}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{issue.doneRatio}%</p>
                </dd>
              </div>
            </dl>
            <p className="mt-4 font-mono text-xs text-slate-400">ID: {issue.id.slice(0, 8)}…</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t('issues.watchers')}</h2>
            {watchers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t('app.noData')}</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-slate-800">
                {watchers.map((w) => (
                  <li key={w.id}>
                    {w.firstname} {w.lastname} ({w.login})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
