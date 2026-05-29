const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export function apiUrl(path: string) {
  if (!apiBaseUrl) return path;
  const base = apiBaseUrl.replace(/\/$/, '');
  const nextPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${nextPath}`;
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
