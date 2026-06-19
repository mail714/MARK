'use client';

import { useEffect, useRef } from 'react';

// Renders the email HTML inside a sandboxed iframe so styles can't leak into
// the dashboard and links can't navigate it away. Resizes the iframe to the
// content height on every update.
export function EmailPreview({ html }: { html: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>body{margin:16px;background:#fff;}</style></head><body>${html ?? ''}</body></html>`,
    );
    doc.close();
    // Resize to content height after the doc paints.
    const sync = () => {
      const h = doc.body.scrollHeight;
      frame.style.height = `${Math.max(h + 32, 200)}px`;
    };
    sync();
    const t = setTimeout(sync, 100);
    return () => clearTimeout(t);
  }, [html]);

  if (!html) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
        No draft yet. Click <strong>Draft with AI</strong> to generate one.
      </div>
    );
  }

  return (
    <iframe
      ref={ref}
      sandbox="allow-same-origin"
      className="w-full rounded-lg border border-neutral-200 bg-white"
      title="Email preview"
    />
  );
}
