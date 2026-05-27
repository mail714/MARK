import { extractText, getDocumentProxy } from 'unpdf';

export async function pdfBytesToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export function normaliseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
