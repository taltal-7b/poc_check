import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRequestPasswordReset } from '../api/hooks';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const requestReset = useRequestPasswordReset();
  const [mail, setMail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const res = await requestReset.mutateAsync({ mail: mail.trim() });
      setMessage(res.data.message);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || t('app.error'));
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="bg-primary-600 px-6 py-5 text-center">
          <h1 className="text-xl font-semibold text-white">{t('app.title')}</h1>
          <p className="mt-1 text-sm text-primary-100">{t('auth.forgotPassword')}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </div>
          )}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{t('auth.email')}</span>
            <input
              type="email"
              autoComplete="email"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </label>
          <button
            type="submit"
            disabled={requestReset.isPending || !mail.trim()}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requestReset.isPending ? t('app.loading') : '再設定メールを送信'}
          </button>
          <p className="text-center text-sm text-slate-600">
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              {t('auth.login')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

