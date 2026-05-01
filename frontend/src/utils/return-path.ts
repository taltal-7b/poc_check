/**
 * ログイン後の `from` クエリ検証（オープンリダイレクト抑止）。
 * アプリ内の既知プレフィックスのみ許可する。
 *
 * トップレベルに新しいパス（例: `/reports/...`）を増やしたら、
 * ログイン戻り先として許可する場合は下の配列にプレフィックスを追加すること。
 */
const ALLOWED_RETURN_PREFIXES = [
  '/projects',
  '/issues',
  '/activity',
  '/search',
  '/my',
  '/users',
  '/admin',
] as const;

function decodeReturnCandidate(from: string | null): string | null {
  if (from == null || from === '') return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(from);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (decoded.includes('@') || decoded.includes('\\')) return null;
  return decoded;
}

function pathnameOf(fullPath: string): string {
  const noHash = fullPath.split('#')[0];
  const q = noHash.indexOf('?');
  return q === -1 ? noHash : noHash.slice(0, q);
}

function isAuthOnlyPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register' || pathname.startsWith('/password/');
}

function isAllowedAppPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '') return true;
  return ALLOWED_RETURN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function safeReturnPath(from: string | null): string {
  const decoded = decodeReturnCandidate(from);
  if (!decoded) return '/';
  const pathname = pathnameOf(decoded);
  if (isAuthOnlyPath(pathname)) return '/';
  if (!isAllowedAppPath(pathname)) return '/';
  return decoded;
}

/**
 * 未認証時に遷移するログイン URL（`from` は検証済みのみ付与。未許可パスは `from` なし）。
 */
export function buildLoginNavigateTo(pathnameWithSearch: string): string {
  const safe = safeReturnPath(pathnameWithSearch);
  const pathOnly = pathnameOf(pathnameWithSearch);
  const rejected = safe === '/' && pathOnly !== '/' && pathOnly !== '';
  if (rejected) {
    return '/login';
  }
  return `/login?from=${encodeURIComponent(safe)}`;
}
