import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLogin } from '../api/hooks';
import { useAuthStore } from '../stores/auth';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginMutation = useLogin();
  const authLogin = useAuthStore((s) => s.login);

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const registered = searchParams.get('registered') === '1';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    loginMutation.mutate(
      {
        login: loginId.trim(),
        password,
        ...(totpRequired && totpCode.trim() ? { totpCode: totpCode.trim() } : {}),
      },
      {
        onSuccess: (res) => {
          const payload = res.data;
          if (payload?.accessToken && payload?.refreshToken && payload?.user) {
            authLogin(payload.user, payload.accessToken, payload.refreshToken);
            navigate('/');
            return;
          }
          if (payload?.totpRequired) {
            setTotpRequired(true);
            return;
          }
          setFormError(t('auth.loginFailed'));
        },
        onError: () => {
          setFormError(t('auth.loginFailed'));
        },
      },
    );
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="bg-primary-600 px-6 py-5 text-center">
          <h1 className="text-xl font-semibold text-white">{t('app.title')}</h1>
          <p className="mt-1 text-sm text-primary-100">{t('auth.login')}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          {registered && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {t('auth.registerSuccess')}
            </div>
          )}
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
          )}
          <div>
            <label htmlFor="login" className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.loginName')}
            </label>
            <input
              id="login"
              name="login"
              type="text"
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          {totpRequired && (
            <div>
              <label htmlFor="totp" className="mb-1 block text-sm font-medium text-slate-700">
                {t('auth.totpCode')}
              </label>
              <input
                id="totp"
                name="totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder={t('auth.totpRequired')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
              <p className="mt-1 text-xs text-slate-500">{t('auth.totpRequired')}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loginMutation.isPending ? t('app.loading') : t('auth.login')}
          </button>
          <p className="text-center text-sm text-slate-600">
            <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
              {t('auth.register')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
