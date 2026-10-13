// -----------------------------------------------------------------------------
// Sign-in to the OCEA resident portal (Azure AD B2C), without a browser.
//
// Ported from the Home Assistant integration ha_ocea_smart_building by
// Triskae (MIT License, https://github.com/Triskae/ha_ocea_smart_building):
// same endpoints, same four steps, same headers. The portal is a browser
// application (MSAL.js, authorization code + PKCE): the flow below replays
// what the browser does.
//
//   1. GET the authorize page   -> cookies (CSRF) and the B2C `transId`
//   2. POST the credentials     -> SelfAsserted, checked by B2C
//   3. GET "confirmed"          -> redirect carrying the authorization code
//   4. POST the token endpoint  -> access and refresh tokens
//
// Nothing here logs: the caller decides what to say, and the errors carry
// fixed texts only (see errors.js).
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { CookieJar, request } from './http.js';
import { OceaAuthError } from './errors.js';

export const B2C_TENANT = 'osbespaceresident';
export const B2C_CLIENT_ID = '1cacfb15-0b3c-42cc-a662-736e4737e7d9';
export const B2C_SCOPE =
  'https://osbespaceresident.onmicrosoft.com/app-imago-espace-resident-back-prod/user_impersonation openid profile offline_access';
export const PORTAL_URL = 'https://espace-resident.ocea-sb.com';
export const B2C_BASE = `https://${B2C_TENANT}.b2clogin.com`;
const B2C_TENANT_PATH = `${B2C_BASE}/${B2C_TENANT}.onmicrosoft.com`;
export const B2C_AUTHORIZE = `${B2C_TENANT_PATH}/b2c_1a_signup_signin/oauth2/v2.0/authorize`;
export const B2C_TOKEN = `${B2C_TENANT_PATH}/b2c_1a_signup_signin/oauth2/v2.0/token`;
const B2C_POLICY = 'B2C_1A_SIGNUP_SIGNIN';

// A browser User-Agent, as the portal expects one, followed by a product
// token so OCEA can tell this client apart.
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/145.0.0.0 Safari/537.36 Gladys-OCEA-Smart-Building';

const base64Url = (buffer) => buffer.toString('base64url');

export function generatePkce() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier, 'ascii').digest());
  return { verifier, challenge };
}

function tokenHeaders() {
  return {
    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    Accept: 'application/json',
    Origin: PORTAL_URL,
    Referer: `${PORTAL_URL}/`,
    'User-Agent': USER_AGENT,
  };
}

/**
 * Normalize the token endpoint answer.
 * @returns {{ accessToken: string, refreshToken?: string, expiresAt: number }}
 */
function readTokens(json, now) {
  if (!json || typeof json.access_token !== 'string' || json.access_token === '') {
    throw new OceaAuthError('No access token received from OCEA');
  }
  const expiresIn = Number(json.expires_in);
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    // One hour when OCEA does not say: B2C access tokens live 60 minutes.
    expiresAt: now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
  };
}

/** Extract the authorization code from the redirect of step 3. */
export function parseAuthorizationRedirect(location) {
  const hashIndex = location.indexOf('#');
  const sources = [];
  if (hashIndex >= 0) {
    sources.push(new URLSearchParams(location.slice(hashIndex + 1)));
  }
  const queryIndex = location.indexOf('?');
  if (queryIndex >= 0) {
    const end = hashIndex > queryIndex ? hashIndex : location.length;
    sources.push(new URLSearchParams(location.slice(queryIndex + 1, end)));
  }
  for (const params of sources) {
    if (params.get('error')) {
      throw new OceaAuthError(`OCEA sign-in refused (${params.get('error')})`);
    }
    if (params.get('code')) {
      return params.get('code');
    }
  }
  throw new OceaAuthError('No authorization code in the OCEA redirect');
}

/**
 * Full sign-in with the e-mail and password of the resident portal.
 * @param {object} options
 * @param {typeof fetch} options.fetch
 * @param {string} options.email
 * @param {string} options.password
 * @param {() => number} [options.now]
 */
