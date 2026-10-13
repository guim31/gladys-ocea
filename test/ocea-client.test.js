import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAuthorizationRedirect, signIn } from '../src/ocea/auth.js';
import { OceaClient } from '../src/ocea/client.js';
import { OceaApiError, OceaAuthError } from '../src/ocea/errors.js';
import { createJsonFile } from '../src/store.js';
import { TEST_EMAIL, TEST_PASSWORD, createFakeOcea } from './helpers/fake-ocea.js';

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-ocea-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('signIn walks the four B2C steps and returns the tokens', async () => {
  const ocea = createFakeOcea();
  const tokens = await signIn({ fetch: ocea.fetch, email: TEST_EMAIL, password: TEST_PASSWORD });
  assert.match(tokens.accessToken, /^fake-access-token-/);
  assert.match(tokens.refreshToken, /^fake-refresh-token-/);
  assert.ok(tokens.expiresAt > Date.now());
  assert.equal(ocea.signIns, 1);
});

test('a wrong password is reported as invalid credentials', async () => {
  const ocea = createFakeOcea();
  await assert.rejects(
    signIn({ fetch: ocea.fetch, email: TEST_EMAIL, password: 'wrong-password' }),
    (err) => err instanceof OceaAuthError && err.invalidCredentials === true,
  );
});

test('the authorization code is read from the fragment or the query', () => {
  assert.equal(parseAuthorizationRedirect('https://x/#state=a&code=abc'), 'abc');
  assert.equal(parseAuthorizationRedirect('https://x/?code=def'), 'def');
  assert.throws(
    () => parseAuthorizationRedirect('https://x/#error=access_denied&error_description=no'),
    (err) => err instanceof OceaAuthError && err.message.includes('access_denied'),
  );
  assert.throws(() => parseAuthorizationRedirect('https://x/'), OceaAuthError);
});

test('the client signs in once, then reuses the access token', async () => {
  const ocea = createFakeOcea();
  const client = new OceaClient({ email: TEST_EMAIL, password: TEST_PASSWORD, fetch: ocea.fetch });
  await client.getResident();
  await client.getConsumptions('00000000-0000-4000-8000-000000000001');
  assert.equal(ocea.signIns, 1);
  assert.equal(ocea.refreshes, 0);
});

test('an expired access token is renewed with the refresh token, not the password', async () => {
  const ocea = createFakeOcea();
  let now = Date.parse('2026-10-13T08:00:00Z');
  const client = new OceaClient({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    fetch: ocea.fetch,
    now: () => now,
  });
  await client.getResident();
  now += 2 * 3600 * 1000;
  await client.getResident();
  assert.equal(ocea.signIns, 1);
  assert.equal(ocea.refreshes, 1);
});

test('a 401 forces a renewal and retries once', async () => {
  const ocea = createFakeOcea();
  const client = new OceaClient({ email: TEST_EMAIL, password: TEST_PASSWORD, fetch: ocea.fetch });
  await client.getResident();
  ocea.expireAccessTokens();
  const resident = await client.getResident();
  assert.ok(Array.isArray(resident.occupations));
  assert.equal(ocea.refreshes, 1);
});

test('a refused refresh token falls back to a full sign-in', async () => {
  const ocea = createFakeOcea();
  const client = new OceaClient({ email: TEST_EMAIL, password: TEST_PASSWORD, fetch: ocea.fetch });
  await client.getResident();
  ocea.refreshTokens.clear();
  ocea.expireAccessTokens();
  await client.getResident();
  assert.equal(ocea.signIns, 2);
});

test('an API error carries the status only', async () => {
  const ocea = createFakeOcea();
  ocea.apiStatus = 503;
  const client = new OceaClient({ email: TEST_EMAIL, password: TEST_PASSWORD, fetch: ocea.fetch });
  await assert.rejects(client.getResident(), (err) => {
    assert.ok(err instanceof OceaApiError);
    assert.equal(err.status, 503);
    assert.equal(err.message, 'OCEA API error (HTTP 503)');
    return true;
  });
});

test('the session survives a restart, for the same account only', async (t) => {
  const dir = await tempDir(t);
  const ocea = createFakeOcea();
  const sessionStore = createJsonFile(dir, 'session.json');
  const first = new OceaClient({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    fetch: ocea.fetch,
    sessionStore,
  });
  await first.getResident();
  assert.equal(ocea.signIns, 1);

  // The file holds the refresh token and a hash of the e-mail, never the
  // e-mail nor the password, and only its owner can read it.
  const raw = await readFile(join(dir, 'session.json'), 'utf8');
  assert.ok(!raw.includes(TEST_EMAIL));
  assert.ok(!raw.includes(TEST_PASSWORD));
  assert.equal((await stat(join(dir, 'session.json'))).mode & 0o777, 0o600);

  const restarted = new OceaClient({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    fetch: ocea.fetch,
    sessionStore,
  });
  await restarted.getResident();
  assert.equal(ocea.signIns, 1, 'the restart reused the refresh token');
  assert.equal(ocea.refreshes, 1);

  // Another account in the configuration never reuses that session.
  ocea.email = 'other@example.com';
  const other = new OceaClient({
    email: 'other@example.com',
    password: TEST_PASSWORD,
    fetch: ocea.fetch,
    sessionStore,
  });
  await other.getResident();
  assert.equal(ocea.signIns, 2);
});
