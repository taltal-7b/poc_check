import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Trash2 } from 'lucide-react';
import ProjectSubNav from '../components/ProjectSubNav';
import { useDeleteWikiVersion, useProject, useWikiHistory, useWikiPage } from '../api/hooks';

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
    return <p className="text-gray-500">履歴を表示できません。</p>;
  }

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">履歴: {decodedTitle}</h1>
          <Link
            to={`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            ページに戻る
          </Link>
        </div>

        {historyQuery.isLoading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : historyQuery.isError ? (
          <p className="text-sm text-red-600">履歴の取得に失敗しました。</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">履歴はありません。</p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">版</th>
                    <th className="px-4 py-2 font-medium">更新日時</th>
                    <th className="px-4 py-2 font-medium">更新者</th>
                    <th className="px-4 py-2 font-medium">コメント</th>
                    {!wikiProtected && <th className="px-4 py-2 text-center font-medium">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{row.version}</td>
                      <td className="px-4 py-2">{format(parseISO(row.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                      <td className="px-4 py-2">{renderAuthor(row)}</td>
                      <td className="px-4 py-2">{row.comments || '—'}</td>
                      {!wikiProtected && (
                        <td className="px-4 py-2">
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

            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">比較元</span>
                  <select
                    value={fromVersion}
                    onChange={(e) => setFromVersion(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {rows.map((r) => (
                      <option key={`from-${r.id}`} value={r.version}>
                        {r.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">比較先</span>
                  <select
                    value={toVersion}
                    onChange={(e) => setToVersion(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {rows.map((r) => (
                      <option key={`to-${r.id}`} value={r.version}>
                        {r.version}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={openDiff}
                  className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                >
                  表示
                </button>
              </div>
            </div>

            {fromVersion && toVersion && fromVersion === toVersion && (
              <p className="text-sm text-amber-700">比較元と比較先は異なる版を選択してください。</p>
            )}
          </div>
        )}
      </div>

      <Dialog open={deleteVersion != null} onClose={() => setDeleteVersion(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">版削除の確認</DialogTitle>
            <p className="mt-3 text-sm text-gray-700">
              版 {deleteVersion ?? ''} を削除します。よろしいですか？
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteVersion(null)}
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
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
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
