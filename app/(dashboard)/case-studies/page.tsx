import Link from 'next/link';
import {
  getCompletedCaseStudies,
  getHonoursBoardsPendingFolders,
  type CompletedCaseStudy,
  type PendingFolderWithStatus,
} from '@/lib/case-studies';
import { GenerateButton } from '@/components/case-studies/GenerateButton';
import { DeleteButton } from '@/components/case-studies/DeleteButton';

export const dynamic = 'force-dynamic';

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'bg-neutral-100 text-neutral-600 ring-neutral-200' },
  generating: { label: 'Generating', tone: 'bg-blue-50 text-blue-700 ring-blue-200' },
  draft: { label: 'Draft', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  published: { label: 'Published', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  failed: { label: 'Failed', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${meta.tone}`}
    >
      {meta.label}
    </span>
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

function PendingRow({ folder }: { folder: PendingFolderWithStatus }) {
  const photoCount = folder.files.photos.length;
  const cs = folder.caseStudy;
  return (
    <tr className="border-t border-neutral-200 hover:bg-neutral-50">
      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
        <div>{folder.name}</div>
        {cs ? <div className="mt-1"><StatusPill status={cs.status} /></div> : null}
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
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {cs ? (
            <Link
              href={`/case-studies/${cs.id}`}
              className="text-xs font-medium text-neutral-700 underline-offset-2 hover:underline"
            >
              View draft →
            </Link>
          ) : (
            <GenerateButton driveFolderId={folder.id} />
          )}
          <DeleteButton
            driveFolderId={folder.id}
            folderName={folder.name}
          />
        </div>
      </td>
    </tr>
  );
}

function CompletedRow({ cs }: { cs: CompletedCaseStudy }) {
  return (
    <tr className="border-t border-neutral-200 hover:bg-neutral-50">
      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
        <Link href={`/case-studies/${cs.id}`} className="hover:underline">
          {cs.customer_name ?? cs.drive_folder_name}
        </Link>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
          <StatusPill status={cs.status} />
          {cs.so_number ? <span>SO #{cs.so_number}</span> : null}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-neutral-600">
        {fmtDate(cs.published_at)}
      </td>
      <td className="px-4 py-3 text-sm">
        {cs.wix_published_url ? (
          <a
            href={cs.wix_published_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-neutral-700 underline-offset-2 hover:underline"
          >
            View live →
          </a>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/case-studies/${cs.id}`}
            className="text-xs font-medium text-neutral-700 underline-offset-2 hover:underline"
          >
            Open →
          </Link>
          <DeleteButton
            driveFolderId={cs.drive_folder_id}
            folderName={cs.drive_folder_name}
            isPublished={cs.status === 'published'}
          />
        </div>
      </td>
    </tr>
  );
}

export default async function CaseStudiesPage() {
  let folders: PendingFolderWithStatus[] = [];
  let completed: CompletedCaseStudy[] = [];
  let error: string | null = null;

  try {
    folders = await getHonoursBoardsPendingFolders();
    completed = await getCompletedCaseStudies(folders.map((f) => f.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Case Studies</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Honours Boards jobs awaiting work and recently completed studies.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium">Could not load</div>
          <div className="mt-1 font-mono text-xs">{error}</div>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Pending — Drive <code className="text-xs">1-Pending</code>
        </h2>
        {folders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
            No folders in <code>1-Pending</code>. Drop a job folder in Drive and refresh.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full">
              <thead className="bg-neutral-50 text-left">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Job</th>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Sales order</th>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Proof</th>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Photos</th>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Modified</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => <PendingRow key={f.id} folder={f} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Completed
        </h2>
        {completed.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            No case studies published yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full">
              <thead className="bg-neutral-50 text-left">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Case study</th>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Published</th>
                  <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Live URL</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {completed.map((cs) => <CompletedRow key={cs.id} cs={cs} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
