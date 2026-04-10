import { useRef, useState, useMemo, useCallback, type ChangeEvent } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import sanitizeHtml from 'sanitize-html';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Image,
  Heading1,
  Heading2,
  Heading3,
  Paperclip,
  X as XIcon,
  FileIcon,
  Eye,
  PenLine,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  showAttachments?: boolean;
  id?: string;
}

type FormatAction =
  | { type: 'wrap'; before: string; after: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'block'; before: string; after: string }
  | { type: 'prompt'; label: string; template: (input: string) => string };

const FORMATS: { key: string; icon: React.ReactNode; action: FormatAction; title: string }[] = [
  { key: 'h1', icon: <Heading1 size={16} />, action: { type: 'prefix', prefix: '# ' }, title: '見出し1' },
  { key: 'h2', icon: <Heading2 size={16} />, action: { type: 'prefix', prefix: '## ' }, title: '見出し2' },
  { key: 'h3', icon: <Heading3 size={16} />, action: { type: 'prefix', prefix: '### ' }, title: '見出し3' },
  { key: 'sep1', icon: null, action: { type: 'wrap', before: '', after: '' }, title: '' },
  { key: 'bold', icon: <Bold size={16} />, action: { type: 'wrap', before: '**', after: '**' }, title: '太字' },
  { key: 'italic', icon: <Italic size={16} />, action: { type: 'wrap', before: '_', after: '_' }, title: '斜体' },
  { key: 'underline', icon: <Underline size={16} />, action: { type: 'wrap', before: '<u>', after: '</u>' }, title: '下線' },
  { key: 'strike', icon: <Strikethrough size={16} />, action: { type: 'wrap', before: '~~', after: '~~' }, title: '取り消し線' },
  { key: 'sep2', icon: null, action: { type: 'wrap', before: '', after: '' }, title: '' },
  { key: 'code', icon: <Code size={16} />, action: { type: 'wrap', before: '`', after: '`' }, title: 'インラインコード' },
  { key: 'codeblock', icon: <span className="text-[10px] font-mono font-bold leading-none">{'{ }'}</span>, action: { type: 'prompt', label: '言語 (例: js, python, html。空欄でも可)', template: (lang) => `\`\`\`${lang}\n\n\`\`\`` }, title: 'コードブロック' },
  { key: 'sep3', icon: null, action: { type: 'wrap', before: '', after: '' }, title: '' },
  { key: 'ul', icon: <List size={16} />, action: { type: 'prefix', prefix: '- ' }, title: '箇条書き' },
  { key: 'ol', icon: <ListOrdered size={16} />, action: { type: 'prefix', prefix: '1. ' }, title: '番号付きリスト' },
  { key: 'quote', icon: <Quote size={16} />, action: { type: 'prefix', prefix: '> ' }, title: '引用' },
  { key: 'sep4', icon: null, action: { type: 'wrap', before: '', after: '' }, title: '' },
  { key: 'link', icon: <LinkIcon size={16} />, action: { type: 'prompt', label: 'URL', template: (url) => `[リンク](${url})` }, title: 'リンク' },
  { key: 'image', icon: <Image size={16} />, action: { type: 'prompt', label: '画像URL', template: (url) => `![画像](${url})` }, title: '画像' },
];

const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : undefined;
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  const langLabel = language ? `<span class="hljs-lang-label">${lang}</span>` : '';
  return `<pre class="hljs">${langLabel}<code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>`;
};

marked.setOptions({ gfm: true, breaks: true });

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'del', 'u', 'ins', 'mark', 'pre', 'code', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    span: ['class', 'style'],
    pre: ['class', 'style'],
    h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'],
  },
  allowedClasses: {
    code: ['hljs', 'language-*'],
    pre: ['hljs'],
    span: ['hljs-*'],
  },
  textFilter(text) {
    return text;
  },
};

/** Render Markdown to sanitized HTML using the same pipeline as the editor preview. */
export function renderMarkdown(src: string): string {
  if (!src.trim()) return '';
  const parts = src.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  const escaped = parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      let t = part;
      t = t.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
      t = t.replace(/([^\n])\n(>\s)/g, '$1\n\n$2');
      t = t.replace(/([^\n])\n([-*+]\s)/g, '$1\n\n$2');
      t = t.replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2');
      t = t.replace(/<(?!\/?(a|b|i|u|em|strong|del|br|p|ul|ol|li|blockquote|h[1-6]|img|hr|table|thead|tbody|tr|th|td|pre|code|span|mark|ins|sub|sup)[\s>/])/gi, '&lt;');
      return t;
    })
    .join('');
  const raw = marked.parse(escaped, { async: false, gfm: true, breaks: true, renderer }) as string;
  return sanitizeHtml(raw, SANITIZE_OPTS);
}

