const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fastapiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; orgId?: string | null } = {}
): Promise<T> {
  const { token, orgId, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'X-Clerk-Org-Id': orgId } : {}),
      ...(headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
