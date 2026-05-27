import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCaseStudy } from '@/lib/case-studies';
import { EditableField } from '@/components/case-studies/EditableField';
import { RegenerateButton } from '@/components/case-studies/RegenerateButton';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'bg-neutral-100 text-neutral-600 ring-neutral-200' },
  generating: { label: 'Generating', tone: 'bg-blue-50 text-blue-700 ring-blue-200' },
  draft: { label: 'Draft', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  published: { label: 'Published', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  failed: { label: 'Failed', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

export default async function CaseStudyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cs = await getCaseStudy(id);
  if (!cs) notFound();

  const status = STATUS_LABEL[cs.status] ?? STATUS_LABEL.pending;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div>
          <Link
            href="/case-studies"
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            ← All case studies
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {cs.customer_name ?? cs.drive_folder_name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
              <span className="font-mono">{cs.drive_folder_name}</span>
              {cs.so_number ? <span>SO #{cs.so_number}</span> : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ${status.tone}`}
            >
              {status.label}
            </span>
            <RegenerateButton driveFolderId={cs.drive_folder_id} />
          </div>
        </div>
        {cs.last_error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-mono text-red-800">
            {cs.last_error}
          </div>
        ) : null}
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Extracted spec
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Pulled from the sales order and proof PDFs. Edit anything that looks
          off — changes save when you tab out of the field.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2" key={cs.updated_at}>
          <EditableField
            caseStudyId={cs.id}
            field="customer_name"
            label="Customer name"
            initialValue={cs.customer_name}
          />
          <EditableField
            caseStudyId={cs.id}
            field="board_type"
            label="Board type"
            initialValue={cs.board_type}
            placeholder="Wooden / Acrylic / Lettering"
          />
          <EditableField
            caseStudyId={cs.id}
            field="board_size"
            label="Board size"
            initialValue={cs.board_size}
          />
          <EditableField
            caseStudyId={cs.id}
            field="back_colour"
            label="Back colour"
            initialValue={cs.back_colour}
            multiline
          />
          <EditableField
            caseStudyId={cs.id}
            field="text_colour"
            label="Text / graphics colour"
            initialValue={cs.text_colour}
            multiline
          />
          <EditableField
            caseStudyId={cs.id}
            field="edge_details"
            label="Edge / style details"
            initialValue={cs.edge_details}
            multiline
          />
          <EditableField
            caseStudyId={cs.id}
            field="fixings"
            label="Fixings"
            initialValue={cs.fixings}
            multiline
          />
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-neutral-300 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Generated copy
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          AI text generation is the next step. Once wired up, the H1 / Design
          Highlights / Summary / CTA / SEO meta / Schema fields will appear here
          for review and editing.
        </p>
      </section>
    </div>
  );
}
