import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../../api/hooks';
import { type User, UserStatusCode } from '../../types';

function userDisplayName(u: User) {
  return [u.lastname, u.firstname].filter(Boolean).join(' ').trim() || u.login;
}

function statusLabel(status: number, t: (k: string) => string) {
  if (status === UserStatusCode.Active) return t('users.status.active');
  if (status === UserStatusCode.Registered) return t('users.status.registered');
  if (status === UserStatusCode.Locked) return t('users.status.locked');
  return String(status);
}

function StatusBadge({ status, t }: { status: number; t: (k: string) => string }) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
  if (status === UserStatusCode.Active) return <span className={`${base} bg-emerald-100 text-emerald-800`}>{statusLabel(status, t)}</span>;
  if (status === UserStatusCode.Registered) return <span className={`${base} bg-amber-100 text-amber-800`}>{statusLabel(status, t)}</span>;
  if (status === UserStatusCode.Locked) return <span className={`${base} bg-red-100 text-red-800`}>{statusLabel(status, t)}</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>{statusLabel(status, t)}</span>;
}

type StatusFilter = 'all' | 'active' | 'registered' | 'locked';
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export default function UsersPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const params = useMemo(() => {
    if (statusFilter === 'all') return undefined;
    const map: Record<Exclude<StatusFilter, 'all'>, number> = {
      active: UserStatusCode.Active,
      registered: UserStatusCode.Registered,
      locked: UserStatusCode.Locked,
    };
    return { status: map[statusFilter] };
  }, [statusFilter]);

  const { data: usersRes, isLoading, isError } = useUsers(params);
  const users = usersRes?.data ?? [];
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const [form, setForm] = useState({
    login: '',
    firstname: '',
    lastname: '',
    mail: '',
    password: '',
    confirmPassword: '',
    admin: false,
    language: 'ja',
  });
  const [passwordError, setPasswordError] = useState('');

  const validatePasswordPair = (password: string, confirmPassword: string, required: boolean) => {
    if (required && !password) return '新しいパスワードを入力してください';
    if (!password && !confirmPassword) return '';
    if (!password) return '新しいパスワードを入力してください';
    if (password.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上で入力してください`;
    if (password.length > PASSWORD_MAX) return `パスワードは${PASSWORD_MAX}文字以内で入力してください`;
    if (password !== confirmPassword) return '新しいパスワードと確認用パスワードが一致しません';
    return '';
  };

  const getLivePasswordError = (password: string, confirmPassword: string, required: boolean) => {
    if (!password && !confirmPassword) return required ? '新しいパスワードを入力してください' : '';
    if (password.length > 0 && password.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上で入力してください`;
    if (password.length > PASSWORD_MAX) return `パスワードは${PASSWORD_MAX}文字以内で入力してください`;
    if (confirmPassword.length > 0 && password !== confirmPassword) return '新しいパスワードと確認用パスワードが一致しません';
    return '';
  };

  const livePasswordError = getLivePasswordError(form.password, form.confirmPassword, !editUser);
  const hasBlockingPasswordError = !!livePasswordError;

  const resetForm = () =>
    setForm({ login: '', firstname: '', lastname: '', mail: '', password: '', confirmPassword: '', admin: false, language: 'ja' });

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({
      login: u.login,
      firstname: u.firstname,
      lastname: u.lastname,
      mail: u.mail,
      password: '',
      confirmPassword: '',
      admin: u.admin,
      language: u.language || 'ja',
    });
    setPasswordError('');
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === users.length) setSelected(new Set());
    else setSelected(new Set(users.map(u => u.id)));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePasswordPair(form.password, form.confirmPassword, true);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    setPasswordError('');
    try {
      await createUser.mutateAsync({
        login: form.login,
        firstname: form.firstname,
        lastname: form.lastname,
        mail: form.mail,
        password: form.password || undefined,
        admin: form.admin,
        language: form.language,
      });
      setAddOpen(false);
      resetForm();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'ユーザー作成に失敗しました';
      setPasswordError(msg);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    if (form.password || form.confirmPassword) {
      const validationError = validatePasswordPair(form.password, form.confirmPassword, false);
      if (validationError) {
        setPasswordError(validationError);
        return;
      }
    }
    setPasswordError('');
    try {
      await updateUser.mutateAsync({
        id: editUser.id,
        firstname: form.firstname,
        lastname: form.lastname,
        mail: form.mail,
        admin: form.admin,
        language: form.language,
        ...(form.password ? { password: form.password } : {}),
      });
      setEditUser(null);
      resetForm();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'ユーザー更新に失敗しました';
      setPasswordError(msg);
    }
  };

  const setLocked = async (u: User, locked: boolean) => {
    await updateUser.mutateAsync({
      id: u.id,
      status: locked ? UserStatusCode.Locked : UserStatusCode.Active,
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteUser.mutateAsync(id);
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const bulkLock = async (locked: boolean) => {
    const ids = [...selected];
    await Promise.all(ids.map(id => updateUser.mutateAsync({ id, status: locked ? UserStatusCode.Locked : UserStatusCode.Active })));
    setSelected(new Set());
  };

  const bulkDelete = async () => {
    if (!window.confirm(t('app.confirm'))) return;
    const ids = [...selected];
    await Promise.all(ids.map(id => deleteUser.mutateAsync(id)));
    setSelected(new Set());
  };

  const formFields = (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('users.login')}</label>
        <input
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.login}
          disabled={!!editUser}
          onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('auth.lastname')}</label>
          <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={form.lastname} onChange={e => setForm(f => ({ ...f, lastname: e.target.value }))} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('auth.firstname')}</label>
          <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={form.firstname} onChange={e => setForm(f => ({ ...f, firstname: e.target.value }))} required />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('users.email')}</label>
        <input type="email" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={form.mail} onChange={e => setForm(f => ({ ...f, mail: e.target.value }))} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{editUser ? t('auth.newPassword') : t('auth.password')}</label>
        <input
          type="password"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.password}
          onChange={e => {
            setForm(f => ({ ...f, password: e.target.value }));
            if (passwordError) setPasswordError('');
          }}
        />
        <p className="mt-1 text-xs text-gray-500">条件: 8文字以上128文字以内（確認用パスワードと一致）</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('auth.confirmPassword')}</label>
        <input
          type="password"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.confirmPassword}
          onChange={e => {
            setForm(f => ({ ...f, confirmPassword: e.target.value }));
            if (passwordError) setPasswordError('');
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.admin} onChange={e => setForm(f => ({ ...f, admin: e.target.checked }))} />
        {t('users.admin')}
      </label>
      {livePasswordError && <p className="text-sm text-red-600">{livePasswordError}</p>}
      {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('users.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">{t('search.scope.all')}</option>
            <option value="active">{t('users.status.active')}</option>
            <option value="registered">{t('users.status.registered')}</option>
            <option value="locked">{t('users.status.locked')}</option>
          </select>
          <button type="button" onClick={() => { resetForm(); setPasswordError(''); setAddOpen(true); }} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            {t('users.new')}
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <span className="text-gray-700">{t('admin.selectedCount', { count: selected.size })}</span>
          <button type="button" className="rounded bg-gray-800 px-3 py-1 text-white" onClick={() => bulkLock(true)}>
            {t('users.lock')}
          </button>
          <button type="button" className="rounded bg-gray-600 px-3 py-1 text-white" onClick={() => bulkLock(false)}>
            {t('users.unlock')}
          </button>
          <button type="button" className="rounded bg-red-600 px-3 py-1 text-white" onClick={bulkDelete}>
            {t('app.delete')}
          </button>
        </div>
      )}

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" checked={users.length > 0 && selected.size === users.length} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.login')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.name')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.email')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.admin')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('issues.status')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.createdAt')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-900">{u.login}</td>
                    <td className="px-3 py-2 text-gray-800">{userDisplayName(u)}</td>
                    <td className="px-3 py-2 text-gray-700">{u.mail}</td>
                    <td className="px-3 py-2">
                      {u.admin ? <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{t('users.admin')}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={u.status} t={t} />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{u.createdAt ? format(new Date(u.createdAt), 'yyyy-MM-dd HH:mm') : '—'}</td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(u)}>
                        {t('app.edit')}
                      </button>
                      {u.status === UserStatusCode.Locked ? (
                        <button type="button" className="text-gray-700 hover:underline" onClick={() => setLocked(u, false)}>
                          {t('users.unlock')}
                        </button>
                      ) : (
                        <button type="button" className="text-gray-700 hover:underline" onClick={() => setLocked(u, true)}>
                          {t('users.lock')}
                        </button>
                      )}
                      <button type="button" className="text-red-600 hover:underline" onClick={() => handleDelete(u.id)}>
                        {t('app.delete')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onClose={() => { setAddOpen(false); setPasswordError(''); }} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('users.new')}</DialogTitle>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              {formFields}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => { setAddOpen(false); setPasswordError(''); }}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={createUser.isPending || hasBlockingPasswordError}>
                  {t('app.create')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={!!editUser} onClose={() => { setEditUser(null); resetForm(); setPasswordError(''); }} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('app.edit')}</DialogTitle>
            <form className="mt-4 space-y-4" onSubmit={handleUpdate}>
              {formFields}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => { setEditUser(null); resetForm(); setPasswordError(''); }}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={updateUser.isPending || hasBlockingPasswordError}>
                  {t('app.save')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
