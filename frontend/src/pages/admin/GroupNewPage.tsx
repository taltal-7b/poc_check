import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateGroup } from '../../api/hooks';

export default function GroupNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createGroup = useCreateGroup();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setError('');
    try {
      await createGroup.mutateAsync({ name: trimmed });
      navigate('/admin/groups');
    } catch (err: unknown) {
      const message =
        typeof err === 'object' &&
        err &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ===
          'string'
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response!.data!.error!.message!
          : t('app.error');
      setError(message);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <button
        type="button"
        onClick={() => navigate('/admin/groups')}
        className="text-sm text-primary-700 hover:underline"
      >
        ← {t('groups.title')}
      </button>
      <h1 className="text-2xl font-semibold text-gray-900">{t('groups.new')}</h1>

      <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('groups.name')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            maxLength={255}
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!name.trim() || createGroup.isPending}
            className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.create')}
          </button>
          <Link
            to="/admin/groups"
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('app.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
