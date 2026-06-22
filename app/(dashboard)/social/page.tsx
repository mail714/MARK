import Link from 'next/link';
import { listSocialPosts } from '@/lib/social/posts';
import { listBrands } from '@/lib/brands';
import { PLATFORM_DOT, PLATFORM_LABEL } from '@/lib/social/platforms';
import { swatchForBrand } from '@/lib/email/brand-colours';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  scheduled: 'bg-blue-50 text-blue-700 ring-blue-200',
  published: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function SocialListPage() {
  const [posts, brands] = await Promise.all([listSocialPosts(), listBrands()]);
  const brandsById = new Map(brands.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Social posts</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Drafts generated from case studies and emails, one per platform configured for each brand.
            Review, edit, schedule.
          </p>
        </div>
        <Link
          href="/social/accounts"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Manage accounts →
        </Link>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
          No social posts yet. Generate variants from a{' '}
          <Link href="/case-studies" className="underline">case study</Link> to seed the list.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Post</th>
                <th className="px-3 py-2">Planned</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const brand = p.brand_id ? brandsById.get(p.brand_id) : null;
                const swatch = swatchForBrand(brand?.slug ?? null);
                const tone = STATUS_TONE[p.status] ?? STATUS_TONE.draft;
                return (
                  <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-2">
                      <Link href={`/social/${p.id}`} className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${PLATFORM_DOT[p.platform]}`} />
                        <span className="text-xs font-medium text-neutral-800">
                          {PLATFORM_LABEL[p.platform]}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {brand ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${swatch.badge} ${swatch.badgeText}`}
                        >
                          {brand.name}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/social/${p.id}`} className="block max-w-md truncate text-neutral-800 hover:underline">
                        {p.caption?.slice(0, 80) ?? p.internal_name ?? '(untitled)'}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">{fmtDate(p.planned_publish_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
