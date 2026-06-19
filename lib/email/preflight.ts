import type { EmailCampaign } from './campaigns';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  detail?: string;
};

const PLACEHOLDER_URL_PATTERN = /CHANGE-ME(\.[^"'\s<>]*)?/i;
const HAS_LINK_PATTERN = /<a\s+[^>]*href="[^"]+"/i;
const EXCESSIVE_CAPS_PATTERN = /[A-Z]{8,}/;
const COMMON_SPAM_TRIGGERS = [
  'free',
  'guaranteed',
  'act now',
  'limited time',
  'risk-free',
  'no obligation',
  '100% free',
];

export function runPreflight(campaign: EmailCampaign): Check[] {
  const checks: Check[] = [];

  // ----- Subject -----
  const subject = (campaign.subject ?? '').trim();
  if (!subject) {
    checks.push({
      id: 'subject',
      label: 'Subject line',
      status: 'fail',
      message: 'Empty.',
      detail: 'Draft the email or write a subject manually before pushing.',
    });
  } else {
    const len = subject.length;
    const lower = subject.toLowerCase();
    const spamHits = COMMON_SPAM_TRIGGERS.filter((t) => lower.includes(t));
    if (len > 60) {
      checks.push({
        id: 'subject',
        label: 'Subject line',
        status: 'warn',
        message: `${len} chars — mobile clients truncate around 50.`,
        detail: 'Tighten the subject for better mobile inbox display.',
      });
    } else if (len < 20) {
      checks.push({
        id: 'subject',
        label: 'Subject line',
        status: 'warn',
        message: `${len} chars — short subjects can read as vague.`,
      });
    } else if (EXCESSIVE_CAPS_PATTERN.test(subject)) {
      checks.push({
        id: 'subject',
        label: 'Subject line',
        status: 'warn',
        message: `${len} chars but contains a long all-caps run.`,
        detail: 'Long uppercase runs read as shouty and trip spam filters.',
      });
    } else if (spamHits.length > 0) {
      checks.push({
        id: 'subject',
        label: 'Subject line',
        status: 'warn',
        message: `${len} chars. Contains spam-trigger phrase(s): ${spamHits.join(', ')}.`,
      });
    } else if (subject.includes('!!')) {
      checks.push({
        id: 'subject',
        label: 'Subject line',
        status: 'warn',
        message: `${len} chars but contains multiple exclamation marks.`,
      });
    } else {
      checks.push({
        id: 'subject',
        label: 'Subject line',
        status: 'pass',
        message: `${len} chars.`,
      });
    }
  }

  // ----- Preheader -----
  const preheader = (campaign.preheader ?? '').trim();
  if (!preheader) {
    checks.push({
      id: 'preheader',
      label: 'Preheader',
      status: 'warn',
      message: 'Empty.',
      detail:
        'Without a preheader the inbox preview falls back to the first body text — usually less specific.',
    });
  } else if (preheader.length > 130) {
    checks.push({
      id: 'preheader',
      label: 'Preheader',
      status: 'warn',
      message: `${preheader.length} chars — may truncate in some clients.`,
    });
  } else {
    checks.push({
      id: 'preheader',
      label: 'Preheader',
      status: 'pass',
      message: `${preheader.length} chars.`,
    });
  }

  // ----- HTML body -----
  const body = campaign.html_body ?? '';
  if (!body.trim()) {
    checks.push({
      id: 'body',
      label: 'HTML body',
      status: 'fail',
      message: 'Empty.',
      detail: 'Draft the email before pushing.',
    });
  } else if (PLACEHOLDER_URL_PATTERN.test(body)) {
    checks.push({
      id: 'body',
      label: 'HTML body',
      status: 'fail',
      message: 'Contains CHANGE-ME placeholder URL.',
      detail:
        'Find and replace placeholder URLs (or pick a hero image from the library) before pushing.',
    });
  } else if (!HAS_LINK_PATTERN.test(body)) {
    checks.push({
      id: 'body',
      label: 'HTML body',
      status: 'warn',
      message: 'No clickable link found in the body.',
      detail:
        'Email campaigns without a single clear CTA tend to perform badly. Add at least one anchor.',
    });
  } else {
    checks.push({
      id: 'body',
      label: 'HTML body',
      status: 'pass',
      message: 'Body present with at least one clickable link.',
    });
  }

  // ----- Brand -----
  if (!campaign.brand_id) {
    checks.push({
      id: 'brand',
      label: 'Brand',
      status: 'fail',
      message: 'No brand set.',
      detail: 'Pick a brand on the brief form so MARK knows whose voice to push as.',
    });
  } else {
    checks.push({ id: 'brand', label: 'Brand', status: 'pass', message: 'Set.' });
  }

  // ----- Audience -----
  if (campaign.address_book_ids.length === 0) {
    checks.push({
      id: 'audience',
      label: 'Audience books',
      status: 'warn',
      message: 'None selected.',
      detail:
        'No audience books are sent with the push — you will need to pick them inside dotdigital before scheduling. Set them here to keep the brief tidy.',
    });
  } else {
    checks.push({
      id: 'audience',
      label: 'Audience books',
      status: 'pass',
      message: `${campaign.address_book_ids.length} selected.`,
    });
  }

  // ----- Hero image -----
  if (!campaign.hero_image_url) {
    checks.push({
      id: 'hero',
      label: 'Hero image',
      status: 'warn',
      message: 'None selected.',
      detail: 'A promotional email without a hero looks like a text update. Pick one from the library if you have a relevant shot.',
    });
  } else {
    checks.push({
      id: 'hero',
      label: 'Hero image',
      status: 'pass',
      message: 'Set.',
    });
  }

  return checks;
}

export function canPush(checks: Check[]): boolean {
  return !checks.some((c) => c.status === 'fail');
}
