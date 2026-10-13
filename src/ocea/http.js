// -----------------------------------------------------------------------------
// Minimal HTTP helpers for the OCEA portal: a cookie jar and a request
// function that follows redirects by hand.
//
// The Azure AD B2C sign-in relies on cookies set along a chain of redirects
// (the CSRF token among them). `fetch` hides the intermediate responses when
// it follows redirects itself, so the cookies they set would be lost: every
// request here uses `redirect: 'manual'` and the jar records each hop.
// -----------------------------------------------------------------------------

export class CookieJar {
  constructor() {
    // host -> Map(name -> value). The portal only needs name/value pairs per
    // host: no path or expiry logic, the jar lives for one sign-in.
    this.hosts = new Map();
  }

  store(url, response) {
    const host = new URL(url).host;
    const setCookies =
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of setCookies) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      if (index <= 0) {
        continue;
      }
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!this.hosts.has(host)) {
        this.hosts.set(host, new Map());
      }
      this.hosts.get(host).set(name, value);
    }
  }

  get(url, name) {
    return this.hosts.get(new URL(url).host)?.get(name);
  }

  header(url) {
    const cookies = this.hosts.get(new URL(url).host);
    if (!cookies || cookies.size === 0) {
      return undefined;
    }
    return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  clear() {
    this.hosts.clear();
  }
}

const MAX_REDIRECTS = 10;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Send one request with the jar's cookies, record the cookies it sets.
 * Redirects are followed only when `follow` is true; `url` of the result is
 * the last URL reached (the B2C sign-in uses it as Referer).
 *
 * The URL is passed as a string on purpose: the B2C `tx` parameter carries a
 * raw `StateProperties=...` value whose `=` must not be re-encoded.
 */
export async function request(
  fetchImpl,
  jar,
  url,
  { method = 'GET', headers = {}, body, follow = false } = {},
) {
  let currentUrl = url;
  let currentMethod = method;
  let currentBody = body;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const cookie = jar.header(currentUrl);
    const response = await fetchImpl(currentUrl, {
      method: currentMethod,
      headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) },
      body: currentBody,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    jar.store(currentUrl, response);
    const location = response.headers.get('location');
    if (!follow || response.status < 300 || response.status >= 400 || !location) {
      return { response, url: currentUrl };
    }
    // Drain the body of the redirect so the connection can be reused.
    await response.arrayBuffer().catch(() => {});
    currentUrl = new URL(location, currentUrl).toString();
    currentMethod = 'GET';
    currentBody = undefined;
  }
  throw new Error('Too many redirects');
}