export default function RichTextEditor({
  value,
  onChange,
  rows = 6,
  placeholder,
  files,
  onFilesChange,
  showAttachments = true,
  id,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const previewHtml = useMemo(() => {
    if (!previewing || !value.trim()) return '';
    return renderMarkdown(value);
  }, [previewing, value]);

  const applyFormat = useCallback(
    (action: FormatAction) => {
      if (previewing) return;
      const ta = textareaRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.slice(start, end);
      const before = value.slice(0, start);
      const after = value.slice(end);

      if (action.type === 'wrap') {
        const replacement = `${action.before}${selected || 'テキスト'}${action.after}`;
        const newVal = before + replacement + after;
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.focus();
          const selectStart = start + action.before.length;
          const selectEnd = selectStart + (selected || 'テキスト').length;
          ta.setSelectionRange(selectStart, selectEnd);
        });
      } else if (action.type === 'prefix') {
        const lines = (selected || 'テキスト').split('\n');
        const prefixed = lines.map((l) => action.prefix + l).join('\n');
        const newVal = before + prefixed + after;
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start, start + prefixed.length);
        });
      } else if (action.type === 'block') {
        const content = selected || 'コード';
        const needNewlineBefore = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
        const needNewlineAfter = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
        const block = `${needNewlineBefore}${action.before}${content}${action.after}${needNewlineAfter}`;
        const newVal = before + block + after;
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.focus();
          const contentStart = start + needNewlineBefore.length + action.before.length;
          ta.setSelectionRange(contentStart, contentStart + content.length);
        });
      } else if (action.type === 'prompt') {
        const input = window.prompt(action.label, selected || 'https://');
        if (input) {
          const replacement = action.template(input);
          const newVal = before + replacement + after;
          onChange(newVal);
          requestAnimationFrame(() => ta.focus());
        }
      }
    },
    [value, onChange, previewing],
  );

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || !onFilesChange) return;
      const current = files ?? [];
      onFilesChange([...current, ...Array.from(fileList)]);
    },
    [files, onFilesChange],
  );

  const removeFile = useCallback(
    (idx: number) => {
      if (!onFilesChange || !files) return;
      onFilesChange(files.filter((_, i) => i !== idx));
    },
    [files, onFilesChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || !onFilesChange) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const f = items[i].getAsFile();
          if (f) pastedFiles.push(f);
        }
      }
      if (pastedFiles.length > 0) {
        addFiles(Object.assign(pastedFiles, { length: pastedFiles.length }) as unknown as FileList);
      }
    },
    [addFiles, onFilesChange],
  );

  const rowHeight = rows * 1.5;

  return (
    <div
      className={`rounded-lg border ${dragOver ? 'border-primary-400 bg-primary-50/30' : 'border-slate-300'} overflow-hidden transition-colors`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
        {FORMATS.map((fmt) => {
          if (fmt.icon === null) {
            return <div key={fmt.key} className="mx-0.5 h-5 w-px bg-slate-300" />;
          }
          return (
            <button
              key={fmt.key}
              type="button"
              title={fmt.title}
              disabled={previewing}
              onClick={() => applyFormat(fmt.action)}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {fmt.icon}
            </button>
          );
        })}

        {showAttachments && onFilesChange && (
          <>
            <div className="mx-0.5 h-5 w-px bg-slate-300" />
            <button
              type="button"
              title="ファイル添付"
              onClick={() => fileInputRef.current?.click()}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            >
              <Paperclip size={16} />
            </button>
          </>
        )}

        {/* Spacer + Preview toggle */}
        <div className="ml-auto" />
        <button
          type="button"
          title={previewing ? '編集に戻る' : 'プレビュー'}
          onClick={() => setPreviewing((p) => !p)}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            previewing
              ? 'bg-primary-100 text-primary-700'
              : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
          }`}
        >
          {previewing ? <PenLine size={14} /> : <Eye size={14} />}
          {previewing ? '編集' : 'プレビュー'}
        </button>
      </div>

      {/* Textarea or Preview */}
      {previewing ? (
        <div
          className="rte-preview max-w-none overflow-auto px-4 py-3"
          style={{ minHeight: `${rowHeight}rem` }}
          dangerouslySetInnerHTML={{
            __html: previewHtml || '<p class="text-slate-400">プレビューする内容がありません</p>',
          }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          onPaste={handlePaste}
          className="w-full resize-y border-0 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-0"
        />
      )}

      {/* File list */}
      {showAttachments && onFilesChange && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          {(files ?? []).length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50/50 px-3 py-2">
              <ul className="space-y-1">
                {(files ?? []).map((f, idx) => (
                  <li key={`${f.name}-${idx}`} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-sm border border-slate-100">
                    <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Hint */}
      <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-1 text-[10px] text-slate-400">
        Markdown {showAttachments && onFilesChange ? '・ドラッグ＆ドロップまたはペーストでファイル添付可' : ''}
      </div>
    </div>
  );
}
