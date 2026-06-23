import type { CampaignLink } from '@/lib/email/link-clicks';

function num(value: number): string {
  return value.toLocaleString('en-GB');
}

// Strips obvious dotdigital click-tracking wrappers / query gunk so the
// operator sees a recognisable URL. Falls back to the original on any error.
function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    // dotdigital wraps links through their tracking domain; show host + path
    // without the long opaque query string.
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

export function LinkClicksPanel({
  links,
  uniqueOpens,
}: {
  links: CampaignLink[];
  uniqueOpens: number | null;
}) {
  if (links.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-500">
        No link clicks pulled yet. Refresh stats once dotdigital has recorded
        activity.
      </div>
    );
  }

  const maxUnique = Math.max(...links.map((l) => l.unique_clicks), 1);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-3 py-2">Link</th>
            <th className="px-3 py-2 text-right">Unique</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">% of openers</th>
            <th className="px-3 py-2">Share</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => {
            const pctOfOpens =
              uniqueOpens && uniqueOpens > 0 ? (l.unique_clicks / uniqueOpens) * 100 : null;
            const barWidth = (l.unique_clicks / maxUnique) * 100;
            return (
              <tr key={l.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block max-w-md truncate text-xs text-neutral-800 hover:underline"
                    title={l.url}
                  >
                    {displayUrl(l.url)}
                  </a>
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-neutral-800">
                  {num(l.unique_clicks)}
                </td>
                <td className="px-3 py-2 text-right text-xs text-neutral-600">{num(l.total_clicks)}</td>
                <td className="px-3 py-2 text-right text-xs text-neutral-600">
                  {pctOfOpens === null ? '—' : `${pctOfOpens.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
