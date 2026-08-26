const UNLOCK_KEYS = ["unlock", "k"] as const;

function readParam(
  params: URLSearchParams,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

function hashSecret(hash: string): string | null {
  const body = hash.replace(/^#/, "");
  if (!body) return null;
  const fromParams = readParam(new URLSearchParams(body), UNLOCK_KEYS);
  if (fromParams) return fromParams;
  for (const key of UNLOCK_KEYS) {
    const prefix = `${key}=`;
    if (body.startsWith(prefix)) {
      const value = decodeURIComponent(body.slice(prefix.length)).trim();
      if (value) return value;
    }
  }
  return null;
}

function pathSecret(pathname: string): string | null {
  const match = pathname.match(/^\/unlock\/([^/]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

export function parseUnlockSecret(href: string): string | null {
  const url = new URL(href, "http://local.test");
  return (
    pathSecret(url.pathname) ??
    readParam(url.searchParams, UNLOCK_KEYS) ??
    hashSecret(url.hash)
  );
}

function stripUnlockFromUrl(): void {
  const url = new URL(window.location.href);
  for (const key of UNLOCK_KEYS) {
    url.searchParams.delete(key);
  }
  if (url.pathname === "/unlock" || url.pathname.startsWith("/unlock/")) {
    url.pathname = "/";
  }
  url.hash = "";
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

let consumedSecret: string | null = null;

export function takeUnlockSecret(): string | null {
  if (consumedSecret) return consumedSecret;
  if (typeof window === "undefined") return null;
  const secret = parseUnlockSecret(window.location.href);
  if (!secret) return null;
  stripUnlockFromUrl();
  consumedSecret = secret;
  return consumedSecret;
}
