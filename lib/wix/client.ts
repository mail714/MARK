// Wix REST API client.
// Authenticates with a Wix Account API Key (https://manage.wix.com/account/api-keys)
// scoped to the Honours Boards site by default. Per-call `siteId` overrides
// let us target the new Signet Signs site for the image library.

export type WixError = { statusCode: number; message: string; body?: unknown };
export type WixRequestOptions = { siteId?: string };

function authHeaders(options: WixRequestOptions = {}): Record<string, string> {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = options.siteId ?? process.env.WIX_SITE_ID_HONOURS_BOARDS;
  if (!apiKey) throw new Error('WIX_API_KEY is not set');
  if (!siteId) throw new Error('Wix siteId not provided and no default site env var set');
  return {
    Authorization: apiKey,
    'wix-site-id': siteId,
    'Content-Type': 'application/json',
  };
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  options?: WixRequestOptions,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: authHeaders(options),
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
  get: <T>(url: string, options?: WixRequestOptions) => request<T>('GET', url, undefined, options),
  post: <T>(url: string, body: unknown, options?: WixRequestOptions) => request<T>('POST', url, body, options),
  patch: <T>(url: string, body: unknown, options?: WixRequestOptions) => request<T>('PATCH', url, body, options),
  put: <T>(url: string, body: unknown, options?: WixRequestOptions) => request<T>('PUT', url, body, options),
  delete: <T>(url: string, options?: WixRequestOptions) => request<T>('DELETE', url, options),
};
