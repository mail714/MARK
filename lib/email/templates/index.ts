import { multiSectionTemplate } from './multi-section';
import { plainTextTemplate } from './plain-text';
import { simpleHeroTemplate } from './simple-hero';
import type { EmailTemplate } from './types';

export const TEMPLATES: Record<string, EmailTemplate> = {
  'plain-text': plainTextTemplate,
  'simple-hero': simpleHeroTemplate,
  'multi-section': multiSectionTemplate,
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>;

export function getTemplate(key: string | null | undefined): EmailTemplate {
  const k = key && TEMPLATES[key] ? key : 'simple-hero';
  return TEMPLATES[k];
}

export type { EmailTemplate } from './types';
