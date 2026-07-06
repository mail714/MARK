'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { CalendarEvent } from '@/lib/calendar/events';
import { swatchForBrand } from '@/lib/email/brand-colours';

type Brand = { id: string; slug: string; name: string };

const SOURCE_LABEL: Record<string, string> = {
  email: 'Email campaign',
  'case-study': 'Case study published',
  social: 'Social post',
  manual: 'Calendar entry',
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CalendarEventModal({
  event,
  brand,
  onClose,
}: {
  event: CalendarEvent | null;
  brand: Brand | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (event && !dialog.open) dialog.showModal();
    if (!event && dialog.open) dialog.close();
  }, [event]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    function handleClose() {
      onClose();
    }
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="w-full max-w-md rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
    >
      {event ? <ModalContents event={event} brand={brand} onClose={onClose} /> : null}
    </dialog>
  );
}

function ModalContents({
  event,
  brand,
  onClose,
}: {
  event: CalendarEvent;
  brand: Brand | null;
  onClose: () => void;
}) {
  const swatch = swatchForBrand(brand?.slug ?? null);
  return (
    <div className="space-y-4 p-5">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            {SOURCE_LABEL[event.source] ?? event.source}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{event.title}</h2>
        {event.subtitle ? (
          <p className="text-sm text-neutral-600">{event.subtitle}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {brand ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ${swatch.badge} ${swatch.badgeText}`}
            >
              {brand.name}
            </span>
          ) : null}
          {event.sector ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 ring-1 ring-neutral-200">
              {event.sector}
            </span>
          ) : null}
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 ring-1 ring-neutral-200">
            {event.status}
          </span>
        </div>
      </header>

      <dl className="space-y-2 text-sm">
        <Row label="Date">{fmtDate(event.date)}</Row>
        {event.source === 'email' ? <EmailRows detail={event.detail} /> : null}
        {event.source === 'case-study' ? (
          <CaseStudyRows detail={event.detail} />
        ) : null}
        {event.source === 'social' ? <SocialRows detail={event.detail} /> : null}
      </dl>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        {event.liveUrl ? (
          <a
            href={event.liveUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            View live →
          </a>
        ) : null}
        <Link
          href={event.detailHref}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
        >
          Open
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-2 first:border-t-0 first:pt-0">
      <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="text-right text-neutral-800">{children}</dd>
    </div>
  );
}

function EmailRows({ detail }: { detail: Record<string, unknown> }) {
  const preheader = typeof detail.preheader === 'string' ? detail.preheader : null;
  const ct = typeof detail.campaign_type === 'string' ? detail.campaign_type : null;
  const books = typeof detail.address_book_count === 'number' ? detail.address_book_count : 0;
  const ddId =
    typeof detail.dotdigital_campaign_id === 'number'
      ? detail.dotdigital_campaign_id
      : null;
  return (
    <>
      {ct ? <Row label="Type">{ct}</Row> : null}
      <Row label="Audience">
        {books > 0 ? `${books} book${books === 1 ? '' : 's'} selected` : 'No books selected'}
      </Row>
      {preheader ? (
        <Row label="Preheader">
          <span className="text-xs text-neutral-600">{preheader}</span>
        </Row>
      ) : null}
      {ddId ? <Row label="dotdigital ID">{ddId}</Row> : null}
    </>
  );
}

function SocialRows({ detail }: { detail: Record<string, unknown> }) {
  const platform = typeof detail.platform === 'string' ? detail.platform : null;
  const mediaKind = typeof detail.media_kind === 'string' ? detail.media_kind : null;
  const mediaCount = typeof detail.media_count === 'number' ? detail.media_count : 0;
  const caption = typeof detail.caption === 'string' ? detail.caption : null;
  const shotBrief = typeof detail.shot_brief === 'string' ? detail.shot_brief : null;
  const hashtags = Array.isArray(detail.hashtags) ? (detail.hashtags as string[]) : [];
  return (
    <>
      {platform ? <Row label="Platform">{PLATFORM_LABEL[platform] ?? platform}</Row> : null}
      {mediaKind ? (
        <Row label="Media">
          {mediaKind === 'none' ? 'Text only' : `${mediaCount} ${mediaKind}${mediaCount === 1 ? '' : 's'}`}
        </Row>
      ) : null}
      {hashtags.length > 0 ? (
        <Row label="Hashtags">
          <span className="text-xs text-neutral-600">
            {hashtags.slice(0, 4).map((h) => `#${h}`).join(' ')}
            {hashtags.length > 4 ? ` +${hashtags.length - 4}` : ''}
          </span>
        </Row>
      ) : null}
      {caption ? (
        <Row label="Caption">
          <span className="line-clamp-3 max-w-[220px] text-left text-xs text-neutral-600">
            {caption}
          </span>
        </Row>
      ) : null}
      {shotBrief ? (
        <Row label="Shoot">
          <span className="line-clamp-2 max-w-[220px] text-left text-xs text-amber-800">
            {shotBrief}
          </span>
        </Row>
      ) : null}
    </>
  );
}

function CaseStudyRows({ detail }: { detail: Record<string, unknown> }) {
  const boardType = typeof detail.board_type === 'string' ? detail.board_type : null;
  const boardSize = typeof detail.board_size === 'string' ? detail.board_size : null;
  return (
    <>
      {boardType ? <Row label="Board type">{boardType}</Row> : null}
      {boardSize ? <Row label="Size">{boardSize}</Row> : null}
    </>
  );
}
