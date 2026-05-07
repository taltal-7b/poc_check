import { useEffect, useState, type ReactNode } from 'react';
import api from '../api/client';

export function useAttachmentObjectUrl(id: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    api
      .get(`/attachments/${id}/download`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return url;
}

export function AttachmentLink({
  id,
  filename,
  className,
  preview = false,
  children,
}: {
  id: string;
  filename: string;
  className?: string;
  preview?: boolean;
  children: ReactNode;
}) {
  const url = useAttachmentObjectUrl(id);
  return (
    <a
      href={url ?? undefined}
      target={preview ? '_blank' : undefined}
      rel={preview ? 'noreferrer' : undefined}
      download={preview ? undefined : filename}
      onClick={(event) => {
        if (!url) event.preventDefault();
      }}
      className={className}
    >
      {children}
    </a>
  );
}

export function AttachmentPreview({
  id,
  filename,
  imageClassName,
  linkClassName,
}: {
  id: string;
  filename: string;
  imageClassName?: string;
  linkClassName?: string;
}) {
  const url = useAttachmentObjectUrl(id);
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        if (!url) event.preventDefault();
      }}
      className={linkClassName}
    >
      {url ? (
        <img src={url} alt={filename} className={imageClassName} loading="lazy" />
      ) : (
        <div className={`${imageClassName ?? ''} bg-slate-100`} aria-label={filename} />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-0.5 text-[10px] text-white truncate">
        {filename}
      </span>
    </a>
  );
}
