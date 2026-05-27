import sharp from 'sharp';

export const HERO_WIDTH = 1200;
export const HERO_HEIGHT = 900;
export const THUMB_LONG_EDGE = 512;

export type ProcessedImage = {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
};

export async function resizeToHero(input: Buffer | Uint8Array): Promise<ProcessedImage> {
  const buffer = await sharp(input)
    .rotate()
    .resize(HERO_WIDTH, HERO_HEIGHT, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return { buffer, contentType: 'image/jpeg', width: HERO_WIDTH, height: HERO_HEIGHT };
}

// Small JPEG for sending to Claude vision. Long edge ~512px keeps token
// cost low while preserving enough detail to pick a hero vs a close-up.
export async function makeVisionThumb(input: Buffer | Uint8Array): Promise<ProcessedImage> {
  const image = sharp(input).rotate();
  const metadata = await image.metadata();
  const w = metadata.width ?? THUMB_LONG_EDGE;
  const h = metadata.height ?? THUMB_LONG_EDGE;
  const longEdge = Math.max(w, h);
  const scale = longEdge > THUMB_LONG_EDGE ? THUMB_LONG_EDGE / longEdge : 1;

  const buffer = await image
    .resize(Math.round(w * scale), Math.round(h * scale), { fit: 'inside' })
    .jpeg({ quality: 75 })
    .toBuffer();
  return {
    buffer,
    contentType: 'image/jpeg',
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  };
}
