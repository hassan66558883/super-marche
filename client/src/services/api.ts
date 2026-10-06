/**
 * HTTP client: attaches the access token and active branch, refreshes the
 * access token once on expiry (single-flight), and normalises errors.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.code === 'NETWORK';
  }
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number } & Record<string, unknown>;
  message?: string;
  code?: string;
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

type TokenProvider = {
  getToken: () => string | null;
  getBranchId: () => string | null;
  refresh: () => Promise<string | null>;
  onAuthFailure: () => void;
};

let provider: TokenProvider = {
  getToken: () => null,
  getBranchId: () => null,
  refresh: async () => null,
  onAuthFailure: () => undefined,
};

export const configureApi = (p: TokenProvider) => {
  provider = p;
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export function buildQuery(q?: Query): string {
  if (!q) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  raw?: boolean; // return Response (downloads)
  skipAuthRetry?: boolean;
  signal?: AbortSignal;
}

async function doFetch(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = provider.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const branch = provider.getBranchId();
  if (branch && !headers['X-Branch-Id']) headers['X-Branch-Id'] = branch;
  try {
    return await fetch(BASE + path + buildQuery(opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Connexion au serveur impossible');
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  let res = await doFetch(path, opts);

  if (res.status === 401 && !opts.skipAuthRetry && !path.startsWith('/auth/')) {
    const newToken = await provider.refresh();
    if (newToken) res = await doFetch(path, opts);
    else {
      provider.onAuthFailure();
    }
  }

  if (opts.raw) {
    if (!res.ok) throw await toError(res);
    return { success: true, data: res as unknown as T };
  }
  if (!res.ok) throw await toError(res);
  return (await res.json()) as ApiEnvelope<T>;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError(res.status, body.code ?? 'ERROR', body.message ?? res.statusText, body.details);
  } catch {
    return new ApiError(res.status, 'HTTP_' + res.status, res.statusText || 'Erreur');
  }
}

export const api = {
  get: async <T>(path: string, query?: Query, signal?: AbortSignal) => (await request<T>(path, { query, signal })).data,
  page: async <T>(path: string, query?: Query, signal?: AbortSignal): Promise<Paginated<T>> => {
    const r = await request<T[]>(path, { query, signal });
    return { items: r.data, meta: r.meta ?? { page: 1, pageSize: r.data.length, total: r.data.length, totalPages: 1 } };
  },
  post: async <T>(path: string, body?: unknown, headers?: Record<string, string>) => (await request<T>(path, { method: 'POST', body: body ?? {}, headers })).data,
  put: async <T>(path: string, body?: unknown) => (await request<T>(path, { method: 'PUT', body })).data,
  patch: async <T>(path: string, body?: unknown) => (await request<T>(path, { method: 'PATCH', body })).data,
  delete: async <T>(path: string) => (await request<T>(path, { method: 'DELETE' })).data,
  /** Downloads a file (report export) and triggers the browser save dialog. */
  download: async (path: string, query?: Query, fallbackName = 'export') => {
    const res = (await request<Response>(path, { query, raw: true })).data;
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const name = decodeURIComponent(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1] ?? fallbackName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
