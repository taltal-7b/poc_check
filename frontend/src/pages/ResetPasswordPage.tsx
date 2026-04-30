import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfirmPasswordReset } from '../api/hooks';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const confirmReset = useConfirmPasswordReset();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (password !== passwordConfirmation) {
      setError('新しいパスワードと確認用パスワードが一致しません');
      return;
    }
    try {
      const res = await confirmReset.mutateAsync({ token, password, passwordConfirmation });
      setMessage(res.data.message);
      setPassword('');
      setPasswordConfirmation('');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || t('app.error'));
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="bg-primary-600 px-6 py-5 text-center">
          <h1 className="text-xl font-semibold text-white">{t('app.title')}</h1>
          <p className="mt-1 text-sm text-primary-100">パスワード再設定</p>
        </div>
        <div className="space-y-4 px-6 py-6">
          {!token && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              パスワード再設定リンクが無効です。再設定メールをもう一度送信してください。
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </div>
          )}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {token && !message && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">{t('auth.newPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">{t('auth.confirmPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </label>
              <button
                type="submit"
                disabled={confirmReset.isPending || !password || !passwordConfirmation}
                className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {confirmReset.isPending ? t('app.loading') : 'パスワードを再設定'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-slate-600">
            <Link to={message ? '/login?reset=1' : '/login'} className="font-medium text-primary-600 hover:text-primary-700">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