export async function signIn({ fetch: fetchImpl, email, password, now = Date.now }) {
  const jar = new CookieJar();
  const { verifier, challenge } = generatePkce();
  const state = base64Url(
    Buffer.from(
      JSON.stringify({
        id: randomBytes(16).toString('hex'),
        meta: { interactionType: 'redirect' },
      }),
    ),
  );
  const authorizeParams = new URLSearchParams({
    client_id: B2C_CLIENT_ID,
    scope: B2C_SCOPE,
    redirect_uri: PORTAL_URL,
    response_mode: 'fragment',
    response_type: 'code',
    'x-client-SKU': 'msal.js.browser',
    'x-client-VER': '3.10.0',
    client_info: '1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    nonce: randomBytes(16).toString('hex'),
    state,
  });

  // Step 1: the sign-in page sets the CSRF cookie and embeds the transaction.
  const { response: page, url: pageUrl } = await request(
    fetchImpl,
    jar,
    `${B2C_AUTHORIZE}?${authorizeParams}`,
    { headers: { 'User-Agent': USER_AGENT }, follow: true },
  );
  if (!page.ok) {
    throw new OceaAuthError(`OCEA sign-in page unavailable (HTTP ${page.status})`);
  }
  const html = await page.text();
  const csrf = jar.get(pageUrl, 'x-ms-cpim-csrf');
  if (!csrf) {
    throw new OceaAuthError('OCEA sign-in page without CSRF cookie');
  }
  const transMatch = html.match(/"transId"\s*:\s*"([^"]+)"/);
  if (!transMatch) {
    throw new OceaAuthError('OCEA sign-in page without transaction id');
  }
  const transId = transMatch[1];

  // Step 2: post the credentials. The URL is built by hand: `tx` holds a raw
  // `StateProperties=...` value whose `=` must stay as is.
  const selfAssertedUrl = `${B2C_TENANT_PATH}/${B2C_POLICY}/SelfAsserted?tx=${transId}&p=${B2C_POLICY}`;
  const { response: asserted } = await request(fetchImpl, jar, selfAssertedUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: B2C_BASE,
      Referer: pageUrl,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': USER_AGENT,
      'X-CSRF-TOKEN': csrf,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ request_type: 'RESPONSE', email, password }).toString(),
  });
  if (asserted.status !== 200) {
    throw new OceaAuthError(`OCEA sign-in failed (HTTP ${asserted.status})`);
  }
  const assertedText = await asserted.text();
  let assertedJson;
  try {
    assertedJson = assertedText.trim() ? JSON.parse(assertedText) : {};
  } catch {
    assertedJson = {};
  }
  if (assertedJson.status !== undefined && String(assertedJson.status) !== '200') {
    // B2C answers 200 with { status: "400", message } on wrong credentials.
    throw new OceaAuthError('OCEA rejected the e-mail or the password', {
      invalidCredentials: true,
    });
  }

  // Step 3: confirm, B2C redirects to the portal with the code.
  const confirmedUrl =
    `${B2C_TENANT_PATH}/${B2C_POLICY}/api/CombinedSigninAndSignup/confirmed` +
    `?rememberMe=false&csrf_token=${csrf}&tx=${transId}&p=${B2C_POLICY}`;
  const { response: confirmed } = await request(fetchImpl, jar, confirmedUrl, {
    headers: { Referer: pageUrl, 'User-Agent': USER_AGENT },
  });
  const location = confirmed.headers.get('location');
  if (!location) {
    throw new OceaAuthError(`No redirect after the OCEA sign-in (HTTP ${confirmed.status})`);
  }
  const code = parseAuthorizationRedirect(location);

  // Step 4: exchange the code for the tokens.
  const tokenResponse = await fetchImpl(B2C_TOKEN, {
    method: 'POST',
    headers: tokenHeaders(),
    body: new URLSearchParams({
      client_id: B2C_CLIENT_ID,
      redirect_uri: PORTAL_URL,
      scope: B2C_SCOPE,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      client_info: '1',
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (tokenResponse.status !== 200) {
    throw new OceaAuthError(`OCEA token exchange failed (HTTP ${tokenResponse.status})`);
  }
  return readTokens(await tokenResponse.json().catch(() => null), now);
}

/**
 * Renew the access token with the refresh token.
 * Throws an OceaAuthError when the refresh token is refused: the caller then
 * signs in again with the credentials.
 */
export async function refreshTokens({ fetch: fetchImpl, refreshToken, now = Date.now }) {
  const response = await fetchImpl(B2C_TOKEN, {
    method: 'POST',
    headers: tokenHeaders(),
    body: new URLSearchParams({
      client_id: B2C_CLIENT_ID,
      scope: B2C_SCOPE,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_info: '1',
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 200) {
    throw new OceaAuthError(`OCEA token refresh failed (HTTP ${response.status})`);
  }
  const tokens = readTokens(await response.json().catch(() => null), now);
  // B2C rotates the refresh token, but keep the old one if none came back.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}
