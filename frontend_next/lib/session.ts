const TOKEN_KEY = 'safetrace_token';

export type UserProfile = {
  id: number;
  name: string;
  email: string;
  role?: string;
  phone?: string | null;
  avatar_url?: string | null;
  notification_prefs?: string | null;
};

export function readToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function authOnlyHeaders() {
  const headers: Record<string, string> = {};
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
