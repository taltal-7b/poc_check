import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useAddGroupUser,
  useAdminDisableTotp,
  useAdminEnableTotp,
  useAddUserProject,
  useAllProjects,
  useGroups,
  useRemoveGroupUser,
  useRemoveUserProject,
  useRoles,
  useUser,
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from '../../api/hooks';
import { type User, UserStatusCode } from '../../types';

type EditTabKey = 'general' | 'groups' | 'projects';

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

function mutationErrorMessage(err: unknown, fallback: string) {
  return typeof err === 'object' &&
    err &&
    'response' in err &&
    typeof (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ===
      'string'
    ? (err as { response?: { data?: { error?: { message?: string } } } }).response!.data!.error!.message!
    : fallback;
}

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const PER_PAGE = 10;
const SYSTEM_ADMIN_LABEL = 'システム管理者';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(mail: string) {
  if (!mail) return '';
  return EMAIL_PATTERN.test(mail) ? '' : 'メールアドレス形式で入力してください';
}

export default function UsersPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const usersParams = useMemo(() => ({ page, per_page: PER_PAGE }), [page]);
  const { data: usersRes, isLoading, isError } = useUsers(usersParams);
  const users = usersRes?.data ?? [];
  const pagination = usersRes?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const currentPage = Math.min(page, totalPages);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const adminEnableTotp = useAdminEnableTotp();
  const adminDisableTotp = useAdminDisableTotp();

  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editTab, setEditTab] = useState<EditTabKey>('general');
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [removeProjectTarget, setRemoveProjectTarget] = useState<{ id: string; name: string } | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editError, setEditError] = useState('');

  const userDetailQuery = useUser(editUser?.id ?? '');
  const editOpen = !!editUser;
  const groupsQuery = useGroups({ enabled: editOpen });
  const projectsQuery = useAllProjects({ enabled: !!editUser && addProjectOpen });
  const rolesQuery = useRoles({ enabled: editOpen });
  const addGroupUser = useAddGroupUser();
  const removeGroupUser = useRemoveGroupUser();
  const addProject = useAddUserProject();
  const removeProject = useRemoveUserProject();
  const userDetail = userDetailQuery.data?.data;
  const groups = groupsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];
  const roles = (rolesQuery.data?.data ?? []).filter((role) => role.assignable);
  const savedGroupIds = useMemo(() => new Set((userDetail?.groups ?? []).map((group) => group.id)), [userDetail?.groups]);
  const existingProjectIds = useMemo(() => new Set((userDetail?.projects ?? []).map((project) => project.projectId)), [userDetail?.projects]);
  const effectiveGroupIds = useMemo(() => {
    const next = new Set(savedGroupIds);
    for (const id of selectedGroupIds) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    return next;
  }, [savedGroupIds, selectedGroupIds]);

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
  const liveEmailError = validateEmail(form.mail);
  const hasBlockingPasswordError = !!livePasswordError || !!liveEmailError;

  const resetForm = () =>
    setForm({ login: '', firstname: '', lastname: '', mail: '', password: '', confirmPassword: '', admin: false, language: 'ja' });

  const openEdit = (u: User) => {
    setEditUser(u);
    setEditTab('general');
    setSelectedGroupIds(new Set());
    setSelectedProjectIds(new Set());
    setSelectedRoleIds(new Set());
    setRemoveProjectTarget(null);
    setEditMessage('');
    setEditError('');
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(form.mail);
    if (emailError) {
      setPasswordError('');
      return;
    }
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
    const emailError = validateEmail(form.mail);
    if (emailError) {
      setPasswordError('');
      return;
    }
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
      await userDetailQuery.refetch();
      setEditUser(null);
      resetForm();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'ユーザー更新に失敗しました';
      setPasswordError(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteUser.mutateAsync(id);
  };

  const closeEdit = () => {
    setEditUser(null);
    resetForm();
    setPasswordError('');
    setEditTab('general');
    setSelectedGroupIds(new Set());
    setSelectedProjectIds(new Set());
    setSelectedRoleIds(new Set());
    setRemoveProjectTarget(null);
    setEditMessage('');
    setEditError('');
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setEditMessage('');
    setEditError('');
  };

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const onSaveGroups = async () => {
    if (!editUser || selectedGroupIds.size === 0) return;
    setEditError('');
    setEditMessage('');
    try {
      for (const groupId of selectedGroupIds) {
        if (savedGroupIds.has(groupId)) await removeGroupUser.mutateAsync({ id: groupId, userId: editUser.id });
        else await addGroupUser.mutateAsync({ id: groupId, userId: editUser.id });
      }
      setSelectedGroupIds(new Set());
      await userDetailQuery.refetch();
      setEditMessage(t('groups.saved'));
    } catch (err: unknown) {
      setEditError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const openAddProject = () => {
    if (userDetailQuery.isLoading || !userDetail) return;
    setSelectedProjectIds(new Set());
    setSelectedRoleIds(new Set());
    setEditMessage('');
    setEditError('');
    setAddProjectOpen(true);
  };

  const onAddProjects = async () => {
    if (!editUser || selectedProjectIds.size === 0 || selectedRoleIds.size === 0) return;
    setEditMessage('');
    setEditError('');
    const roleIds = Array.from(selectedRoleIds);
    const failedProjectIds = new Set<string>();
    let firstError: unknown;
    for (const projectId of selectedProjectIds) {
      try {
        await addProject.mutateAsync({ id: editUser.id, projectId, roleIds });
      } catch (err: unknown) {
        failedProjectIds.add(projectId);
        firstError ??= err;
      }
    }
    await userDetailQuery.refetch();
    if (failedProjectIds.size > 0) {
      setSelectedProjectIds(failedProjectIds);
      setEditError(mutationErrorMessage(firstError, t('app.error')));
      return;
    }
    setAddProjectOpen(false);
    setSelectedProjectIds(new Set());
    setSelectedRoleIds(new Set());
    setEditMessage(t('groups.saved'));
  };

  const onRemoveProject = async () => {
    if (!editUser || !removeProjectTarget) return;
    setEditError('');
    setEditMessage('');
    try {
      await removeProject.mutateAsync({ id: editUser.id, projectId: removeProjectTarget.id });
      setRemoveProjectTarget(null);
      await userDetailQuery.refetch();
      setEditMessage(t('groups.saved'));
    } catch (err: unknown) {
      setEditError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const onEnableTotp = async () => {
    if (!editUser) return;
    setEditMessage('');
    setEditError('');
    try {
      await adminEnableTotp.mutateAsync(editUser.id);
      await userDetailQuery.refetch();
      setEditMessage('二段階認証を有効化しました');
    } catch (err: unknown) {
      setEditError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const onDisableTotp = async () => {
    if (!editUser) return;
    setEditMessage('');
    setEditError('');
    try {
      await adminDisableTotp.mutateAsync(editUser.id);
      await userDetailQuery.refetch();
      setEditMessage('二段階認証を無効化しました');
    } catch (err: unknown) {
      setEditError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const editTotpEnabled = userDetail?.totpEnabled ?? editUser?.totpEnabled ?? false;

  useEffect(() => {
    if (!pagination || page <= totalPages) return;
    const nextParams = new URLSearchParams(searchParams);
    if (totalPages <= 1) nextParams.delete('page');
    else nextParams.set('page', String(totalPages));
    setSearchParams(nextParams, { replace: true });
  }, [page, pagination, searchParams, setSearchParams, totalPages]);

  const setPage = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage <= 1) nextParams.delete('page');
    else nextParams.set('page', String(nextPage));
    setSearchParams(nextParams);
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
        <input
          type="email"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.mail}
          onChange={e => {
            setForm(f => ({ ...f, mail: e.target.value }));
            if (passwordError) setPasswordError('');
          }}
          required
        />
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
        {SYSTEM_ADMIN_LABEL}
      </label>
      {editUser && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-700">{t('myAccount.twoFactor')}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                現在{editTotpEnabled ? '有効' : '無効'}です
              </p>
            </div>
            {editTotpEnabled ? (
              <button
                type="button"
                onClick={() => void onDisableTotp()}
                disabled={adminDisableTotp.isPending}
                className="rounded border border-rose-600 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                無効化
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onEnableTotp()}
                disabled={adminEnableTotp.isPending}
                className="rounded border border-primary-600 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
              >
                有効化
              </button>
            )}
          </div>
        </div>
      )}
      {liveEmailError && <p className="text-sm text-red-600">{liveEmailError}</p>}
      {livePasswordError && <p className="text-sm text-red-600">{livePasswordError}</p>}
      {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('users.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { resetForm(); setPasswordError(''); setAddOpen(true); }} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            {t('users.new')}
          </button>
        </div>
      </div>

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.login')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.name')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.email')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{SYSTEM_ADMIN_LABEL}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('issues.status')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('users.createdAt')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-gray-900">
                      {u.login}
                    </td>
                    <td className="px-3 py-2 text-gray-800">{userDisplayName(u)}</td>
                    <td className="px-3 py-2 text-gray-700">{u.mail}</td>
                    <td className="px-3 py-2">
                      {u.admin ? <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{SYSTEM_ADMIN_LABEL}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={u.status} t={t} />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{u.createdAt ? format(new Date(u.createdAt), 'yyyy-MM-dd HH:mm') : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="rounded p-1 text-primary-600 hover:bg-primary-50"
                          onClick={() => openEdit(u)}
                          title={t('app.edit')}
                          aria-label={`${u.login} ${t('app.edit')}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(u.id)}
                          title={t('app.delete')}
                          aria-label={`${u.login} ${t('app.delete')}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-slate-600">
            {pagination.total}件中 {(currentPage - 1) * PER_PAGE + 1} - {Math.min(currentPage * PER_PAGE, pagination.total)}件
          </span>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('forums.prev')}
            </button>
            <span className="min-w-16 text-center text-slate-600">
              {currentPage} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= pagination.totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('forums.next')}
            </button>
          </div>
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

      <Dialog open={!!editUser} onClose={closeEdit} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{editUser ? userDisplayName(editUser) : t('app.edit')}</DialogTitle>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
                {(['general', 'groups', 'projects'] as EditTabKey[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setEditTab(tab);
                      setEditMessage('');
                    }}
                    className={`rounded px-3 py-1.5 text-sm ${
                      editTab === tab ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {tab === 'general' ? t('groups.general') : tab === 'groups' ? t('groups.title') : t('groups.projects')}
                  </button>
                ))}
              </div>

              {editTab === 'general' && (
                <form className="space-y-4" onSubmit={handleUpdate}>
                  {formFields}
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={closeEdit}>
                      {t('app.cancel')}
                    </button>
                    <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={updateUser.isPending || hasBlockingPasswordError}>
                      {t('app.save')}
                    </button>
                  </div>
                </form>
              )}

              {editTab === 'groups' && (
                <div className="space-y-4">
                  {userDetailQuery.isLoading ? (
                    <p className="text-sm text-gray-500">{t('app.loading')}</p>
                  ) : (
                    <div className="rounded border border-gray-200 p-3">
                      <div className="space-y-2">
                        {groups.map((group) => (
                          <label key={group.id} className="flex items-center gap-2 text-sm text-gray-800">
                            <input
                              type="checkbox"
                              checked={effectiveGroupIds.has(group.id)}
                              onChange={() => toggleGroup(group.id)}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600"
                            />
                            {group.name}
                          </label>
                        ))}
                        {groups.length === 0 && <p className="text-sm text-gray-500">{t('app.noData')}</p>}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void onSaveGroups()}
                      disabled={addGroupUser.isPending || removeGroupUser.isPending || selectedGroupIds.size === 0}
                      className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {t('groups.save')}
                    </button>
                  </div>
                </div>
              )}

              {editTab === 'projects' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={openAddProject}
                      disabled={userDetailQuery.isLoading}
                      className="inline-flex items-center gap-1.5 rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {t('groups.add')}
                    </button>
                  </div>
                  {userDetailQuery.isLoading ? (
                    <p className="text-sm text-gray-500">{t('app.loading')}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                          <tr>
                            <th className="px-4 py-3 font-medium">{t('projects.title')}</th>
                            <th className="px-4 py-3 font-medium">{t('members.roles')}</th>
                            <th className="px-4 py-3 text-center font-medium">{t('app.actions')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(userDetail?.projects ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-4 py-8 text-center text-gray-500">{t('app.noData')}</td>
                            </tr>
                          ) : (
                            (userDetail?.projects ?? []).map((project) => (
                              <tr key={project.memberId} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium text-gray-900">{project.projectName}</td>
                                <td className="px-4 py-2 text-gray-700">{project.roles.map((role) => role.name).join(', ') || '-'}</td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center justify-center">
                                    <button
                                      type="button"
                                      onClick={() => setRemoveProjectTarget({ id: project.projectId, name: project.projectName })}
                                      disabled={removeProject.isPending}
                                      className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                      title={t('groups.removeProject')}
                                      aria-label={`${project.projectName} ${t('groups.removeProject')}`}
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {editMessage && <p className="text-sm text-emerald-700">{editMessage}</p>}
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              {editTab !== 'general' && (
                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button type="button" onClick={closeEdit} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    {t('app.close')}
                  </button>
                </div>
              )}
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={addProjectOpen} onClose={() => setAddProjectOpen(false)} className="relative z-[60]">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('groups.add')} {t('projects.title')}</DialogTitle>
            <div className="mt-4 space-y-4">
              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-1 text-sm font-medium text-gray-800">{t('projects.title')}</legend>
                <div className="grid max-h-80 gap-x-6 gap-y-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((project) => {
                    const alreadyAdded = existingProjectIds.has(project.id);
                    return (
                      <label key={project.id} className={`flex min-w-0 items-start gap-2 text-sm ${alreadyAdded ? 'text-gray-400' : 'text-gray-800'}`}>
                        <input
                          type="checkbox"
                          checked={alreadyAdded || selectedProjectIds.has(project.id)}
                          disabled={alreadyAdded}
                          onChange={() => toggleProject(project.id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 disabled:text-gray-300"
                        />
                        <span className="break-words">{project.name}</span>
                      </label>
                    );
                  })}
                  {projectsQuery.isLoading && <p className="text-sm text-gray-500">{t('app.loading')}</p>}
                  {!projectsQuery.isLoading && projects.length === 0 && <p className="text-sm text-gray-500">{t('app.noData')}</p>}
                </div>
              </fieldset>
              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-1 text-sm font-medium text-gray-800">{t('members.roles')}</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm text-gray-800">
                      <input type="checkbox" checked={selectedRoleIds.has(role.id)} onChange={() => toggleRole(role.id)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                      {role.name}
                    </label>
                  ))}
                  {roles.length === 0 && <p className="text-sm text-gray-500">{t('app.noData')}</p>}
                </div>
              </fieldset>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAddProjectOpen(false)} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {t('app.cancel')}
                </button>
                <button type="button" onClick={() => void onAddProjects()} disabled={addProject.isPending || selectedProjectIds.size === 0 || selectedRoleIds.size === 0} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {t('groups.add')}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={!!removeProjectTarget} onClose={() => setRemoveProjectTarget(null)} className="relative z-[60]">
        <div className="fixed inset-0 bg-black/30" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-slate-900">{t('app.confirm')}</DialogTitle>
            <p className="mt-2 text-sm text-slate-600">
              このユーザーから <span className="font-semibold text-slate-800">{removeProjectTarget?.name}</span> を解除します。よろしいですか？
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setRemoveProjectTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('app.cancel')}
              </button>
              <button type="button" onClick={() => void onRemoveProject()} disabled={removeProject.isPending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {t('groups.removeProject')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
