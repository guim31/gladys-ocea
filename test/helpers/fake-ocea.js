// -----------------------------------------------------------------------------
// A fake OCEA, behind a `fetch` function: the Azure AD B2C sign-in (cookies,
// CSRF, transaction id, PKCE) and the resident API. Tests never touch the
// network.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/ocea/${name}`, import.meta.url), 'utf8'));

export const TEST_EMAIL = 'resident@example.com';
export const TEST_PASSWORD = 'correct-horse-battery-staple';

const B2C_HOST = 'osbespaceresident.b2clogin.com';
const API_HOST = 'espace-resident-api.ocea-sb.com';
const TRANS_ID = 'StateProperties=eyJUSUQiOiJmYWtlLXRyYW5zYWN0aW9uIn0';
const CSRF = 'fake-csrf-token-value';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export function createFakeOcea({
  email = TEST_EMAIL,
  password = TEST_PASSWORD,
  resident = fixture('resident.json'),
  consos = { '00000000-0000-4000-8000-000000000001': fixture('consos-cetc.json') },
  local = fixture('local.json'),
} = {}) {
  const fake = {
    calls: [],
    signIns: 0,
    refreshes: 0,
    accessTokens: new Set(),
    refreshTokens: new Set(),
    pendingCodes: new Map(),
    apiStatus: 200,
    resident,
    consos,
    local,
    expiresIn: 3600,
    counter: 0,
  };

  function issueTokens() {
    fake.counter += 1;
    const access = `fake-access-token-${fake.counter}-abcdef`;
    const refresh = `fake-refresh-token-${fake.counter}-ghijkl`;
    fake.accessTokens.add(access);
    fake.refreshTokens.add(refresh);
    return json({ access_token: access, refresh_token: refresh, expires_in: fake.expiresIn });
  }

  function cookiesOf(init) {
    const header = init.headers?.Cookie ?? '';
    return Object.fromEntries(
      header
        .split(';')
        .map((part) => part.trim().split('='))
        .filter((pair) => pair[0]),
    );
  }

  async function b2c(url, init) {
    const path = url.pathname.toLowerCase();
    if (path.endsWith('/oauth2/v2.0/authorize') && !url.searchParams.has('hop')) {
      // A first hop, as B2C does, to check the cookies survive redirects.
      const next = new URL(url);
      next.searchParams.set('hop', '1');
      return new Response(null, {
        status: 302,
        headers: { location: next.toString(), 'set-cookie': 'x-ms-cpim-trans=fake-trans; path=/' },
      });
    }
    if (path.endsWith('/oauth2/v2.0/authorize')) {
      fake.challenge = url.searchParams.get('code_challenge');
      const cookies = cookiesOf(init);
      if (cookies['x-ms-cpim-trans'] !== 'fake-trans') {
        return new Response('missing trans cookie', { status: 400 });
      }
      const headers = new Headers();
      headers.append('set-cookie', `x-ms-cpim-csrf=${CSRF}; path=/; secure`);
      headers.append('set-cookie', 'x-ms-cpim-cache=abc; path=/');
      return new Response(
        `<html><script>var SETTINGS = {"transId":"${TRANS_ID}","api":"CombinedSigninAndSignup"};</script></html>`,
        {
          status: 200,
          headers,
        },
      );
    }
    if (path.endsWith('/selfasserted')) {
      // The raw `tx` value must arrive untouched.
      if (!url.search.includes(`tx=${TRANS_ID}&`) || init.headers['X-CSRF-TOKEN'] !== CSRF) {
        return new Response('bad request', { status: 400 });
      }
      if (cookiesOf(init)['x-ms-cpim-csrf'] !== CSRF) {
        return new Response('missing cookie', { status: 400 });
      }
      const form = new URLSearchParams(init.body);
      if (form.get('email') !== fake.email || form.get('password') !== fake.password) {
        return json({
          status: '400',
          errorCode: 'AADB2C90225',
          message: 'Invalid username or password.',
        });
      }
      fake.credentialsAccepted = true;
      return json({ status: '200' });
    }
    if (path.endsWith('/api/combinedsigninandsignup/confirmed')) {
      if (!fake.credentialsAccepted) {
        return new Response('no', { status: 400 });
      }
      fake.credentialsAccepted = false;
      const code = `fake-code-${fake.counter + 1}`;
      fake.pendingCodes.set(code, fake.challenge);
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://espace-resident.ocea-sb.com/#state=x&client_info=y&code=${code}`,
        },
      });
    }
    if (path.endsWith('/oauth2/v2.0/token')) {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'authorization_code') {
        const challenge = fake.pendingCodes.get(form.get('code'));
        const computed = createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url');
        if (!challenge || challenge !== computed) {
          return json({ error: 'invalid_grant' }, 400);
        }
        fake.pendingCodes.delete(form.get('code'));
        fake.signIns += 1;
        return issueTokens();
      }
      if (form.get('grant_type') === 'refresh_token') {
        if (!fake.refreshTokens.has(form.get('refresh_token'))) {
          return json({ error: 'invalid_grant' }, 400);
        }
        fake.refreshTokens.delete(form.get('refresh_token'));
        fake.refreshes += 1;
        return issueTokens();
      }
    }
    return new Response('not found', { status: 404 });
  }

  function api(url, init) {
    const token = (init.headers?.Authorization ?? '').replace(/^Bearer /, '');
    if (!fake.accessTokens.has(token)) {
      return json({ message: 'Unauthorized' }, 401);
    }
    if (fake.apiStatus !== 200) {
      return json({ IsOnline: false, ErrorMessage: 'Maintenance' }, fake.apiStatus);
    }
    if (url.pathname === '/api/v1/resident') {
      return json(fake.resident);
    }
    const consos = url.pathname.match(/^\/api\/v1\/local\/([^/]+)\/dashboard\/consos$/);
    if (consos) {
      const id = decodeURIComponent(consos[1]);
      return id in fake.consos ? json(fake.consos[id]) : json({ message: 'not found' }, 404);
    }
    if (/^\/api\/v1\/local\/[^/]+$/.test(url.pathname)) {
      return json(fake.local);
    }
    return json({ message: 'not found' }, 404);
  }

  fake.email = email;
  fake.password = password;
  fake.fetch = async (input, init = {}) => {
    const url = new URL(input);
    fake.calls.push({ method: init.method ?? 'GET', host: url.host, path: url.pathname });
    if (url.host === B2C_HOST) {
      return b2c(url, init);
    }
    if (url.host === API_HOST) {
      return api(url, init);
    }
    throw new Error(`Unexpected request to ${url.host}`);
  };
  // Invalidate every access token, as if they had expired server-side.
  fake.expireAccessTokens = () => fake.accessTokens.clear();
  fake.apiCalls = () => fake.calls.filter((call) => call.host === API_HOST);
  return fake;
}

/** Manual timers: the tests decide when time passes. */
export function createManualTimers() {
  const timers = {
    pending: new Map(),
    nextId: 1,
    setTimeout(callback, delay) {
      const id = timers.nextId++;
      timers.pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.pending.delete(id);
    },
    delays() {
      return [...timers.pending.values()].map((timer) => timer.delay);
    },
    async runAll() {
      const due = [...timers.pending.entries()];
      timers.pending.clear();
      for (const [, timer] of due) {
        await timer.callback();
      }
    },
  };
  return timers;
}
