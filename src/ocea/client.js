// -----------------------------------------------------------------------------
// OCEA resident API client: keeps a session (access + refresh tokens) and
// reads the resident, the dwellings and their consumptions.
//
// Endpoints of https://espace-resident-api.ocea-sb.com, as used by the
// resident portal (see the README credits):
//   GET /api/v1/resident                      the account and its occupations
//   GET /api/v1/local/{id}                    a dwelling (address, fluids)
//   GET /api/v1/local/{id}/dashboard/consos   one value per fluid
//
// The session survives restarts: the refresh token is stored under /data
// (see store.js) next to a hash of the e-mail it belongs to, so a new
// account in the configuration never reuses another account's session.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { OceaApiError, OceaAuthError } from './errors.js';
import { PORTAL_URL, USER_AGENT, refreshTokens, signIn } from './auth.js';

export const API_BASE = 'https://espace-resident-api.ocea-sb.com';

// Renew the access token this long before it expires.
const EXPIRY_MARGIN_MS = 60_000;

export const accountKey = (email) =>
  createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

export class OceaClient {
  /**
   * @param {object} options
   * @param {string} options.email
   * @param {string} options.password
   * @param {typeof fetch} [options.fetch]
   * @param {{ load(): Promise<object|null>, save(session: object|null): Promise<void> }} [options.sessionStore]
   * @param {() => number} [options.now]
   * @param {boolean} [options.freshSession] ignore the stored session: new
   *   credentials must be checked by a real sign-in, not hidden behind a
   *   refresh token that still works.
   */
  constructor({
    email,
    password,
    fetch: fetchImpl = globalThis.fetch,
    sessionStore,
    now = Date.now,
    freshSession = false,
  }) {
    this.email = email;
    this.password = password;
    this.fetch = fetchImpl;
    this.sessionStore = sessionStore;
    this.now = now;
    this.account = accountKey(email);
    this.tokens = null;
    this.loaded = freshSession;
    // One sign-in or refresh at a time.
    this.pendingTokens = null;
  }

  // Secret values to keep out of the logs (see redact.js).
  // The credentials also appear form-encoded in a request body.
  secrets() {
    const credentials = [this.email, this.password].flatMap((value) => [
      value,
      encodeURIComponent(value),
      new URLSearchParams({ v: value }).toString().slice(2),
    ]);
    return [...credentials, this.tokens?.accessToken, this.tokens?.refreshToken];
  }

  async loadSession() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    const stored = await this.sessionStore?.load().catch(() => null);
    if (stored && stored.account === this.account && typeof stored.refreshToken === 'string') {
      this.tokens = { accessToken: null, refreshToken: stored.refreshToken, expiresAt: 0 };
    }
  }

  async saveSession() {
    if (!this.sessionStore) {
      return;
    }
    await this.sessionStore.save(
      this.tokens?.refreshToken
        ? { account: this.account, refreshToken: this.tokens.refreshToken }
        : null,
    );
  }

  async renewTokens() {
    if (this.tokens?.refreshToken) {
      try {
        this.tokens = await refreshTokens({
          fetch: this.fetch,
          refreshToken: this.tokens.refreshToken,
          now: this.now,
        });
        await this.saveSession();
        return;
      } catch (err) {
        if (!(err instanceof OceaAuthError)) {
          throw err;
        }
        // Refresh token expired or revoked: sign in again below.
      }
    }
    this.tokens = await signIn({
      fetch: this.fetch,
      email: this.email,
      password: this.password,
      now: this.now,
    });
    await this.saveSession();
  }

  async accessToken({ force = false } = {}) {
    await this.loadSession();
    const valid =
      this.tokens?.accessToken && this.tokens.expiresAt - EXPIRY_MARGIN_MS > this.now() && !force;
    if (valid) {
      return this.tokens.accessToken;
    }
    if (!this.pendingTokens) {
      this.pendingTokens = this.renewTokens().finally(() => {
        this.pendingTokens = null;
      });
    }
    await this.pendingTokens;
    return this.tokens.accessToken;
  }

  async get(path) {
    let token = await this.accessToken();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetch(`${API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          Origin: PORTAL_URL,
          Referer: `${PORTAL_URL}/`,
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 401 && attempt === 0) {
        await response.arrayBuffer().catch(() => {});
        token = await this.accessToken({ force: true });
        continue;
      }
      if (response.status !== 200) {
        await response.arrayBuffer().catch(() => {});
        throw new OceaApiError(`OCEA API error (HTTP ${response.status})`, {
          status: response.status,
        });
      }
      try {
        return await response.json();
      } catch {
        throw new OceaApiError('OCEA API answered with invalid JSON', { status: 200 });
      }
    }
    throw new OceaApiError('OCEA API refused the session (HTTP 401)', { status: 401 });
  }

  getResident() {
    return this.get('/api/v1/resident');
  }

  getDwelling(dwellingId) {
    return this.get(`/api/v1/local/${encodeURIComponent(dwellingId)}`);
  }

  getConsumptions(dwellingId) {
    return this.get(`/api/v1/local/${encodeURIComponent(dwellingId)}/dashboard/consos`);
  }
}
