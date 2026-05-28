import fs from 'node:fs';
import path from 'node:path';
import { google, type drive_v3 } from 'googleapis';

let cached: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
  if (cached) return cached;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  }

  const absolute = path.isAbsolute(keyPath)
    ? keyPath
    : path.join(process.cwd(), keyPath);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Service account JSON not found at ${absolute}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: absolute,
    // Full Drive access so we can move folders between 1-Pending and
    // 3-Published. The service account is only shared on the case-studies
    // root folder, so the blast radius is contained to that subtree.
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  cached = google.drive({ version: 'v3', auth });
  return cached;
}
