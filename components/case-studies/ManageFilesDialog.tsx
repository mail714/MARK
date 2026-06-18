'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from 'react';
import { classifyForPreview, roleLabel, roleTone } from '@/lib/classify-files';

const ACCEPTED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const ACCEPTED_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

type FolderFiles = {
  salesOrder: DriveFile | null;
  proof: DriveFile | null;
  photos: DriveFile[];
  other: DriveFile[];
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ManageFilesDialog({
  driveFolderId,
  folderName,
}: {
  driveFolderId: string;
  folderName: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [files, setFiles] = useState<FolderFiles | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/drive/folders/${driveFolderId}/files`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setFiles(data.files as FolderFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function open() {
    setPending([]);
    setError(null);
    dialogRef.current?.showModal();
    void load();
  }
  function close() {
    if (uploading || busyFileId) return;
    dialogRef.current?.close();
  }

  // Refresh the queue once the dialog closes — covers all the in-dialog
  // mutations in one shot rather than refreshing after every action.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    function onClose() {
      startTransition(() => router.refresh());
    }
    d.addEventListener('close', onClose);
    return () => d.removeEventListener('close', onClose);
  }, [router, startTransition]);

  async function removeFile(file: DriveFile) {
    if (!window.confirm(`Move "${file.name}" to Drive trash?`)) return;
    setBusyFileId(file.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/drive/folders/${driveFolderId}/files/${file.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyFileId(null);
    }
  }

  function acceptIncoming(list: FileList | File[]) {
    const next = [...pending];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED_MIME.test(f.type) && !ACCEPTED_EXT.some((e) => f.name.toLowerCase().endsWith(e))) {
        rejected.push(f.name);
        continue;
      }
      if (next.some((e) => e.name === f.name && e.size === f.size)) continue;
      next.push(f);
    }
    setPending(next);
    if (rejected.length) setError(`Skipped: ${rejected.join(', ')} (unsupported file type)`);
  }

  // Classify pending uploads with awareness of what already lives in the folder
  // so the badges reflect the right pair-up outcome.
  const previewByName = useMemo(() => {
    const context = {
      hasSalesOrder: !!files?.salesOrder,
      hasProof: !!files?.proof,
    };
    const classified = classifyForPreview(
      pending.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      context,
    );
    const m = new Map<string, (typeof classified)[number]>();
    for (const c of classified) m.set(`${c.name}-${c.size}`, c);
    return m;
  }, [pending, files]);

  async function uploadPending() {
    if (pending.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of pending) fd.append('files', f);
      const res = await fetch(`/api/drive/folders/${driveFolderId}/files`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      setPending([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Files
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-2xl rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="space-y-5 p-6">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{folderName}</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Manage Drive files in this job folder. Deletions go to Drive trash;
              new uploads are classified the same way as a fresh case study.
            </p>
          </div>

          {loading ? (
            <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
              Loading…
            </div>
          ) : files ? (
            <div className="space-y-3">
              <FileLine
                label="Sales order"
                file={files.salesOrder}
                busy={busyFileId}
                onDelete={removeFile}
              />
              <FileLine
                label="Proof"
                file={files.proof}
                busy={busyFileId}
                onDelete={removeFile}
              />
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Photos ({files.photos.length})
                </div>
                {files.photos.length === 0 ? (
                  <div className="mt-1 rounded border border-dashed border-neutral-200 p-2 text-xs text-neutral-500">
                    No photos yet
                  </div>
                ) : (
                  <ul className="mt-1 divide-y divide-neutral-200 rounded border border-neutral-200">
                    {files.photos.map((p) => (
                      <RawLine
                        key={p.id}
                        file={p}
                        busy={busyFileId}
                        onDelete={removeFile}
                      />
                    ))}
                  </ul>
                )}
              </div>
              {files.other.length > 0 ? (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Other ({files.other.length})
                  </div>
                  <ul className="mt-1 divide-y divide-neutral-200 rounded border border-neutral-200">
                    {files.other.map((f) => (
                      <RawLine
                        key={f.id}
                        file={f}
                        busy={busyFileId}
                        onDelete={removeFile}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Add more files
            </div>
            <div
              onDragOver={(e: DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) acceptIncoming(e.dataTransfer.files);
              }}
              className={`mt-1 rounded-md border-2 border-dashed p-4 text-center text-sm transition ${
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
                    onChange={(e) => e.target.files && acceptIncoming(e.target.files)}
                  />
                </label>
              </div>
            </div>
            {pending.length > 0 ? (
              <ul className="mt-2 divide-y divide-neutral-200 rounded border border-neutral-200">
                {pending.map((f) => {
                  const p = previewByName.get(`${f.name}-${f.size}`);
                  return (
                    <li
                      key={`${f.name}-${f.size}`}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {p ? (
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${roleTone(p.role)}`}
                          >
                            {roleLabel(p.role)}
                          </span>
                        ) : null}
                        <span className="truncate">{f.name}</span>
                      </div>
                      <span className="flex items-center gap-3 whitespace-nowrap text-neutral-500">
                        <span>{fmtBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPending((cur) =>
                              cur.filter((e) => !(e.name === f.name && e.size === f.size)),
                            )
                          }
                          disabled={uploading}
                          className="text-red-600 hover:underline disabled:text-neutral-400"
                        >
                          remove
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {pending.length > 0 ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={uploadPending}
                  disabled={uploading}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300"
                >
                  {uploading ? 'Uploading…' : `Upload ${pending.length} file${pending.length === 1 ? '' : 's'}`}
                </button>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              disabled={uploading || !!busyFileId}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-wait disabled:text-neutral-400"
            >
              Done
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function FileLine({
  label,
  file,
  busy,
  onDelete,
}: {
  label: string;
  file: DriveFile | null;
  busy: string | null;
  onDelete: (f: DriveFile) => void;
}) {
  return (
    <div className="rounded border border-neutral-200 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      {file ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="truncate text-neutral-800">{file.name}</span>
          <button
            type="button"
            onClick={() => onDelete(file)}
            disabled={busy === file.id}
            className="text-xs font-medium text-red-600 hover:underline disabled:text-neutral-400"
          >
            {busy === file.id ? 'Removing…' : 'Delete'}
          </button>
        </div>
      ) : (
        <div className="mt-1 text-xs text-neutral-500">Not detected</div>
      )}
    </div>
  );
}

function RawLine({
  file,
  busy,
  onDelete,
}: {
  file: DriveFile;
  busy: string | null;
  onDelete: (f: DriveFile) => void;
}) {
  return (
    <li className="flex items-center justify-between px-3 py-1.5 text-xs">
      <span className="truncate text-neutral-700">{file.name}</span>
      <button
        type="button"
        onClick={() => onDelete(file)}
        disabled={busy === file.id}
        className="ml-2 text-red-600 hover:underline disabled:text-neutral-400"
      >
        {busy === file.id ? 'Removing…' : 'Delete'}
      </button>
    </li>
  );
}
