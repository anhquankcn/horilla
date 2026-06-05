const BASE = '/bff';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...init?.headers as Record<string, string> };
  if (init?.body && !(init.body instanceof FormData)) {
    headers['Content-Type'] ??= 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });

  if (res.status === 401) {
    window.location.href = `${import.meta.env.BASE_URL}login`;
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T = unknown>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
  delete: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  postForm: <T = unknown>(path: string, form: FormData) =>
    apiFetch<T>(path, { method: 'POST', body: form }),
};
