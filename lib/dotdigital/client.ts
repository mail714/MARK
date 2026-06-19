// dotdigital REST API client.
// Authenticates with an API user (Settings → Access → API users in the
// dotdigital admin) using HTTP Basic. Region (r1 / r2 / r3) comes from the
// DOTDIGITAL_API_BASE env var so we don't have to think about it per call.

export type DotdigitalError = { statusCode: number; message: string; body?: unknown };

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const user = process.env.DOTDIGITAL_API_USER;
  const password = process.env.DOTDIGITAL_API_PASSWORD;
  if (!user) throw new Error('DOTDIGITAL_API_USER is not set');
  if (!password) throw new Error('DOTDIGITAL_API_PASSWORD is not set');
  const basic = Buffer.from(`${user}:${password}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

function urlFor(path: string): string {
  const base = process.env.DOTDIGITAL_API_BASE;
  if (!base) throw new Error('DOTDIGITAL_API_BASE is not set');
  const trimmed = base.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(urlFor(path), {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : '') || `dotdigital ${method} ${path} failed (${res.status})`;
    const err: DotdigitalError = { statusCode: res.status, message, body: parsed };
    throw Object.assign(new Error(message), err);
  }
  return parsed as T;
}

export const dotdigital = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
