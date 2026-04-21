import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ProjectSubNav from '../components/ProjectSubNav';
import { useProject, useWikiDiff } from '../api/hooks';

type DiffRow = {
  kind: 'context' | 'add' | 'remove';
  text: string;
};

function buildUnifiedDiff(oldText: string, newText: string): DiffRow[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: 'context', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: 'remove', text: a[i] });
      i += 1;
    } else {
      rows.push({ kind: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ kind: 'remove', text: a[i] });
    i += 1;
  }
  while (j < m) {
    rows.push({ kind: 'add', text: b[j] });
    j += 1;
  }
  return rows;
}

export default function WikiDiffPage() {
  const { identifier, title } = useParams<{ identifier: string; title: string }>();
  const [searchParams] = useSearchParams();
  const decodedTitle = title ? decodeURIComponent(title) : '';
  const from = Number(searchParams.get('from'));
  const to = Number(searchParams.get('to'));

  const { data: projectRaw } = useProject(identifier ?? '');
  const projectId = projectRaw?.data?.id ?? '';

  const diffQuery = useWikiDiff(projectId, decodedTitle, from, to);
  const diffData = diffQuery.data?.data;

  const diffRows = useMemo(() => {
    if (!diffData) return [];
    return buildUnifiedDiff(diffData.oldText, diffData.newText);
  }, [diffData]);

  if (!identifier || !decodedTitle) {
    return <p className="text-gray-500">差分を表示できません。</p>;
  }

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            差分: {decodedTitle}（{from} → {to}）
          </h1>
          <Link
            to={`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}/history`}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            履歴に戻る
          </Link>
        </div>

        {diffQuery.isLoading ? (
          <p className="text-sm text-gray-500">差分を読み込み中...</p>
        ) : diffQuery.isError ? (
          <p className="text-sm text-red-600">差分の取得に失敗しました。</p>
        ) : !diffData ? (
          <p className="text-sm text-gray-500">比較対象が見つかりません。</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              リビジョン {diffData.fromVersion} → リビジョン {diffData.toVersion}
            </div>
            <pre className="m-0 text-sm font-mono leading-6">
              {diffRows.map((r, idx) => {
                const baseClass =
                  r.kind === 'add'
                    ? 'bg-green-50 text-green-800'
                    : r.kind === 'remove'
                      ? 'bg-red-50 text-red-800'
                      : 'text-gray-700';
                const prefix = r.kind === 'add' ? '+' : r.kind === 'remove' ? '-' : ' ';
                return (
                  <div key={idx} className={`px-3 whitespace-pre-wrap break-all ${baseClass}`}>
                    {prefix}
                    {r.text || ' '}
                  </div>
                );
              })}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
