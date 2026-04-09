import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { FileText, Plus } from 'lucide-react';
import { useProject, useDocuments, useEnumerations } from '../api/hooks';
import api from '../api/client';
import type { Document } from '../types';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export default function DocumentsPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const qc = useQueryClient();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';

  const docsRaw = useDocuments(projectId);
  const documents = useMemo(() => unwrapList<Document>(docsRaw.data), [docsRaw.data]);

  const { data: catsRaw } = useEnumerations('DocumentCategory');
  const categories = useMemo(() => unwrapList<{ id: string; name: string }>(catsRaw), [catsRaw]);

  const byCategory = useMemo(() => {
    const map = new Map<string, Document[]>();
    for (const d of documents) {
      const key = d.categoryId || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [documents]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', categoryId: '' });

  const createDoc = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/documents`, {
        title: form.title.trim(),
        description: form.description || null,
        categoryId: form.categoryId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      setModalOpen(false);
      setForm({ title: '', description: '', categoryId: '' });
    },
  });

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText size={26} />
          {t('documents.title')}
        </h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus size={18} />
          {t('documents.new')}
        </button>
      </div>

      {Array.from(byCategory.entries()).map(([catId, list]) => (
        <section key={catId}>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">{categoryName(catId)}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => (
              <article key={d.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="font-medium text-gray-900">{d.title}</h3>
                {d.description && <p className="mt-2 text-sm text-gray-600 line-clamp-3">{d.description}</p>}
                <p className="mt-3 text-xs text-gray-500">
                  {d.createdAt ? format(parseISO(d.createdAt), 'yyyy-MM-dd') : '—'}
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}

      {documents.length === 0 && <p className="text-gray-500">{t('app.noData')}</p>}

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold">{t('documents.new')}</DialogTitle>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">{t('documents.titleField')}</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('projects.description')}</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('documents.category')}</span>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('app.required')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  disabled={!form.title.trim() || !form.categoryId || createDoc.isPending}
                  onClick={() => createDoc.mutate()}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {t('app.create')}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
