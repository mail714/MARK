import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSocialPost } from '@/lib/social/posts';
import { listBrands } from '@/lib/brands';
import { PLATFORM_DOT, PLATFORM_LABEL } from '@/lib/social/platforms';
import { swatchForBrand } from '@/lib/email/brand-colours';
import { SocialPostEditor } from '@/components/social/SocialPostEditor';

export const dynamic = 'force-dynamic';

export default async function SocialPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [post, brands] = await Promise.all([getSocialPost(id), listBrands()]);
  if (!post) notFound();

  const brand = post.brand_id ? brands.find((b) => b.id === post.brand_id) ?? null : null;
  const swatch = swatchForBrand(brand?.slug ?? null);

  const sourceHref =
    post.source_type === 'case-study' && post.source_id
      ? `/case-studies/${post.source_id}`
      : post.source_type === 'email' && post.source_id
        ? `/emails/campaigns/${post.source_id}`
        : null;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div>
          <Link href="/social" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← All social posts
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${PLATFORM_DOT[post.platform]}`} />
              <h1 className="text-2xl font-semibold tracking-tight">
                {PLATFORM_LABEL[post.platform]}
              </h1>
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              {post.internal_name ?? '(untitled)'}
              {sourceHref ? (
                <>
                  {' '}· <Link href={sourceHref} className="underline">Source</Link>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {brand ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ${swatch.badge} ${swatch.badgeText}`}
              >
                {brand.name}
              </span>
            ) : null}
            {post.sector ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 ring-1 ring-neutral-200">
                {post.sector}
              </span>
            ) : null}
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 ring-1 ring-neutral-200">
              {post.status}
            </span>
          </div>
        </div>
      </header>

      <SocialPostEditor post={post} />
    </div>
  );
}
