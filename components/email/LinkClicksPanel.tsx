import type { CampaignLink } from '@/lib/email/link-clicks';
import { extractAnchorTexts, findAnchorText, parseTrackedUrl } from '@/lib/email/link-display';

function num(value: number): string {
  return value.toLocaleString('en-GB');
}

export function LinkClicksPanel({
  links,
  uniqueOpens,
  htmlBody,
}: {
  links: CampaignLink[];
  uniqueOpens: number | null;
  htmlBody: string | null;
}) {
  if (links.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-500">
        No link clicks pulled yet. Refresh stats once dotdigital has recorded activity.
      </div>
    );
  }

  const anchors = extractAnchorTexts(htmlBody);
  const maxUnique = Math.max(...links.map((l) => l.unique_clicks), 1);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-3 py-2">Link</th>
            <th className="px-3 py-2">Purpose</th>
            <th className="px-3 py-2 text-right">Unique</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">% openers</th>
            <th className="px-3 py-2">Share</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => {
            const parsed = parseTrackedUrl(l.url);
            const anchorText = findAnchorText(anchors, l.url);
            const pctOfOpens =
              uniqueOpens && uniqueOpens > 0 ? (l.unique_clicks / uniqueOpens) * 100 : null;
            const barWidth = (l.unique_clicks / maxUnique) * 100;
            return (
              <tr key={l.id} className="border-t border-neutral-100 align-top">
                <td className="px-3 py-2">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block max-w-md text-xs text-neutral-800 hover:underline"
                    title={l.url}
                  >
                    {anchorText ? (
                      <span className="font-medium">{anchorText}</span>
                    ) : (
                      <span className="font-medium text-neutral-700">{parsed.baseUrl}</span>
                    )}
                    {anchorText ? (
                      <span className="block truncate text-[10px] text-neutral-500">{parsed.baseUrl}</span>
                    ) : null}
                  </a>
                </td>
                <td className="px-3 py-2 text-xs">
                  {parsed.purpose ? (
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] text-neutral-700 ring-1 ring-neutral-200">
                      {parsed.purpose}
                    </span>
                  ) : (
                    <span className="text-[10px] text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-neutral-800">
                  {num(l.unique_clicks)}
                </td>
                <td className="px-3 py-2 text-right text-xs text-neutral-600">{num(l.total_clicks)}</td>
                <td className="px-3 py-2 text-right text-xs text-neutral-600">
                  {pctOfOpens === null ? '—' : `${pctOfOpens.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2">
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full bg-emerald-500" style={{ width: `${barWidth}%` }} />
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
