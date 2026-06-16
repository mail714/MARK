'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type DragEvent } from 'react';

const ACCEPTED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const ACCEPTED_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadDialog() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [folderName, setFolderName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }
  function close() {
    if (busy) return;
    dialogRef.current?.close();
    setFolderName('');
    setFiles([]);
    setError(null);
  }

  function acceptFiles(list: FileList | File[]) {
    const next: File[] = [...files];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED_MIME.test(f.type) && !ACCEPTED_EXT.some((e) => f.name.toLowerCase().endsWith(e))) {
        rejected.push(f.name);
        continue;
      }
      if (next.some((e) => e.name === f.name && e.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
    if (rejected.length) {
      setError(`Skipped: ${rejected.join(', ')} (unsupported file type)`);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files);
  }

  function removeFile(name: string, size: number) {
    setFiles((cur) => cur.filter((f) => !(f.name === name && f.size === size)));
  }

  async function submit() {
    setError(null);
    if (!folderName.trim()) {
      setError('Folder name is required.');
      return;
    }
    if (files.length === 0) {
      setError('Add at least one file.');
      return;
    }
    const fd = new FormData();
    fd.set('folderName', folderName.trim());
    for (const f of files) fd.append('files', f);

    setBusy(true);
    try {
      const res = await fetch('/api/case-studies/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      // Close + refresh so the new folder appears in Pending.
      dialogRef.current?.close();
      setFolderName('');
      setFiles([]);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const pdfCount = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).length;
  const photoCount = files.length - pdfCount;
  const totalBytes = files.reduce((n, f) => n + f.size, 0);

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
      >
        New case study
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-2xl rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
        onClose={close}
      >
        <div className="space-y-5 p-6">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">New case study</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Creates a folder in <code>1-Pending</code> and uploads the
              files. PDFs go to the folder root; photos go into a <code>photos/</code> subfolder.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
              Folder name
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              disabled={busy}
              placeholder="e.g. 60123 Cornwood Cricket Club"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
              Files
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`mt-1 rounded-md border-2 border-dashed p-6 text-center text-sm transition ${
                dragOver
                  ? 'border-neutral-700 bg-neutral-50'
                  : 'border-neutral-300 bg-white'
              }`}
            >
              <div className="font-medium text-neutral-700">
                Drag files here, or
                <label className="ml-1 cursor-pointer text-neutral-900 underline">
                  browse
                  <input
                    type="file"
                    multiple
                    accept={ACCEPTED_EXT.join(',')}
                    className="hidden"
                    onChange={(e) => e.target.files && acceptFiles(e.target.files)}
                  />
                </label>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Sales order PDF + proof PDF + install photos
              </div>
            </div>

            {files.length > 0 ? (
              <div className="mt-3 max-h-44 overflow-y-auto rounded border border-neutral-200">
                <ul className="divide-y divide-neutral-200">
                  {files.map((f) => (
                    <li
                      key={`${f.name}-${f.size}`}
                      className="flex items-center justify-between px-3 py-1.5 text-xs"
                    >
                      <span className="truncate">{f.name}</span>
                      <span className="ml-2 flex items-center gap-3 whitespace-nowrap text-neutral-500">
                        <span>{fmtBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(f.name, f.size)}
                          disabled={busy}
                          className="text-red-600 hover:underline"
                        >
                          remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-2 text-xs text-neutral-500">
              {pdfCount} PDF{pdfCount === 1 ? '' : 's'} · {photoCount} photo{photoCount === 1 ? '' : 's'} · {fmtBytes(totalBytes)}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !folderName.trim() || files.length === 0}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy ? 'Uploading…' : 'Upload to Drive'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
