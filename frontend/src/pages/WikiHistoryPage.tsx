import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { ArrowLeft, GitCompare, Trash2 } from 'lucide-react';
import ProjectSubNav from '../components/ProjectSubNav';
import AppSelect from '../components/AppSelect';
import { useDeleteWikiVersion, useProject, useWikiHistory, useWikiPage } from '../api/hooks';
import NotFoundPage from './NotFoundPage';
import { isNotFoundError } from '../utils/http-error';

export default function WikiHistoryPage() {
  const { identifier, title } = useParams<{ identifier: string; title: string }>();
  const decodedTitle = title ? decodeURIComponent(title) : '';
  const navigate = useNavigate();

  const { data: projectRaw } = useProject(identifier ?? '');
  const projectId = projectRaw?.data?.id ?? '';

  const historyQuery = useWikiHistory(projectId, decodedTitle);
  const pageQuery = useWikiPage(projectId, decodedTitle);
  const wikiProtected = pageQuery.data?.data?.protected === true;
  const rows = useMemo(() => historyQuery.data?.data ?? [], [historyQuery.data]);
  const [fromVersion, setFromVersion] = useState<string>('');
  const [toVersion, setToVersion] = useState<string>('');
  const [deleteVersion, setDeleteVersion] = useState<number | null>(null);
  const deleteMutation = useDeleteWikiVersion(projectId, decodedTitle);

  const renderAuthor = (row: (typeof rows)[number]) => {
    if (row.author) {
      const fullName = `${row.author.lastname ?? ''} ${row.author.firstname ?? ''}`.trim();
      return fullName || row.author.login || row.author.id;
    }
    return row.authorId;
  };

  const openDiff = () => {
    const fromNum = Number(fromVersion);
    const toNum = Number(toVersion);
    if (!Number.isInteger(fromNum) || !Number.isInteger(toNum) || fromNum < 1 || toNum < 1 || fromNum === toNum) {
      return;
    }
    navigate(
      `/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}/diff?from=${fromNum}&to=${toNum}`,
    );
  };

  if (!identifier || !decodedTitle) {
    return <p className="text-slate-500">履歴を表示できません。</p>;
  }

  if (pageQuery.isError && isNotFoundError(pageQuery.error)) {
    return <NotFoundPage />;
  }

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="min-w-0 text-xl font-bold text-slate-900">履歴: {decodedTitle}</h1>
          <Link
            to={`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            ページに戻る
          </Link>
        </div>

        {historyQuery.isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : historyQuery.isError && isNotFoundError(historyQuery.error) ? (
          <NotFoundPage />
        ) : historyQuery.isError ? (
          <p className="p-5 text-sm text-red-600">履歴の取得に失敗しました。</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">履歴はありません。</p>
        ) : (
          <div>
            <div className="overflow-x-auto overflow-y-hidden">
              <table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-20 px-3 py-3 text-left font-semibold text-slate-700">版</th>
                    <th className="w-40 px-3 py-3 text-left font-semibold text-slate-700">更新日時</th>
                    <th className="w-40 px-3 py-3 text-left font-semibold text-slate-700">更新者</th>
                    <th className="min-w-64 px-3 py-3 text-left font-semibold text-slate-700">コメント</th>
                    {!wikiProtected && <th className="w-20 px-3 py-3 text-center font-semibold text-slate-700">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.version}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{format(parseISO(row.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                      <td className="max-w-44 truncate px-3 py-2 text-slate-700">{renderAuthor(row)}</td>
                      <td className="px-3 py-2 text-slate-600">{row.comments || '—'}</td>
                      {!wikiProtected && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => setDeleteVersion(row.version)}
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                              title="版を削除"
                              aria-label="版を削除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[8rem] text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">比較元</span>
                  <AppSelect
                    value={fromVersion}
                    onChange={setFromVersion}
                    options={[{ value: '', label: '-' }, ...rows.map((r) => ({ value: String(r.version), label: String(r.version) }))]}
                    ariaLabel="比較元"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                  />
                </label>
                <label className="min-w-[8rem] text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">比較先</span>
                  <AppSelect
                    value={toVersion}
                    onChange={setToVersion}
                    options={[{ value: '', label: '-' }, ...rows.map((r) => ({ value: String(r.version), label: String(r.version) }))]}
                    ariaLabel="比較先"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={openDiff}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700"
                >
                  <GitCompare className="h-4 w-4" aria-hidden />
                  表示
                </button>
              </div>
            </div>

            {fromVersion && toVersion && fromVersion === toVersion && (
              <p className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">比較元と比較先は異なる版を選択してください。</p>
            )}
          </div>
        )}
      </div>

      <Dialog open={deleteVersion != null} onClose={() => setDeleteVersion(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-slate-900">版削除の確認</DialogTitle>
            <p className="mt-3 text-sm text-slate-700">
              版 {deleteVersion ?? ''} を削除します。よろしいですか？
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteVersion(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (deleteVersion == null) return;
                  await deleteMutation.mutateAsync(deleteVersion);
                  setDeleteVersion(null);
                }}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                削除
              </button>
            </div>
            {deleteMutation.isError && (
              <p className="mt-3 text-sm text-red-600">版の削除に失敗しました。</p>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}


