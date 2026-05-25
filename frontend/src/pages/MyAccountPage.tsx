import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import {
  useConfirmTotp,
  useDisableTotp,
  useMailNotificationPreference,
  useMe,
  useSetupTotp,
  useTotpStatus,
  useUpdateMailNotificationPreference,
  useUpdateMe,
} from '../api/hooks';
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
  const [mailNotificationsEnabled, setMailNotificationsEnabled] = useState(true);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mailPreferenceMessage, setMailPreferenceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [totpMessage, setTotpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [totpCurrentPassword, setTotpCurrentPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpSetupStarted, setTotpSetupStarted] = useState(false);

  useEffect(() => {
    if (!me) return;
    setFirstname(me.firstname);
    setLastname(me.lastname);
    setEmail(me.mail);
  }, [me]);

  const updateMe = useUpdateMe();
  const mailPreferenceQuery = useMailNotificationPreference();
  const updateMailPreference = useUpdateMailNotificationPreference();
  const totpStatusQuery = useTotpStatus();
  const setupTotp = useSetupTotp();
  const confirmTotp = useConfirmTotp();
  const disableTotp = useDisableTotp();

  useEffect(() => {
    const pref = mailPreferenceQuery.data?.data;
    if (!pref) return;
    setMailNotificationsEnabled(pref.mailNotificationsEnabled);
  }, [mailPreferenceQuery.data]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    try {
      await updateMe.mutateAsync({
        firstname,
        lastname,
        mail: email,
        language: 'ja',
      });
      await i18n.changeLanguage('ja');
      localStorage.setItem('language', 'ja');
      qc.invalidateQueries({ queryKey: ['me'] });
      setProfileMessage({ type: 'success', text: 'プロフィールを保存しました' });
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || 'プロフィールの保存に失敗しました';
      setProfileMessage({ type: 'error', text: message });
    }
    setTimeout(() => setProfileMessage(null), 5000);
  };

  const saveMailPreference = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMailPreference.mutateAsync({ mailNotificationsEnabled });
      setMailPreferenceMessage({ type: 'success', text: 'メール通知設定を保存しました' });
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || 'メール通知設定の保存に失敗しました';
      setMailPreferenceMessage({ type: 'error', text: message });
    }
    setTimeout(() => setMailPreferenceMessage(null), 5000);
  };

  const showTotpMessage = (message: { type: 'success' | 'error'; text: string }) => {
    setTotpMessage(message);
    setTimeout(() => setTotpMessage(null), 5000);
  };

  const startTotpSetup = async () => {
    setTotpCode('');
    try {
      await setupTotp.mutateAsync({ currentPassword: totpCurrentPassword });
      setTotpSetupStarted(true);
      showTotpMessage({ type: 'success', text: '認証コードをメールで送信しました' });
    } catch (error: any) {
      showTotpMessage({ type: 'error', text: error?.response?.data?.error?.message || '認証コードの送信に失敗しました' });
    }
  };

  const confirmTotpSetup = async () => {
    try {
      await confirmTotp.mutateAsync({ code: totpCode });
      setTotpSetupStarted(false);
      setTotpCurrentPassword('');
      setTotpCode('');
      showTotpMessage({ type: 'success', text: '二段階認証を有効にしました' });
    } catch (error: any) {
      showTotpMessage({ type: 'error', text: error?.response?.data?.error?.message || '認証コードが正しくありません' });
    }
  };

  const onDisableTotp = async () => {
    try {
      await disableTotp.mutateAsync({ currentPassword: totpCurrentPassword });
      setTotpCurrentPassword('');
      setTotpCode('');
      showTotpMessage({ type: 'success', text: '二段階認証を無効にしました' });
    } catch (error: any) {
      showTotpMessage({ type: 'error', text: error?.response?.data?.error?.message || '二段階認証の無効化に失敗しました' });
    }
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
        {profileMessage && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              profileMessage.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {profileMessage.text}
          </div>
        )}
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
            disabled={updateMe.isPending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.save')}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('myAccount.mailNotifications')}</h2>
        {mailPreferenceMessage && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              mailPreferenceMessage.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {mailPreferenceMessage.text}
          </div>
        )}
        {mailPreferenceQuery.isLoading ? (
          <p className="text-sm text-gray-500">{t('app.loading')}</p>
        ) : (
          <form onSubmit={saveMailPreference} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={mailNotificationsEnabled}
                onChange={(e) => setMailNotificationsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              {t('myAccount.mailNotificationsEnabled')}
            </label>
            <p className="text-sm text-gray-600">{t('myAccount.mailNotificationsHelp')}</p>
            <button
              type="submit"
              disabled={updateMailPreference.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {updateMailPreference.isPending ? t('app.loading') : t('app.save')}
            </button>
          </form>
        )}
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
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('myAccount.twoFactor')}</h2>
        {totpMessage && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              totpMessage.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {totpMessage.text}
          </div>
        )}
        {totpStatusQuery.isLoading ? (
          <p className="text-sm text-gray-500">{t('app.loading')}</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {totpStatusQuery.data?.data.totpEnabled ? '現在有効です' : '現在無効です'}
              <span className="ml-2 text-gray-500">
                認証コードは {totpStatusQuery.data?.data.mail ?? me.mail} に送信されます。
              </span>
            </div>

            {!totpStatusQuery.data?.data.totpEnabled && !totpSetupStarted && (
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="text-gray-700">{t('auth.currentPassword')}</span>
                  <input
                    type="password"
                    value={totpCurrentPassword}
                    onChange={(e) => setTotpCurrentPassword(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={startTotpSetup}
                  disabled={setupTotp.isPending || !totpCurrentPassword}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {setupTotp.isPending ? t('app.loading') : '二段階認証を有効にする'}
                </button>
              </div>
            )}

            {!totpStatusQuery.data?.data.totpEnabled && totpSetupStarted && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  メールで届いた6桁の認証コードを{totpStatusQuery.data?.data.expiresInMinutes ?? 5}分以内に入力してください。
                </p>
                <label className="block text-sm">
                  <span className="text-gray-700">認証コード</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmTotpSetup}
                    disabled={confirmTotp.isPending || !totpCode}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {confirmTotp.isPending ? t('app.loading') : '確認して有効化'}
                  </button>
                  <button
                    type="button"
                    onClick={startTotpSetup}
                    disabled={setupTotp.isPending || !totpCurrentPassword}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    再送信
                  </button>
                </div>
              </div>
            )}

            {totpStatusQuery.data?.data.totpEnabled && (
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="text-gray-700">{t('auth.currentPassword')}</span>
                  <input
                    type="password"
                    value={totpCurrentPassword}
                    onChange={(e) => setTotpCurrentPassword(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={onDisableTotp}
                  disabled={disableTotp.isPending || !totpCurrentPassword}
                  className="rounded-lg border border-rose-600 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  無効にする
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('myAccount.apiKey')}</h2>
        <p className="text-sm text-gray-600 mb-3">個人用APIアクセスキーを再生成します。</p>
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



