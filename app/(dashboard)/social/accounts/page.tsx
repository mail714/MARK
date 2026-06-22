import Link from 'next/link';
import { listBrands } from '@/lib/brands';
import { listBrandSocialAccounts } from '@/lib/social/accounts';
import {
  PLATFORM_DOT,
  PLATFORM_LABEL,
  platformsForBrand,
  type SocialPlatform,
} from '@/lib/social/platforms';
import { swatchForBrand } from '@/lib/email/brand-colours';
import { AccountRowEditor } from '@/components/social/AccountRowEditor';

export const dynamic = 'force-dynamic';

export default async function SocialAccountsPage() {
  const [brands, accounts] = await Promise.all([listBrands(), listBrandSocialAccounts()]);

  const byBrandPlatform = new Map<string, (typeof accounts)[number]>();
  for (const a of accounts) {
    byBrandPlatform.set(`${a.brand_id}:${a.platform}`, a);
  }

  // Only show brands that actually publish to social — keeps the page tidy
  // and reflects PLATFORMS_BY_BRAND_SLUG.
  const brandsWithPlatforms = brands
    .map((b) => ({ brand: b, platforms: platformsForBrand(b.slug) }))
    .filter((x) => x.platforms.length > 0);

  return (
    <div className="space-y-8">
      <header>
        <div>
          <Link href="/social" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← All social posts
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Social accounts</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Where each brand lives on each platform. The AI drafter uses these handles in
          captions where natural; the calendar uses the profile URL as a fallback &quot;view
          live&quot; link until each post has its own.
        </p>
      </header>

      {brandsWithPlatforms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
          No brands are configured for social publishing yet.
        </div>
      ) : (
        <div className="space-y-8">
          {brandsWithPlatforms.map(({ brand, platforms }) => {
            const swatch = swatchForBrand(brand.slug);
            return (
              <section key={brand.id} className="rounded-lg border border-neutral-200 bg-white p-5">
                <header className="mb-4 flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${swatch.badge} ${swatch.badgeText}`}
                  >
                    {brand.name}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {platforms.length} platform{platforms.length === 1 ? '' : 's'}
                  </span>
                </header>

                <div className="hidden gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500 sm:grid sm:grid-cols-[140px_1fr_2fr_2fr]">
                  <span>Platform</span>
                  <span>Handle</span>
                  <span>Profile URL</span>
                  <span>Notes</span>
                </div>

                <div className="space-y-3">
                  {platforms.map((platform: SocialPlatform) => {
                    const existing = byBrandPlatform.get(`${brand.id}:${platform}`);
                    return (
                      <div
                        key={platform}
                        className="grid items-start gap-2 border-t border-neutral-100 pt-3 sm:grid-cols-[140px_1fr]"
                      >
                        <div className="flex items-center gap-2 pt-1.5">
                          <span className={`h-2 w-2 rounded-full ${PLATFORM_DOT[platform]}`} />
                          <span className="text-sm font-medium text-neutral-800">
                            {PLATFORM_LABEL[platform]}
                          </span>
                        </div>
                        <AccountRowEditor
                          brandId={brand.id}
                          platform={platform}
                          initial={{
                            handle: existing?.handle ?? null,
                            profile_url: existing?.profile_url ?? null,
                            notes: existing?.notes ?? null,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
