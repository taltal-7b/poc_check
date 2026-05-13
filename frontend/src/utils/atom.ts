import api from '../api/client';

export async function openAuthenticatedAtom(atomUrl: string) {
  try {
    const apiPath = atomUrl.startsWith('/api/v1') ? atomUrl.slice('/api/v1'.length) : atomUrl;
    const res = await api.get<Blob>(apiPath, {
      responseType: 'blob',
      headers: { Accept: 'application/atom+xml' },
    });
    const blob = new Blob([res.data], { type: 'application/atom+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    throw error;
  }
}
