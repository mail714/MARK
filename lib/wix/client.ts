// Wix REST API client.
// Authenticates with a Wix Account API Key (https://manage.wix.com/account/api-keys)
// scoped to the Honours Boards site.

export type WixError = { statusCode: number; message: string; body?: unknown };

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID_HONOURS_BOARDS;
  if (!apiKey) throw new Error('WIX_API_KEY is not set');
  if (!siteId) throw new Error('WIX_SITE_ID_HONOURS_BOARDS is not set');
  return {
    Authorization: apiKey,
    'wix-site-id': siteId,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
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
        : '') || `Wix ${method} ${url} failed (${res.status})`;
    const err: WixError = { statusCode: res.status, message, body: parsed };
    throw Object.assign(new Error(message), err);
  }
  return parsed as T;
}

export const wix = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
};
