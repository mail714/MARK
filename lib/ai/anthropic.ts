import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

// Opus 4.7 — used by default for the case-study drafting flow. Tuned harder
// against the obvious AI tells (em-dash overuse, AI vocabulary, uniform
// sentence cadence) than Sonnet, which matters since the drafts get scanned
// by AI-content detectors before publication.
export const DEFAULT_MODEL = 'claude-opus-4-7';
