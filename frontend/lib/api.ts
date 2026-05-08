const TOKEN_KEY = "avanta_token";

export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  return base.replace(/\/$/, "");
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  auth = false,
): Promise<Response> {
  const url = `${getApiBase()}${path}`;
  const headers = new Headers(init.headers);
  if (auth) {
    const t = getStoredToken();
    if (t) headers.set("Authorization", `Bearer ${t}`);
  }
  return fetch(url, { ...init, headers });
}
