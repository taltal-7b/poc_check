import { AlertTriangle } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import ProjectSubNav from '../components/ProjectSubNav';

function projectIdentifierFromPath(pathname: string) {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export default function NotFoundPage({ showProjectNav = true }: { showProjectNav?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ identifier?: string }>();
  const projectIdentifier = params.identifier ?? projectIdentifierFromPath(location.pathname);

  return (
    <div className="space-y-6">
      {showProjectNav && projectIdentifier && <ProjectSubNav identifier={projectIdentifier} />}

      <section className="max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900">404</h1>
        <div className="mt-5 flex items-start gap-2 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>アクセスしようとしたページは存在しないか削除されています。</p>
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm">
          <button type="button" onClick={() => navigate(-1)} className="text-primary-700 hover:underline">
            戻る
          </button>
          <Link to="/" className="text-primary-700 hover:underline">
            ホームへ
          </Link>
        </div>
      </section>
    </div>
  );
}
