import { listPendingFolders, type PendingFolder } from '@/lib/drive/folders';

export const dynamic = 'force-dynamic';

function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function Row({ folder }: { folder: PendingFolder }) {
  const photoCount = folder.files.photos.length;
  return (
    <tr className="border-t border-neutral-200 hover:bg-neutral-50">
      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
        {folder.soNumber ? (
          <span className="text-neutral-500">({folder.soNumber}) </span>
        ) : null}
        {folder.customerName ?? folder.name}
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge ok={!!folder.files.salesOrder} label="Sales order" />
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge ok={!!folder.files.proof} label="Proof" />
      </td>
      <td className="px-4 py-3 text-sm text-neutral-600">
        {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
      </td>
      <td className="px-4 py-3 text-sm text-neutral-500">
        {fmtDate(folder.modifiedTime)}
      </td>
    </tr>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200'
          : 'inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 ring-1 ring-neutral-200'
      }
    >
      {ok ? '✓' : '–'} {label}
    </span>
  );
}

export default async function CaseStudiesPage() {
  const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;

  if (!rootId) {
    return (
      <ErrorState message="HONOURS_BOARDS_DRIVE_ROOT_ID is not set in .env.local" />
    );
  }

  let folders: PendingFolder[] = [];
  let error: string | null = null;

  try {
    folders = await listPendingFolders(rootId);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Case Studies</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Folders waiting in <code>1-Pending</code> for the Honours Boards brand.
        </p>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : folders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          No folders in <code>1-Pending</code> yet. Drop a job folder in Drive
          and refresh.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full">
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Job
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Sales order
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Proof
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Photos
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Modified
                </th>
              </tr>
            </thead>
            <tbody>
              {folders.map((f) => (
                <Row key={f.id} folder={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="font-medium">Could not load Drive folders</div>
      <div className="mt-1 font-mono text-xs">{message}</div>
    </div>
  );
}
