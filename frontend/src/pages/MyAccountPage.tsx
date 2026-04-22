import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useMe, useUpdateUser } from '../api/hooks';
import api from '../api/client';
import type { User } from '../types';

function unwrap<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'data' in raw && !Array.isArray(raw)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export default function MyAccountPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: meRaw } = useMe();
  const me = unwrap<User>(meRaw);

  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!me) return;
    setFirstname(me.firstname);
    setLastname(me.lastname);
    setEmail(me.mail);
  }, [me]);

  const updateUser = useUpdateUser();

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    await updateUser.mutateAsync({
      id: me.id,
      firstname,
      lastname,
      mail: email,
      language: 'ja',
    });
    await i18n.changeLanguage('ja');
    localStorage.setItem('language', 'ja');
    qc.invalidateQueries({ queryKey: ['me'] });
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const changePassword = useMutation({
    mutationFn: async () => {
      await api.put('/auth/password', {
        currentPassword,
        newPassword,
        newPasswordConfirmation: confirmPassword,
      });
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ type: 'success', text: 'パスワードを変更しました' });
      setTimeout(() => setPasswordMessage(null), 5000);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error?.message || 'パスワードの変更に失敗しました';
      setPasswordMessage({ type: 'error', text: message });
      setTimeout(() => setPasswordMessage(null), 5000);
    },
  });

  const [apiKeyPreview, setApiKeyPreview] = useState<string | null>(null);
  const regenerateKey = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/api_key/regenerate');
      const body = res.data as { data?: { apiKey?: string }; apiKey?: string };
      return body.data?.apiKey ?? body.apiKey ?? '(regenerated)';
    },
    onSuccess: (key) => setApiKeyPreview(key),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const deleteAccount = useMutation({
    mutationFn: async () => {
      await api.delete('/auth/me');
    },
    onSuccess: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    },
  });

  if (!me) {
    return <p className="text-gray-500">{t('app.loading')}</p>;
  }

  return (
    <div className="max-w-2xl space-y-10">
      <h1 className="text-2xl font-bold text-gray-900">{t('nav.myAccount')}</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('myAccount.profile')}</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-gray-700">{t('auth.lastname')}</span>
              <input
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">{t('auth.firstname')}</span>
              <input
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-700">{t('auth.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={updateUser.isPending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.save')}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('auth.password')}</h2>
        {passwordMessage && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              passwordMessage.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {passwordMessage.text}
          </div>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newPassword !== confirmPassword) {
              setPasswordMessage({ type: 'error', text: '新しいパスワードと確認用パスワードが一致しません' });
              setTimeout(() => setPasswordMessage(null), 5000);
              return;
            }
            changePassword.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="text-gray-700">{t('auth.currentPassword')}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t('auth.newPassword')}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t('auth.confirmPassword')}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={changePassword.isPending || !newPassword || !currentPassword}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.save')}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('myAccount.apiKey')}</h2>
        <p className="text-sm text-gray-600 mb-3">個人用APIアクセストークンを再生成します。</p>
        {apiKeyPreview && (
          <pre className="mb-3 rounded bg-gray-100 p-3 text-xs break-all">{apiKeyPreview}</pre>
        )}
        <button
          type="button"
          onClick={() => regenerateKey.mutate()}
          disabled={regenerateKey.isPending}
          className="rounded-lg border border-amber-600 text-amber-800 px-4 py-2 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
        >
          {t('myAccount.regenerate')}
        </button>
      </section>

      <section className="rounded-lg border border-rose-200 bg-rose-50/50 p-6">
        <h2 className="text-lg font-semibold text-rose-900 mb-2">{t('myAccount.deleteAccount')}</h2>
        <p className="text-sm text-rose-800/90 mb-4">{t('myAccount.deleteWarning')}</p>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          {t('app.delete')}
        </button>
      </section>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('app.confirm')}</DialogTitle>
            <p className="mt-2 text-sm text-gray-600">{t('myAccount.deleteConfirm')}</p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="DELETE"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                {t('app.cancel')}
              </button>
              <button
                type="button"
                disabled={deleteConfirm !== 'DELETE' || deleteAccount.isPending}
                onClick={() => deleteAccount.mutate()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {t('app.delete')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
